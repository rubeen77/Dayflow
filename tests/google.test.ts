import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configuration, READ_SCOPES, WRITE_SCOPE } from '../server/google/config';
import { GoogleService, type Account } from '../server/google/service';
import { hash, seal, unseal, type Vault } from '../server/google/vault';
import { requireOrigin } from '../api/google/[action]';
import { defaults, stamp, type Activity } from '../src/lib/model';
import { agendaOn, eventsOn, freeSlots, minutes } from '../src/lib/dates';
import {
  applyGoogleSnapshot,
  googleDuration,
  googleOccurrences,
  previewGoogleSync,
  zonedParts,
} from '../src/lib/googleEvents';
import { exportBackup, IndexedDBRepository, parseBackup } from '../src/lib/storage';
import { executeGoogleMutation } from '../src/lib/googleMutations';
import type { GoogleEvent, GoogleMutation, GoogleSnapshot } from '../shared/google';
import { validateGoogleInterval } from '../server/google/time';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const account = (): Account => ({
  id: 'account',
  generation: 'generation',
  accessToken: 'test-access-only-on-server',
  refreshToken: 'test-refresh-only-on-server',
  expiresAt: Date.now() + 3600000,
  scopes: [...READ_SCOPES, WRITE_SCOPE],
  preferences: { selected: ['calendar'], writable: ['calendar'] },
  audit: [],
});
const remote = (overrides: Partial<GoogleEvent> = {}): GoogleEvent => ({
  id: 'g_stable',
  updatedAt: '2026-10-23T08:00:00.000Z',
  accountId: 'account',
  calendarId: 'calendar',
  calendarName: 'Pruebas de calendario',
  color: '#8eafff',
  eventId: 'instance_1',
  etag: '"v1"',
  title: 'Evento de prueba',
  description: '',
  location: '',
  start: { dateTime: '2026-10-23T09:00:00Z', timeZone: 'Europe/Madrid' },
  end: { dateTime: '2026-10-23T10:00:00Z', timeZone: 'Europe/Madrid' },
  editable: true,
  busy: true,
  ...overrides,
});
const snapshot = (events: GoogleEvent[]): GoogleSnapshot => ({
  accountId: 'account',
  calendarIds: ['calendar'],
  from: '2026-01-01T00:00:00.000Z',
  to: '2027-01-01T00:00:00.000Z',
  fetchedAt: stamp(),
  events,
});
function memoryVault() {
  const data = new Map<string, unknown>();
  return {
    data,
    get: vi.fn(async (key: string) => data.get(key) ?? null),
    put: vi.fn(async (key: string, value: unknown) => {
      data.set(key, structuredClone(value));
    }),
    take: vi.fn(async (key: string) => {
      const value = data.get(key);
      data.delete(key);
      return value ?? null;
    }),
    locked: vi.fn(async (_key: string, action: () => Promise<unknown>) => action()),
    accountIndex: vi.fn(async () => {}),
  };
}
function setupService() {
  const vault = memoryVault();
  return { vault, service: new GoogleService(vault as unknown as Vault) };
}
const calendar = {
  id: 'calendar',
  summary: 'Pruebas',
  backgroundColor: '#8eafff',
  timeZone: 'Europe/Madrid',
  accessRole: 'owner',
};
const providerEvent = {
  id: 'instance_1',
  etag: '"v1"',
  updated: '2026-10-23T08:00:00.000Z',
  summary: 'Evento',
  start: { dateTime: '2026-10-23T09:00:00Z' },
  end: { dateTime: '2026-10-23T10:00:00Z' },
  recurringEventId: 'series',
  originalStartTime: { dateTime: '2026-10-23T09:00:00Z' },
};
const mutation = (overrides: Partial<GoogleMutation> = {}): GoogleMutation => ({
  accountId: 'account',
  operation: 'create',
  operationId: crypto.randomUUID(),
  calendarId: 'calendar',
  draft: {
    title: 'Prueba',
    description: '',
    location: '',
    start: { dateTime: '2026-10-23T12:00:00', timeZone: 'Europe/Madrid' },
    end: { dateTime: '2026-10-23T13:00:00', timeZone: 'Europe/Madrid' },
  },
  confirmed: true,
  ...overrides,
});

