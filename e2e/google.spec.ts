import { expect, test, type Page } from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import type { GoogleEvent, GoogleSnapshot } from '../shared/google';
test.use({ serviceWorkers: 'block' });

// Provider fixtures exist only in tests. The production app never simulates OAuth or data.
function fixture(): GoogleEvent {
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
  return {
    id: 'g_test_stable',
    updatedAt: new Date().toISOString(),
    accountId: 'test-account',
    calendarId: 'test-calendar',
    calendarName: 'Calendario de pruebas',
    color: '#8eafff',
    eventId: 'test-instance',
    etag: '"v1"',
    title: 'Evento API de prueba',
    description: 'Fixture exclusiva de pruebas',
    location: '',
    start: { dateTime: `${day}T09:00:00Z`, timeZone: 'Europe/Madrid' },
    end: { dateTime: `${day}T10:00:00Z`, timeZone: 'Europe/Madrid' },
    recurringEventId: 'test-series',
    originalStartTime: { dateTime: `${day}T09:00:00Z` },
    editable: true,
    busy: true,
  };
}
async function mockProvider(page: Page, writable = false) {
  let events = [fixture()];
  let connected = true;
  let writes = 0;
  let conflict = false;
  let loseResponse = false;
  const preferences = { selected: ['test-calendar'], writable: writable ? ['test-calendar'] : [] };
  await page.route('**/api/google/**', async (route) => {
    const action = new URL(route.request().url()).pathname.split('/').at(-1);
    if (action === 'status')
      return route.fulfill({
        json: {
          configured: true,
          connected,
          accountId: 'test-account',
          writeGranted: writable,
          preferences,
        },
      });
    if (action === 'calendars')
      return route.fulfill({
        json: {
          calendars: [
            {
              id: 'test-calendar',
              summary: 'Calendario de pruebas',
              color: '#8eafff',
              timeZone: 'Europe/Madrid',
              accessRole: 'owner',
              primary: true,
            },
          ],
        },
      });
    if (action === 'preferences') return route.fulfill({ json: { preferences } });
    if (action === 'sync')
      return route.fulfill({
        json: {
          accountId: 'test-account',
          calendarIds: ['test-calendar'],
          from: '2026-01-01T00:00:00.000Z',
          to: '2028-12-31T00:00:00.000Z',
          fetchedAt: new Date().toISOString(),
          events,
        } satisfies GoogleSnapshot,
      });
    if (action === 'disconnect') {
      connected = false;
      return route.fulfill({ json: { disconnected: true } });
    }
    if (action === 'events') {
      const data = route.request().postDataJSON();
      writes++;
      if (conflict)
        return route.fulfill({
          status: 412,
          json: {
            error:
              'El evento ha cambiado en Google. No se ha sobrescrito. Sincroniza y revisa su versión actual.',
          },
        });
      if (data.operation === 'delete') {
        const id = events[0].id;
        events = [];
        return route.fulfill({ json: { deletedId: id } });
      }
      if (data.operation === 'create') {
        const created = {
          ...fixture(),
          id: `g_${data.operationId}`,
          eventId: data.operationId,
          title: data.draft.title,
          etag: '"created"',
        };
        events = [...events.filter((e) => e.id !== created.id), created];
        if (loseResponse) {
          loseResponse = false;
          return route.fulfill({
            status: 502,
            json: { error: 'Respuesta de prueba interrumpida después de crear.' },
          });
        }
        return route.fulfill({ json: { event: created } });
      }
      events = [
        {
          ...events[0],
          title: data.draft.title,
          etag: '"v2"',
          updatedAt: new Date().toISOString(),
        },
      ];
      return route.fulfill({ json: { event: events[0] } });
    }
    return route.fulfill({ status: 404, json: { error: 'Unknown test endpoint' } });
  });
  return {
    writes: () => writes,
    conflict: () => {
      conflict = true;
    },
    loseResponse: () => {
      loseResponse = true;
    },
    replace: (items: GoogleEvent[]) => {
      events = items;
    },
  };
}
async function cached(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('dayflow');
      r.onsuccess = () => resolve(r.result);
    });
    const tx = db.transaction(['googleEvents', 'meta']);
    const entries = tx.objectStore('googleEvents').getAll();
    const meta = tx.objectStore('meta').get('state');
    return new Promise<{ events: GoogleEvent[]; meta: Record<string, any> }>((resolve, reject) => {
      tx.oncomplete = () => {
        db.close();
        resolve({ events: entries.result, meta: meta.result });
      };
      tx.onabort = reject;
    });
  });
}
async function importFixture(page: Page) {
  await page.goto('/#settings');
  await page.getByRole('button', { name: 'Revisar sincronización', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Revisa tus eventos' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar sincronización', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
}
async function openRemote(page: Page) {
  await page.goto('/#calendar');
  await page.getByLabel('Buscar actividades').fill('Evento API de prueba');
  await page
    .getByRole('button')
    .filter({ has: page.getByText('Evento API de prueba', { exact: true }) })
    .click();
  await page.locator('.timeline-event').filter({ hasText: 'Evento API de prueba' }).click();
  await expect(page.getByRole('dialog', { name: 'Evento API de prueba' })).toBeVisible();
}

test('sin credenciales la API real indica configuración pendiente y nunca finge conectar', async ({
  page,
  request,
}) => {
  const response = await request.get('/api/google/status');
  const status = await response.json();
  test.skip(
    status.configured,
    'El entorno tiene credenciales reales; esta prueba comprueba el estado sin configurar.',
  );
  expect(status.connected).toBe(false);
  expect(status.missing.length).toBeGreaterThan(0);
  await page.goto('/#settings');
  await expect(
    page.getByText('Pendiente de configuración del servidor.', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Conectar Google Calendar', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Preparar Google Calendar' })).toBeVisible();
  expect((await cached(page)).events).toEqual([]);
});

test('importación revisable, cancelación, IDs estables y lectura desde calendario', async ({
  page,
}) => {
  await mockProvider(page);
  await page.goto('/#settings');
  await page.getByRole('button', { name: 'Revisar sincronización', exact: true }).click();
  expect((await cached(page)).events).toEqual([]);
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect((await cached(page)).events).toEqual([]);
  await importFixture(page);
  await importFixture(page);
  expect((await cached(page)).events.map((e) => e.id)).toEqual(['g_test_stable']);
  await openRemote(page);
  await expect(page.getByText('Solo lectura.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar en Google', exact: true })).toHaveCount(0);
});

