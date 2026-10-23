import { OAuth2Client } from 'google-auth-library';
import {
  calendarSchema,
  googleEventSchema,
  snapshotSchema,
  type GoogleCalendar,
  type GoogleEvent,
  type GoogleMutation,
  type GooglePreferences,
  type GoogleSnapshot,
} from '../../shared/google.js';
import { HttpError, READ_SCOPES, WRITE_SCOPE, configuration } from './config.js';
import { Vault, hash, random } from './vault.js';
import { validateGoogleInterval } from './time.js';

export interface Account {
  id: string;
  generation: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes: string[];
  preferences: GooglePreferences;
  audit: { at: string; operation: string; event: string }[];
}
export interface Session {
  accountId: string;
  generation: string;
}
interface OAuthState {
  binding: string;
  verifier: string;
  write: boolean;
  session: Session | null;
}
interface ProviderEvent {
  id: string;
  etag: string;
  updated?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: GoogleEvent['start'];
  end?: GoogleEvent['end'];
  recurringEventId?: string;
  originalStartTime?: GoogleEvent['start'];
  htmlLink?: string;
  status?: string;
  eventType?: string;
  locked?: boolean;
  transparency?: string;
  extendedProperties?: { private?: Record<string, string> };
}
export async function providerFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(12000), redirect: 'error' });
}
export class GoogleService {
  constructor(public vault = new Vault()) {}
  async account(session: Session | null) {
    const account = session && (await this.vault.get<Account>(`account:${session.accountId}`));
    if (!account || account.generation !== session?.generation)
      throw new HttpError(401, 'Vuelve a conectar Google Calendar. Tu copia local se conserva.');
    return account;
  }
  async start(binding: string, write: boolean, session: Session | null) {
    if (write && !session) throw new HttpError(401, 'Conecta primero Google en modo lectura.');
    const state = random();
    const verifier = random();
    await this.vault.put(
      `oauth:${hash(state)}`,
      { binding: hash(binding), verifier, write, session } satisfies OAuthState,
      600,
    );
    const cfg = configuration();
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    const challenge = Buffer.from(hash(verifier), 'hex').toString('base64url');
    const query = {
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: cfg.redirectUri,
      response_type: 'code',
      access_type: 'offline',
      include_granted_scopes: 'true',
      prompt: 'consent',
      scope: [...READ_SCOPES, ...(write ? [WRITE_SCOPE] : [])].join(' '),
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    };
    url.search = new URLSearchParams(query).toString();
    return url.toString();
  }
  async callback(state: string, binding: string, code: string) {
    // A state can be used exactly once, even across concurrent serverless instances.
    const pending = await this.vault.take<OAuthState>(`oauth:${hash(state)}`);
    if (!pending || pending.binding !== hash(binding))
      throw new HttpError(400, 'La autorización ha caducado o no corresponde a este navegador.');
    if (pending.session) await this.account(pending.session);
    const response = await providerFetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: configuration().redirectUri,
        grant_type: 'authorization_code',
        code_verifier: pending.verifier,
      }),
    });
    if (!response.ok)
      throw new HttpError(
        400,
        'Google no ha podido completar la autorización. Inténtalo de nuevo.',
      );
    const tokens = await response.json();
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const sub = ticket.getPayload()?.sub;
    if (!sub || !tokens.access_token)
      throw new HttpError(401, 'No se pudo verificar la identidad de Google.');
    const accountId = hash(`${process.env.GOOGLE_CLIENT_ID}:${sub}`);
    if (pending.session && pending.session.accountId !== accountId)
      throw new HttpError(
        409,
        'Has elegido otra cuenta. Desconecta la anterior antes de cambiar de cuenta.',
      );
    return this.vault.locked(`account:${accountId}`, async () => {
      const existing = await this.vault.get<Account>(`account:${accountId}`);
      const scopes: string[] =
        tokens.scope?.split(' ') ?? (await client.getTokenInfo(tokens.access_token)).scopes;
      if (
        !scopes.includes(READ_SCOPES[1]) ||
        !(scopes.includes(READ_SCOPES[2]) || scopes.includes(WRITE_SCOPE))
      )
        throw new HttpError(
          403,
          'Faltan permisos de lectura. Vuelve a conectar y autoriza la lista de calendarios y sus eventos.',
        );
      const account: Account = {
        id: accountId,
        generation: existing?.generation ?? random(),
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? existing?.refreshToken ?? '',
        expiresAt: Date.now() + Number(tokens.expires_in ?? 3600) * 1000,
        scopes,
        preferences: existing?.preferences ?? { selected: [], writable: [] },
        audit: existing?.audit ?? [],
      };
      if (!account.refreshToken)
        throw new HttpError(
          400,
          'Google no ha entregado acceso sin conexión. Revoca el acceso anterior a DAYFLOW en Google y vuelve a conectar.',
        );
      await this.vault.put(`account:${accountId}`, account);
      await this.vault.accountIndex(accountId, true);
      const sessionId = random();
      await this.vault.put(
        `session:${hash(sessionId)}`,
        { accountId, generation: account.generation } satisfies Session,
        30 * 86400,
      );
      return sessionId;
    });
  }
  async refresh(account: Account) {
    if (account.expiresAt > Date.now() + 60000) return;
    const response = await providerFetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: account.refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!response.ok)
      throw new HttpError(
        401,
        'Google ha caducado o revocado el acceso. Vuelve a conectar; tus datos locales se conservan.',
      );
    const data = await response.json();
    if (!data.access_token) throw new HttpError(502, 'Google no ha devuelto un acceso válido.');
    account.accessToken = data.access_token;
    account.refreshToken = data.refresh_token ?? account.refreshToken;
    account.expiresAt = Date.now() + Number(data.expires_in ?? 3600) * 1000;
    await this.vault.put(`account:${account.id}`, account);
  }
  async api<T>(account: Account, path: string, init: RequestInit = {}): Promise<T> {
    await this.refresh(account);
    const response = await providerFetch(`https://www.googleapis.com/calendar/v3/${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
    if (!response.ok) {
      const messages: Record<number, string> = {
        401: 'Google ha revocado el acceso. Vuelve a conectar.',
        403: 'Google no permite esta operación. Revisa los permisos del calendario y la cuota de la API.',
        404: 'El evento o el calendario ya no existe. Sincroniza antes de continuar.',
        409: 'El evento ya existe. Sincroniza para comprobar su estado.',
        410: 'Este evento ha sido eliminado en Google. Sincroniza para revisar la copia local.',
        412: 'El evento ha cambiado en Google. No se ha sobrescrito. Sincroniza, revisa su versión actual y vuelve a editar.',
        429: 'Google ha limitado temporalmente las solicitudes. Vuelve a intentarlo más tarde.',
      };
      throw new HttpError(
        response.status,
        messages[response.status] ??
          'Google Calendar no ha podido completar la operación. No se han confirmado cambios locales.',
      );
    }
    return response.status === 204 ? (undefined as T) : response.json();
  }
  async calendars(account: Account): Promise<GoogleCalendar[]> {
    const items: GoogleCalendar[] = [];
    let page = '';
    do {
      const result = await this.api<{ items?: Record<string, unknown>[]; nextPageToken?: string }>(
        account,
        `users/me/calendarList?${new URLSearchParams({ maxResults: '250', ...(page ? { pageToken: page } : {}) })}`,
      );
      for (const item of result.items ?? []) {
        if (item.accessRole === 'freeBusyReader') continue;
        items.push(
          calendarSchema.parse({
            id: item.id,
            summary: item.summaryOverride ?? item.summary ?? 'Calendario',
            color: item.backgroundColor ?? '#8eafff',
            timeZone: item.timeZone ?? 'UTC',
            accessRole: item.accessRole,
            primary: !!item.primary,
          }),
        );
      }
      page = result.nextPageToken ?? '';
      if (items.length > 1000)
        throw new HttpError(413, 'Hay demasiados calendarios para esta conexión.');
    } while (page);
    return items;
  }
  normalize(account: Account, calendar: GoogleCalendar, event: ProviderEvent): GoogleEvent {
    return googleEventSchema.parse({
      id: `g_${hash(`${account.id}:${calendar.id}:${event.id}`)}`,
      updatedAt: event.updated ?? new Date().toISOString(),
      accountId: account.id,
      calendarId: calendar.id,
      calendarName: calendar.summary,
      color: calendar.color,
      eventId: event.id,
      etag: event.etag,
      title: event.summary ?? '(Sin título)',
      description: event.description ?? '',
      location: event.location ?? '',
      start: {
        ...event.start,
        ...(event.start?.dateTime ? { timeZone: event.start.timeZone ?? calendar.timeZone } : {}),
      },
      end: {
        ...event.end,
        ...(event.end?.dateTime ? { timeZone: event.end.timeZone ?? calendar.timeZone } : {}),
      },
      recurringEventId: event.recurringEventId,
      originalStartTime: event.originalStartTime,
      htmlLink: event.htmlLink,
      busy: event.transparency !== 'transparent',
      editable:
        ['owner', 'writer'].includes(calendar.accessRole) &&
        !event.locked &&
        (!event.eventType || event.eventType === 'default'),
    });
  }
  async snapshot(account: Account, now = new Date()): Promise<GoogleSnapshot> {
    const from = new Date(now);
    from.setUTCMonth(from.getUTCMonth() - 6);
    from.setUTCHours(0, 0, 0, 0);
    const to = new Date(now);
    to.setUTCMonth(to.getUTCMonth() + 18);
    to.setUTCHours(0, 0, 0, 0);
    const calendars = await this.calendars(account);
    const events: GoogleEvent[] = [];
    const deadline = Date.now() + 40000;
    for (const id of account.preferences.selected) {
      const calendar = calendars.find((c) => c.id === id);
      if (!calendar)
        throw new HttpError(
          409,
          'Un calendario seleccionado ya no está disponible. Revisa tu selección antes de sincronizar.',
        );
      let page = '';
      let pages = 0;
      do {
        if (++pages > 100 || Date.now() > deadline)
          throw new HttpError(
            503,
            'La lectura está tardando demasiado. No se ha aplicado una sincronización parcial. Selecciona menos calendarios e inténtalo de nuevo.',
          );
        const query = new URLSearchParams({
          singleEvents: 'true',
          showDeleted: 'false',
          maxResults: '2500',
          timeMin: from.toISOString(),
          timeMax: to.toISOString(),
          timeZone: 'UTC',
          ...(page ? { pageToken: page } : {}),
        });
        const result = await this.api<{ items?: ProviderEvent[]; nextPageToken?: string }>(
          account,
          `calendars/${encodeURIComponent(id)}/events?${query}`,
        );
        for (const event of result.items ?? [])
          if (event.status !== 'cancelled') events.push(this.normalize(account, calendar, event));
        if (events.length > 10000)
          throw new HttpError(
            413,
            'La selección supera 10.000 eventos. Reduce los calendarios seleccionados; tu copia local se conserva.',
          );
        page = result.nextPageToken ?? '';
      } while (page);
    }
    const result = snapshotSchema.parse({
      accountId: account.id,
      calendarIds: account.preferences.selected,
      from: from.toISOString(),
      to: to.toISOString(),
      fetchedAt: new Date().toISOString(),
      events,
    });
    if (Buffer.byteLength(JSON.stringify(result)) > 3500000)
      throw new HttpError(
        413,
        'La copia supera el tamaño de respuesta seguro. Selecciona menos calendarios.',
      );
    await this.vault.put(`snapshot:${account.id}`, result, 7 * 86400);
    return result;
  }
  async mutate(account: Account, mutation: GoogleMutation) {
    if (mutation.accountId !== account.id)
      throw new HttpError(403, 'Esta operación pertenece a otra cuenta de Google.');
    if (
      !account.scopes.includes(WRITE_SCOPE) ||
      !account.preferences.writable.includes(mutation.calendarId)
    )
      throw new HttpError(
        403,
        'La escritura está desactivada para este calendario. Actívala expresamente en Ajustes.',
      );
    const calendar = (await this.calendars(account)).find((c) => c.id === mutation.calendarId);
    if (!calendar || !['owner', 'writer'].includes(calendar.accessRole))
      throw new HttpError(403, 'Este calendario solo permite lectura.');
    const operationKey = `operation:${account.id}:${mutation.operationId}`;
    const digest = hash(JSON.stringify(mutation));
    const previous = await this.vault.get<{
      digest: string;
      result: { event?: GoogleEvent; deletedId?: string };
    }>(operationKey);
    if (previous) {
      if (previous.digest !== digest)
        throw new HttpError(409, 'Esta operación ya se utilizó con otros datos.');
      return previous.result;
    }
    const root = `calendars/${encodeURIComponent(calendar.id)}/events`;
    const target = `${root}/${encodeURIComponent(mutation.eventId ?? '')}`;
    let result: { event?: GoogleEvent; deletedId?: string };
    if (mutation.operation === 'delete') {
      try {
        await this.api(account, target, {
          method: 'DELETE',
          headers: { 'If-Match': mutation.etag! },
        });
      } catch (error) {
        if (!(error instanceof HttpError && [404, 410].includes(error.status))) throw error;
      }
      result = { deletedId: `g_${hash(`${account.id}:${calendar.id}:${mutation.eventId}`)}` };
    } else {
      const draft = mutation.draft!;
      validateGoogleInterval(draft);
      const body = {
        summary: draft.title,
        description: draft.description,
        location: draft.location,
        start: draft.start,
        end: draft.end,
      };
      let event: ProviderEvent;
      if (mutation.operation === 'create') {
        // Google accepts a caller supplied base32hex-compatible ID. A retry cannot duplicate it.
        const eventId = hash(`${account.id}:${mutation.operationId}`);
        try {
          event = await this.api(account, root, {
            method: 'POST',
            body: JSON.stringify({
              ...body,
              id: eventId,
              extendedProperties: { private: { dayflowOperation: mutation.operationId } },
            }),
          });
        } catch (error) {
          if (!(error instanceof HttpError && error.status === 409)) throw error;
          event = await this.api<ProviderEvent>(account, `${root}/${eventId}`);
          if (event.extendedProperties?.private?.dayflowOperation !== mutation.operationId)
            throw error;
        }
      } else {
        const current = await this.api<ProviderEvent>(account, target);
        if (current.locked || (current.eventType && current.eventType !== 'default'))
          throw new HttpError(
            403,
            'Este tipo de evento se gestiona directamente en Google Calendar.',
          );
        if (
          current.extendedProperties?.private?.dayflowOperation === mutation.operationId &&
          current.extendedProperties.private.dayflowDigest === digest
        )
          event = current;
        else
          event = await this.api(account, target, {
            method: 'PATCH',
            headers: { 'If-Match': mutation.etag! },
            body: JSON.stringify({
              ...body,
              extendedProperties: {
                private: {
                  ...current.extendedProperties?.private,
                  dayflowOperation: mutation.operationId,
                  dayflowDigest: digest,
                },
              },
            }),
          });
      }
      result = { event: this.normalize(account, calendar, event) };
    }
    // If a request dies after Google commits, retries remain safe (stable insert ID / If-Match).
    await this.vault.put(operationKey, { digest, result }, 30 * 86400);
    account.audit = [
      ...account.audit,
      {
        at: new Date().toISOString(),
        operation: mutation.operation,
        event: result.event?.id ?? result.deletedId!,
      },
    ].slice(-300);
    await this.vault.put(`account:${account.id}`, account);
    return result;
  }
}