describe('Seguridad del backend de Google', () => {
  it('rechaza orígenes inseguros, rutas en APP_ORIGIN y claves inválidas', () => {
    const env = {
      APP_ORIGIN: 'https://dayflow.example',
      GOOGLE_CLIENT_ID: 'client',
      GOOGLE_CLIENT_SECRET: 'secret',
      GOOGLE_TOKEN_ENCRYPTION_KEY: 'a'.repeat(64),
      UPSTASH_REDIS_REST_URL: 'https://redis.example',
      UPSTASH_REDIS_REST_TOKEN: 'private',
    };
    expect(configuration(env).configured).toBe(true);
    expect(configuration({ ...env, APP_ORIGIN: 'http://dayflow.example' }).configured).toBe(false);
    expect(configuration({ ...env, APP_ORIGIN: 'https://dayflow.example/path' }).configured).toBe(
      false,
    );
    expect(configuration({ ...env, GOOGLE_TOKEN_ENCRYPTION_KEY: 'weak' }).configured).toBe(false);
    expect(configuration({ ...env, APP_ORIGIN: 'http://localhost:4173' }).configured).toBe(true);
  });
  it('cifra los tokens y autentica el contexto y el contenido', () => {
    const key = 'a'.repeat(64);
    const encrypted = seal({ refreshToken: 'sensitive-token' }, key, 'account:1');
    expect(encrypted).not.toContain('sensitive-token');
    expect(unseal(encrypted, key, 'account:1')).toEqual({ refreshToken: 'sensitive-token' });
    expect(() => unseal(encrypted, key, 'account:2')).toThrow();
    expect(() => unseal(encrypted.slice(0, -5) + 'xxxxx', key, 'account:1')).toThrow();
  });
  it('impide peticiones mutantes entre sitios y exige la cabecera CSRF', () => {
    expect(() =>
      requireOrigin(
        { headers: { origin: 'https://evil.example', 'x-dayflow-request': '1' } },
        'https://dayflow.example',
      ),
    ).toThrow('origen');
    expect(() =>
      requireOrigin({ headers: { origin: 'https://dayflow.example' } }, 'https://dayflow.example'),
    ).toThrow('origen');
    expect(() =>
      requireOrigin(
        { headers: { origin: 'https://dayflow.example', 'x-dayflow-request': '1' } },
        'https://dayflow.example',
      ),
    ).not.toThrow();
  });
  it('prepara OAuth real con state, PKCE y permisos mínimos de lectura', async () => {
    vi.stubEnv('APP_ORIGIN', 'http://localhost:4173');
    vi.stubEnv('GOOGLE_CLIENT_ID', 'client');
    const { service, vault } = setupService();
    const url = new URL(await service.start('browser-binding', false, null));
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('scope')).not.toContain(WRITE_SCOPE + ' ');
    expect(url.searchParams.get('scope')!.split(' ')).toEqual(READ_SCOPES);
    expect(url.searchParams.get('access_type')).toBe('offline');
    const pending = vault.data.get(`oauth:${hash(url.searchParams.get('state')!)}`) as {
      verifier: string;
    };
    expect(url.searchParams.get('code_challenge')).toBe(
      Buffer.from(hash(pending.verifier), 'hex').toString('base64url'),
    );
    expect(url.search).not.toContain('client_secret');
  });
  it('consume state una sola vez y bloquea el callback en otro navegador antes de llamar a Google', async () => {
    vi.stubEnv('APP_ORIGIN', 'http://localhost:4173');
    vi.stubEnv('GOOGLE_CLIENT_ID', 'client');
    const { service } = setupService();
    const url = new URL(await service.start('browser-A', false, null));
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(
      service.callback(url.searchParams.get('state')!, 'browser-B', 'code'),
    ).rejects.toThrow('navegador');
    await expect(
      service.callback(url.searchParams.get('state')!, 'browser-A', 'code'),
    ).rejects.toThrow('caducado');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('invalida sesiones después de desconectar y cambiar la generación', async () => {
    const { service, vault } = setupService();
    vault.data.set('account:account', account());
    await expect(service.account({ accountId: 'account', generation: 'old' })).rejects.toThrow(
      'Vuelve a conectar',
    );
    expect((await service.account({ accountId: 'account', generation: 'generation' })).id).toBe(
      'account',
    );
    vault.data.delete('account:account');
    await expect(
      service.account({ accountId: 'account', generation: 'generation' }),
    ).rejects.toThrow('Vuelve a conectar');
  });
});

describe('API de Google: paginación, series y escrituras condicionales', () => {
  it('recorre todas las páginas sin inventar instancias ni duplicar IDs', async () => {
    const { service, vault } = setupService();
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes('calendarList')) return Response.json({ items: [calendar] });
      const query = new URL(url).searchParams;
      expect(query.get('singleEvents')).toBe('true');
      expect(query.get('showDeleted')).toBe('false');
      return query.has('pageToken')
        ? Response.json({
            items: [{ ...providerEvent, id: 'instance_2' }, { status: 'cancelled' }],
          })
        : Response.json({ items: [providerEvent], nextPageToken: 'next-page' });
    });
    vi.stubGlobal('fetch', fetcher);
    const first = await service.snapshot(account(), new Date('2026-10-23T00:00:00Z'));
    const second = await service.snapshot(account(), new Date('2026-10-23T00:00:00Z'));
    expect(first.events).toHaveLength(2);
    expect(second.events.map((e) => e.id)).toEqual(first.events.map((e) => e.id));
    expect(first.events[0].recurringEventId).toBe('series');
    expect(first.events[0].originalStartTime).toEqual(providerEvent.originalStartTime);
    expect(vault.data.has('snapshot:account')).toBe(true);
    expect(JSON.stringify(first)).not.toContain('test-access');
  });
  it('no confirma una lectura parcial cuando falla una página', async () => {
    const { service, vault } = setupService();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('calendarList')
          ? Response.json({ items: [calendar] })
          : url.includes('pageToken')
            ? new Response('', { status: 503 })
            : Response.json({ items: [providerEvent], nextPageToken: 'page-2' }),
      ),
    );
    await expect(service.snapshot(account())).rejects.toThrow('No se han confirmado');
    expect(vault.data.has('snapshot:account')).toBe(false);
  });
  it('rechaza escribir sin opt-in, sin scope o desde otra cuenta', async () => {
    const { service } = setupService();
    const a = account();
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    a.preferences.writable = [];
    await expect(service.mutate(a, mutation())).rejects.toThrow('desactivada');
    a.preferences.writable = ['calendar'];
    a.scopes = READ_SCOPES;
    await expect(service.mutate(a, mutation())).rejects.toThrow('desactivada');
    await expect(service.mutate(account(), mutation({ accountId: 'different' }))).rejects.toThrow(
      'otra cuenta',
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('usa un ID estable al crear y recupera la respuesta de un reintento', async () => {
    const { service } = setupService();
    const m = mutation();
    const posts: Record<string, unknown>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        if (url.includes('calendarList')) return Response.json({ items: [calendar] });
        const body = JSON.parse(init.body as string);
        posts.push(body);
        return Response.json({ ...providerEvent, id: body.id });
      }),
    );
    const first = await service.mutate(account(), m);
    const again = await service.mutate(account(), m);
    expect(again).toEqual(first);
    expect(posts).toHaveLength(1);
    expect(posts[0].id).toBe(hash(`account:${m.operationId}`));
    await expect(
      service.mutate(account(), { ...m, draft: { ...m.draft!, title: 'Changed' } }),
    ).rejects.toThrow('otros datos');
  });
  it('recupera un insert que Google confirmó antes de perderse la respuesta del servidor', async () => {
    const { service } = setupService();
    const m = mutation();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        if (url.includes('calendarList')) return Response.json({ items: [calendar] });
        if (init.method === 'POST') return new Response('', { status: 409 });
        return Response.json({
          ...providerEvent,
          id: hash(`account:${m.operationId}`),
          extendedProperties: { private: { dayflowOperation: m.operationId } },
        });
      }),
    );
    expect((await service.mutate(account(), m)).event?.eventId).toBe(
      hash(`account:${m.operationId}`),
    );
  });
  it('envía If-Match y rechaza el conflicto sin sobrescribir ni registrar éxito', async () => {
    const { service, vault } = setupService();
    const m = mutation({ operation: 'update', eventId: 'instance_1', etag: '"old"' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        if (url.includes('calendarList')) return Response.json({ items: [calendar] });
        if (init.method === 'PATCH') {
          expect(init.headers).toHaveProperty('If-Match', '"old"');
          return new Response('', { status: 412 });
        }
        return Response.json(providerEvent);
      }),
    );
    await expect(service.mutate(account(), m)).rejects.toThrow('No se ha sobrescrito');
    expect(vault.data.has(`operation:account:${m.operationId}`)).toBe(false);
  });
  it('elimina solo la instancia indicada y protege la versión con If-Match', async () => {
    const { service } = setupService();
    const m = mutation({
      operation: 'delete',
      eventId: 'instance_1',
      etag: '"v1"',
      draft: undefined,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        if (url.includes('calendarList')) return Response.json({ items: [calendar] });
        expect(url).toContain('/events/instance_1');
        expect(init.method).toBe('DELETE');
        expect(init.headers).toHaveProperty('If-Match', '"v1"');
        return new Response(null, { status: 204 });
      }),
    );
    expect((await service.mutate(account(), m)).deletedId).toBe(
      `g_${hash('account:calendar:instance_1')}`,
    );
  });
});

