import { expect, test, type Page } from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';

async function localToday(page: Page) {
  return page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
}
async function stored(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('dayflow');
      r.onsuccess = () => resolve(r.result);
      r.onerror = reject;
    });
    const tx = db.transaction(['events', 'tasks', 'habits', 'sessions', 'meta'], 'readonly');
    const results: Record<string, unknown> = {};
    const done = new Promise<Record<string, unknown>>((resolve, reject) => {
      tx.oncomplete = () => {
        db.close();
        resolve(results);
      };
      tx.onerror = reject;
    });
    for (const name of ['events', 'tasks', 'habits', 'sessions']) {
      const r = tx.objectStore(name).getAll();
      r.onsuccess = () => {
        results[name] = r.result;
      };
    }
    const meta = tx.objectStore('meta').get('state');
    meta.onsuccess = () => {
      results.meta = meta.result;
    };
    return done;
  });
}

test('arranca sin registros ficticios y las secciones funcionan sin desbordar', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: /Buenos días|Buenas tardes|Buenas noches/ }),
  ).toBeVisible();
  await expect(page.getByText('Un día lleno de posibilidades')).toBeVisible();
  for (const [hash, heading] of [
    ['calendar', 'Tu calendario'],
    ['tasks', 'Tus tareas'],
    ['planner', 'Diseña tu semana'],
    ['habits', 'Pequeños rituales'],
    ['focus', 'Encuentra tu foco'],
    ['stats', 'Cada paso cuenta'],
    ['settings', 'A tu manera'],
  ]) {
    await page.goto(`/#${hash}`);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  const data = await stored(page);
  expect(data.events).toEqual([]);
  expect(data.tasks).toEqual([]);
  expect(data.sessions).toEqual([]);
  expect(errors).toEqual([]);
});