test('la eliminación detectada en Google necesita confirmación antes de retirar la copia', async ({
  page,
}) => {
  const provider = await mockProvider(page);
  await importFixture(page);
  provider.replace([]);
  await page.getByRole('button', { name: 'Revisar sincronización', exact: true }).click();
  await expect(page.getByText('Retirar copia ·', { exact: false })).toBeVisible();
  expect((await cached(page)).events).toHaveLength(1);
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect((await cached(page)).events).toHaveLength(1);
  await importFixture(page);
  expect((await cached(page)).events).toHaveLength(0);
});

test('edición y eliminación exigen confirmación y actualizan la copia tras la respuesta', async ({
  page,
}) => {
  const provider = await mockProvider(page, true);
  await importFixture(page);
  await openRemote(page);
  await page.getByRole('button', { name: 'Editar en Google', exact: true }).click();
  await page.getByLabel('Título', { exact: true }).fill('Edición de prueba');
  await expect(page.getByRole('button', { name: 'Confirmar y guardar en Google' })).toBeDisabled();
  expect(provider.writes()).toBe(0);
  await page.getByRole('checkbox', { name: 'Confirmo estos cambios en Google.' }).check();
  await page.getByRole('button', { name: 'Confirmar y guardar en Google' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect((await cached(page)).events[0].title).toBe('Edición de prueba');
  await page.locator('.timeline-event').filter({ hasText: 'Edición de prueba' }).click();
  await page.getByRole('button', { name: 'Eliminar en Google', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Confirmo la eliminación en Google.' }).check();
  await page.getByRole('button', { name: 'Confirmar eliminación', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect((await cached(page)).events).toHaveLength(0);
  expect(provider.writes()).toBe(2);
});

test('un conflicto 412 conserva el evento local y mantiene visible la edición', async ({
  page,
}) => {
  const provider = await mockProvider(page, true);
  await importFixture(page);
  provider.conflict();
  await openRemote(page);
  await page.getByRole('button', { name: 'Editar en Google', exact: true }).click();
  await page.getByLabel('Título', { exact: true }).fill('Cambio que no debe aplicarse');
  await page.getByRole('checkbox', { name: 'Confirmo estos cambios en Google.' }).check();
  await page.getByRole('button', { name: 'Confirmar y guardar en Google' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'No se ha sobrescrito' })).toBeVisible();
  expect((await cached(page)).events[0].etag).toBe('"v1"');
  expect((await cached(page)).meta.google.outbox).toEqual([]);
});

test('desconectar conserva el cache y la exportación JSON sin credenciales', async ({ page }) => {
  await mockProvider(page);
  await importFixture(page);
  await page.getByRole('button', { name: 'Desconectar Google', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar desconexión', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect((await cached(page)).events).toHaveLength(1);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar copia JSON', exact: true }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const json = Buffer.concat(chunks).toString('utf8');
  expect(JSON.parse(json).state.googleEvents[0].id).toBe('g_test_stable');
  expect(json).not.toMatch(/access_token|refresh_token|client_secret|accessToken|refreshToken/);
});

test('cache Google entre procesos de navegador y consulta sin conexión', async ({
  playwright,
  browserName,
}, testInfo) => {
  await mkdir(testInfo.project.outputDir, { recursive: true });
  const profile = await mkdtemp(join(testInfo.project.outputDir, 'g-'));
  const options = {
    baseURL: 'http://localhost:4173',
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block' as const,
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    ...(browserName === 'webkit' ? { isMobile: true, hasTouch: true } : {}),
  };
  let context = await playwright[browserName].launchPersistentContext(profile, options);
  try {
    let page = context.pages()[0] ?? (await context.newPage());
    await mockProvider(page);
    await importFixture(page);
    const initial = (await cached(page)).events;
    await context.close();
    context = await playwright[browserName].launchPersistentContext(profile, options);
    page = context.pages()[0] ?? (await context.newPage());
    await page.goto('http://localhost:4173/#calendar');
    await page.locator('h1').waitFor();
    expect((await cached(page)).events).toEqual(initial);
    await context.setOffline(true);
    await page.getByLabel('Buscar actividades').fill('Evento API de prueba');
    await expect(page.getByText('Evento API de prueba', { exact: true })).toBeVisible();
    const sizes = await page.evaluate(() => ({
      width: innerWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(sizes.content).toBeLessThanOrEqual(sizes.width + 1);
  } finally {
    await context.close();
  }
});

test('enviar una actividad conserva el original y recupera una respuesta perdida sin duplicar bloques', async ({
  page,
}) => {
  const provider = await mockProvider(page, true);
  await page.goto('/');
  await page.getByRole('button', { name: 'Planificar mi día', exact: true }).click();
  await page.getByLabel('Nombre de la actividad').fill('Publicación de prueba');
  await page.getByRole('button', { name: 'Crear', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.locator('.timeline-event').filter({ hasText: 'Publicación de prueba' }).click();
  await page
    .getByRole('button', { name: 'Enviar esta actividad a Google Calendar', exact: true })
    .click();
  await page.getByRole('checkbox', { name: 'Confirmo estos cambios en Google.' }).check();
  provider.loseResponse();
  await page.getByRole('button', { name: 'Confirmar y guardar en Google' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'interrumpida' })).toBeVisible();
  const queued = (await cached(page)).meta.google.outbox;
  expect(queued).toHaveLength(1);
  await page.getByRole('button', { name: 'Cerrar', exact: true }).last().click();
  await page.goto('/#settings');
  await page.getByRole('button', { name: 'Revisar: Publicación de prueba', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Confirmo estos cambios en Google.' }).check();
  await page.getByRole('button', { name: 'Confirmar y guardar en Google' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  const stored = await cached(page);
  expect(stored.events).toHaveLength(1);
  expect(stored.meta.google.outbox).toHaveLength(0);
  expect(stored.meta.google.links).toHaveLength(1);
  expect(provider.writes()).toBe(2);
  await page.goto('/#today');
  await expect(
    page.locator('.timeline-event').filter({ hasText: 'Publicación de prueba' }),
  ).toHaveCount(1);
});