describe('Copia local de Google y compatibilidad de datos', () => {
  it('previsualiza altas/cambios/bajas y no toca datos personales; confirmar es idempotente', () => {
    const state = defaults();
    state.settings.name = 'Personal';
    state.googleEvents = [
      remote(),
      remote({ id: 'removed', eventId: 'removed' }),
      remote({ id: 'outside', start: { date: '2028-01-01' }, end: { date: '2028-01-02' } }),
    ];
    const snap = snapshot([
      remote({ title: 'Versión nueva', etag: '"v2"' }),
      remote({ id: 'new', eventId: 'new' }),
    ]);
    const original = structuredClone(state);
    const diff = previewGoogleSync(state, snap);
    expect(diff.added).toHaveLength(1);
    expect(diff.changed).toHaveLength(1);
    expect(diff.removed.map((e) => e.id)).toEqual(['removed']);
    expect(state).toEqual(original);
    applyGoogleSnapshot(state, snap, original.googleEvents);
    expect(state.googleEvents).toHaveLength(3);
    expect(state.settings.name).toBe('Personal');
    expect(state.events).toEqual([]);
    applyGoogleSnapshot(state, snap, structuredClone(state.googleEvents));
    expect(state.googleEvents).toHaveLength(3);
  });
  it('detecta cambios de otra pestaña entre vista previa y confirmación', () => {
    const state = defaults();
    state.googleEvents = [remote()];
    const base = structuredClone(state.googleEvents);
    state.googleEvents[0].etag = '"other-tab"';
    expect(() => applyGoogleSnapshot(state, snapshot([]), base)).toThrow('otra pestaña');
    expect(state.googleEvents).toHaveLength(1);
  });
  it('respeta días completos con final exclusivo y eventos que cruzan medianoche', () => {
    const state = defaults();
    state.googleEvents = [remote({ start: { date: '2026-10-23' }, end: { date: '2026-10-25' } })];
    expect(eventsOn(state, '2026-10-23')).toHaveLength(1);
    expect(eventsOn(state, '2026-10-24')).toHaveLength(1);
    expect(eventsOn(state, '2026-10-25')).toHaveLength(0);
    state.googleEvents = [
      remote({
        start: { dateTime: '2026-10-23T00:00:00Z' },
        end: { dateTime: '2026-10-25T00:00:00Z' },
      }),
    ];
    expect(googleOccurrences(state, '2026-10-24')[0].end).toBe('24:00');
  });
  it('convierte las horas con cambio de horario de Madrid sin desplazar la fecha civil', () => {
    expect(zonedParts('2026-10-25T00:30:00Z', 'Europe/Madrid')).toEqual({
      date: '2026-10-25',
      time: '02:30',
    });
    expect(zonedParts('2026-10-25T01:30:00Z', 'Europe/Madrid')).toEqual({
      date: '2026-10-25',
      time: '02:30',
    });
    expect(zonedParts('2026-10-24T22:30:00Z', 'Europe/Madrid').date).toBe('2026-10-25');
    expect(
      googleDuration(
        remote({
          start: { dateTime: '2026-10-25T02:30:00+02:00' },
          end: { dateTime: '2026-10-25T02:30:00+01:00' },
        }),
      ),
    ).toBe(60);
  });
  it('rechaza horarios inexistentes o ambiguos y acepta el desplazamiento original explícito', () => {
    const d = mutation().draft!;
    expect(() =>
      validateGoogleInterval({
        ...d,
        start: { dateTime: '2026-03-29T02:30:00', timeZone: 'Europe/Madrid' },
        end: { dateTime: '2026-03-29T04:00:00', timeZone: 'Europe/Madrid' },
      }),
    ).toThrow('no existe');
    expect(() =>
      validateGoogleInterval({
        ...d,
        start: { dateTime: '2026-10-25T02:30:00', timeZone: 'Europe/Madrid' },
        end: { dateTime: '2026-10-25T04:00:00', timeZone: 'Europe/Madrid' },
      }),
    ).toThrow('se repite');
    expect(() =>
      validateGoogleInterval({
        ...d,
        start: { dateTime: '2026-10-25T02:30:00+02:00', timeZone: 'Europe/Madrid' },
        end: { dateTime: '2026-10-25T02:30:00+01:00', timeZone: 'Europe/Madrid' },
      }),
    ).not.toThrow();
  });
  it('reserva los eventos ocupados e ignora los transparentes al calcular huecos', () => {
    const state = defaults();
    state.googleEvents = [remote()];
    const event = eventsOn(state, '2026-10-23')[0];
    expect(agendaOn(state, '2026-10-23')).toHaveLength(1);
    expect(
      freeSlots(eventsOn(state, '2026-10-23'), 0, 1440).reduce((n, s) => n + s.end - s.start, 0),
    ).toBe(1440 - (minutes(event.end) - minutes(event.start)));
    state.googleEvents[0].busy = false;
    expect(freeSlots(eventsOn(state, '2026-10-23'), 0, 1440)).toEqual([{ start: 0, end: 1440 }]);
  });
  it('suprime el original vinculado sin borrarlo y mantiene separadas las colecciones', () => {
    const state = defaults();
    state.events = [
      {
        id: 'local',
        updatedAt: stamp(),
        title: 'Original',
        date: '2026-10-23',
        start: '11:00',
        end: '12:00',
        allDay: false,
        categoryId: 'personal',
        fixed: false,
        recurrence: 'none',
        until: null,
        exceptions: [],
        completedDates: [],
        location: '',
        notes: '',
        timeZone: 'Europe/Madrid',
      } satisfies Activity,
    ];
    state.googleEvents = [remote()];
    state.google.links = [{ localEventId: 'local', date: '2026-10-23', googleId: 'g_stable' }];
    expect(eventsOn(state, '2026-10-23')).toHaveLength(1);
    expect(state.events).toHaveLength(1);
    state.googleEvents = [];
    expect(eventsOn(state, '2026-10-23')).toHaveLength(0);
    expect(state.events[0].title).toBe('Original');
  });
  it('persiste el cache y la auditoría tras cerrar y reabrir; JSON no contiene tokens', async () => {
    const name = `google-${crypto.randomUUID()}`;
    const db = new IndexedDBRepository(name);
    await db.transact((s) => applyGoogleSnapshot(s, snapshot([remote()]), []));
    db.close();
    const reopened = new IndexedDBRepository(name);
    const stored = await reopened.read();
    expect(stored.googleEvents[0].etag).toBe('"v1"');
    expect(stored.google.audit).toHaveLength(1);
    const json = exportBackup(stored);
    const backup = parseBackup(json);
    expect(backup.schemaVersion).toBe(3);
    expect(backup.state.googleEvents[0].id).toBe('g_stable');
    expect(json).not.toMatch(/accessToken|refreshToken|client_secret/);
    reopened.close();
  });
  it('no contacta con Google si no puede persistir la operación antes de enviarla', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const m = mutation();
    await expect(
      executeGoogleMutation({ id: m.operationId, mutation: m }, async () => false),
    ).rejects.toThrow('Google no ha sido modificado');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