test('guarda actividad, tarea, hábito y perfil y los recupera tras cerrar todo el navegador', async ({
  playwright,
  browserName,
}, testInfo) => {
  // Windows WebKit adds origin-specific paths; keep the profile path below MAX_PATH.
  await mkdir(testInfo.project.outputDir, { recursive: true });
  const profile = await mkdtemp(join(testInfo.project.outputDir, 'p-'));
  const options = {
    headless: true,
    viewport: { width: browserName === 'webkit' ? 390 : 1440, height: 1000 },
    isMobile: browserName === 'webkit',
    hasTouch: browserName === 'webkit',
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    baseURL: 'http://localhost:4173',
  };
  let context = await playwright[browserName].launchPersistentContext(profile, options);
  try {
    let page = context.pages()[0] ?? (await context.newPage());
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: /Buenos días|Buenas tardes|Buenas noches/ }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Planificar mi día', exact: true }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByLabel('Nombre de la actividad').fill('Actividad de persistencia');
    await dialog.getByLabel('Desde', { exact: true }).fill('18:00');
    await dialog.getByLabel('Hasta', { exact: true }).fill('19:00');
    await dialog.getByLabel('Repetir', { exact: true }).selectOption('weekly');
    await dialog.getByRole('button', { name: 'Crear', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await page.goto('/#tasks');
    await page.getByLabel('Captura rápida').fill('Tarea de persistencia');
    await page.getByRole('button', { name: 'Capturar', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar y guardar', exact: true }).click();
    await expect(
      page.locator('.task-row-body').filter({ hasText: 'Tarea de persistencia' }),
    ).toBeVisible();
    await page.goto('/#habits');
    await page.getByRole('button', { name: 'Nuevo hábito', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('Nombre del hábito').fill('Hábito de persistencia');
    // Schedule all seven days so the current test date is always eligible.
    const weekdays = dialog.locator('.weekday-picker button');
    for (let n = 0; n < 7; n++)
      if ((await weekdays.nth(n).getAttribute('aria-pressed')) === 'false')
        await weekdays.nth(n).click();
    await dialog.getByRole('button', { name: 'Crear', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const today = await localToday(page);
    await page
      .getByRole('button', { name: `Hábito de persistencia, ${today}`, exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: `Hábito de persistencia, ${today}`, exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.goto('/#settings');
    await page.getByLabel('Cómo te llamas').fill('Perfil persistente');
    await page.getByRole('button', { name: 'Guardar preferencias', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Preferencias guardadas');
    const before = await stored(page);
    await context.close();
    context = await playwright[browserName].launchPersistentContext(profile, options);
    page = context.pages()[0] ?? (await context.newPage());
    await page.goto('/#settings');
    await expect(page.getByLabel('Cómo te llamas')).toHaveValue('Perfil persistente');
    const after = await stored(page);
    expect(after.events).toEqual(before.events);
    expect(after.tasks).toEqual(before.tasks);
    expect(after.habits).toEqual(before.habits);
    expect(after.meta).toEqual(before.meta);
    await page.goto('/#tasks');
    await expect(
      page.locator('.task-row-body').filter({ hasText: 'Tarea de persistencia' }),
    ).toBeVisible();
    await page.getByRole('checkbox', { name: 'Completar Tarea de persistencia' }).click();
    await page.getByRole('button', { name: /Completadas/ }).click();
    await expect(
      page.getByRole('checkbox', { name: 'Reabrir Tarea de persistencia' }),
    ).toHaveAttribute('aria-checked', 'true');
  } finally {
    await context.close();
  }
});

test('exporta e importa una copia JSON manteniendo los identificadores', async ({ page }) => {
  await page.goto('/#tasks');
  await page.getByLabel('Captura rápida').fill('Tarea de copia');
  await page.getByRole('button', { name: 'Capturar', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y guardar', exact: true }).click();
  await expect(page.locator('.task-row-body').filter({ hasText: 'Tarea de copia' })).toBeVisible();
  const before = await stored(page);
  await page.goto('/#settings');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar copia JSON', exact: true }).click();
  const download = await downloadEvent;
  const backupFile = await download.path();
  expect(backupFile).toBeTruthy();
  await page.getByLabel('Archivo de copia de seguridad').setInputFiles(backupFile!);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Combinar y guardar', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect((await stored(page)).tasks).toEqual(before.tasks);
});

test('el temporizador conserva su estado al recargar y registra una sesión sin duplicarla', async ({
  page,
}) => {
  await page.goto('/#focus');
  await page.getByLabel('Concentración (min)').fill('1');
  await page.clock.install();
  await page.getByRole('button', { name: 'Empezar sesión', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
  await page.clock.fastForward(61000);
  await expect(page.locator('.focus-mode .active')).toHaveText('Descanso');
  const data = await stored(page);
  expect(data.sessions).toHaveLength(1);
  await page.reload();
  await expect(page.locator('.focus-mode .active')).toHaveText('Descanso');
  expect((await stored(page)).sessions).toHaveLength(1);
});

test('la PWA abre, navega y guarda una tarea sin conexión', async ({ page, context }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: /Buenos días|Buenas tardes|Buenas noches/ }),
  ).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.goto('/#tasks');
  await expect(page.getByRole('heading', { name: 'Tus tareas', exact: true })).toBeVisible();
  await page.getByLabel('Captura rápida').fill('Capturada sin conexión');
  await page.getByRole('button', { name: 'Capturar', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y guardar', exact: true }).click();
  await expect(
    page.locator('.task-row-body').filter({ hasText: 'Capturada sin conexión' }),
  ).toBeVisible();
  await page.goto('/#planner');
  await expect(page.getByRole('heading', { name: 'Diseña tu semana', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Diseña tu semana', exact: true })).toBeVisible();
  expect((await stored(page)).tasks).toHaveLength(1);
});

test('un fallo de almacenamiento mantiene el formulario y no confirma el guardado', async ({
  page,
}) => {
  await page.addInitScript(() => {
    IDBObjectStore.prototype.put = function () {
      throw new DOMException('Sin espacio de prueba', 'QuotaExceededError');
    };
  });
  await page.goto('/#tasks');
  await page.getByRole('button', { name: 'Nueva tarea', exact: true }).click();
  await page.getByRole('dialog').getByLabel('¿Qué necesitas hacer?').fill('No debe guardarse');
  await page.getByRole('dialog').getByRole('button', { name: 'Crear', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('status')).not.toBeAttached();
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect((await stored(page)).tasks).toEqual([]);
});

test('crea subtareas y aplica únicamente las propuestas aceptadas del asistente', async ({
  page,
}) => {
  await page.goto('/#tasks');
  await page.getByRole('button', { name: 'Nueva tarea', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('¿Qué necesitas hacer?').fill('Preparación con pasos');
  await dialog.getByLabel('Nueva subtarea').fill('Revisar apuntes');
  await dialog.getByRole('button', { name: 'Añadir subtarea', exact: true }).click();
  await dialog.getByRole('checkbox', { name: 'Completar Revisar apuntes', exact: true }).check();
  await dialog.getByRole('button', { name: 'Crear', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByLabel('Captura rápida').fill('Mantener sin organizar');
  await page.getByRole('button', { name: 'Capturar', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y guardar', exact: true }).click();
  await expect(
    page.locator('.task-row-body').filter({ hasText: 'Mantener sin organizar' }),
  ).toBeVisible();
  await page.goto('/#planner');
  await page.getByRole('button', { name: 'Organizar mi semana', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Aceptar Preparación con pasos', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('checkbox', { name: 'Aceptar Mantener sin organizar', exact: true }).click();
  await page.getByRole('button', { name: 'Aplicar 1 cambios', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  const data = await stored(page);
  const tasks = data.tasks as {
    title: string;
    time: string | null;
    date: string | null;
    subtasks: { done: boolean }[];
  }[];
  expect(tasks.find((t) => t.title === 'Preparación con pasos')?.time).toMatch(/^\d{2}:\d{2}$/);
  expect(tasks.find((t) => t.title === 'Preparación con pasos')?.subtasks[0].done).toBe(true);
  expect(tasks.find((t) => t.title === 'Mantener sin organizar')?.date).toBeNull();
});

test('reprograma mediante la alternativa táctil, completa actividades y reutiliza plantillas', async ({
  page,
}) => {
  await page.goto('/#planner');
  await page.getByRole('button', { name: 'Nuevo bloque', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre de la actividad').fill('Bloque para reprogramar');
  await dialog.getByLabel('Desde', { exact: true }).fill('14:00');
  await dialog.getByLabel('Hasta', { exact: true }).fill('15:00');
  await dialog.getByRole('button', { name: 'Crear', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: /14:00 — 15:00.*Bloque para reprogramar/ }).click();
  await page.getByRole('button', { name: 'Editar / mover', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Desde', { exact: true }).fill('16:00');
  await dialog.getByLabel('Hasta', { exact: true }).fill('17:00');
  await dialog.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const moved = (await stored(page)).events as {
    id: string;
    start: string;
    completedDates: string[];
  }[];
  expect(moved[0].start).toBe('16:00');
  await page.getByRole('button', { name: /16:00 — 17:00.*Bloque para reprogramar/ }).click();
  await page.getByRole('button', { name: 'Marcar completada', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(((await stored(page)).events as typeof moved)[0].completedDates).toHaveLength(1);
  await page.getByRole('button', { name: 'Plantillas', exact: true }).click();
  await page.getByLabel('Nombre de la plantilla').fill('Semana reutilizable');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByText('Semana reutilizable', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.getByRole('button', { name: 'Fecha siguiente', exact: true }).click();
  await page.getByRole('button', { name: 'Plantillas', exact: true }).click();
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await page.getByRole('button', { name: 'Crear bloques de esta semana', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  const copied = (await stored(page)).events as typeof moved;
  expect(copied).toHaveLength(2);
  expect(new Set(copied.map((e) => e.id)).size).toBe(2);
  expect(copied.filter((e) => e.completedDates.length === 0)).toHaveLength(1);
});

test('respeta las recurrencias de tareas y encuentra repeticiones por su fecha', async ({
  page,
}) => {
  await page.goto('/#tasks');
  const today = await localToday(page);
  const future = await page.evaluate(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  await page.getByRole('button', { name: 'Nueva tarea', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('¿Qué necesitas hacer?').fill('Tarea recurrente');
  await dialog.getByLabel('Fecha (opcional)', { exact: true }).fill(future);
  await dialog.getByRole('combobox', { name: 'Repetir', exact: true }).selectOption('daily');
  await dialog.getByRole('button', { name: 'Crear', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Completar Tarea recurrente' })).toBeDisabled();
  await page.locator('.task-row-body').filter({ hasText: 'Tarea recurrente' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Fecha (opcional)', { exact: true }).fill(today);
  await dialog.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('checkbox', { name: 'Completar Tarea recurrente' }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Completar Tarea recurrente' }),
  ).not.toBeAttached();
  expect(((await stored(page)).tasks as { doneDates: string[] }[])[0].doneDates).toEqual([today]);
  await page.goto('/#calendar');
  await page.getByRole('button', { name: 'Nueva actividad', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre de la actividad').fill('Actividad semanal buscable');
  await dialog.getByRole('combobox', { name: 'Repetir', exact: true }).selectOption('weekly');
  await dialog.getByRole('button', { name: 'Crear', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByLabel('Buscar actividades').fill(future);
  await page.getByRole('button', { name: /Actividad semanal buscable/ }).click();
  await expect(
    page.locator('.timeline-event').filter({ hasText: 'Actividad semanal buscable' }),
  ).toBeVisible();
});
