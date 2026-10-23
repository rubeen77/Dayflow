import { expect, test, type Page } from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { defaults, stamp, type Task } from '../src/lib/model';

async function today(page: Page) {
  return page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
}
async function data(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('dayflow');
      r.onsuccess = () => resolve(r.result);
      r.onerror = reject;
    });
    const tx = db.transaction(['tasks', 'events', 'meta', 'sessions'], 'readonly');
    const result: Record<string, any> = { version: db.version };
    const done = new Promise<Record<string, any>>((resolve, reject) => {
      tx.oncomplete = () => {
        db.close();
        resolve(result);
      };
      tx.onerror = reject;
    });
    for (const store of ['tasks', 'events', 'sessions']) {
      const r = tx.objectStore(store).getAll();
      r.onsuccess = () => {
        result[store] = r.result;
      };
    }
    const m = tx.objectStore('meta').get('state');
    m.onsuccess = () => {
      result.meta = m.result;
    };
    return done;
  });
}
async function capture(page: Page, text: string) {
  await page.goto('/#today');
  await page.getByLabel('Capturar desde Mi día').fill(text);
  await page.getByRole('button', { name: 'Revisar', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Así quedaría tu plan' })).toBeVisible();
}

test('la captura interpreta los ejemplos, permite cancelar y guarda solo tras confirmar', async ({
  page,
}) => {
  await capture(page, 'Estudiar programación mañana a las 17:00');
  await expect(page.getByLabel('Nombre interpretado')).toHaveValue('Estudiar programación');
  await expect(page.getByLabel('Hora interpretada')).toHaveValue('17:00');
  expect((await data(page)).tasks).toHaveLength(0);
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  expect((await data(page)).tasks).toHaveLength(0);
  await capture(page, 'Gimnasio lunes y miércoles a las 18:00');
  await expect(page.getByRole('combobox', { name: 'Repetición interpretada' })).toHaveValue(
    'custom',
  );
  await page.getByRole('button', { name: 'Confirmar y guardar' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  const stored = await data(page);
  expect(stored.events[0].weekdays).toEqual([1, 3]);
  expect(stored.events[0].recurrence).toBe('custom');
});

test('Mi día permite completar pendientes, registrar hábitos y conservar tarjetas al recargar', async ({
  page,
}) => {
  await capture(page, 'Entregar práctica hoy');
  await page.getByRole('button', { name: 'Confirmar y guardar' }).click();
  await page.getByRole('checkbox', { name: 'Completar Entregar práctica', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Completar Entregar práctica', exact: true }),
  ).not.toBeAttached();
  await page.goto('/#habits');
  await page.getByRole('button', { name: 'Nuevo hábito', exact: true }).click();
  await page.getByLabel('Nombre del hábito').fill('Leer sin prisa');
  const picker = page.locator('.weekday-picker button');
  for (let i = 0; i < 7; i++)
    if ((await picker.nth(i).getAttribute('aria-pressed')) === 'false') await picker.nth(i).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Crear', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.goto('/#today');
  await page.getByRole('button', { name: 'Leer sin prisa', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Leer sin prisa', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Personalizar Mi día' }).click();
  await page.getByLabel('Mostrar Pequeños rituales').click();
  await expect(page.getByLabel('Mostrar Pequeños rituales')).not.toBeChecked();
  await page.getByRole('button', { name: 'Subir Lo que viene mañana' }).click();
  await page.getByRole('button', { name: 'Listo', exact: true }).click();
  await page.reload();
  await expect(page.locator('[data-card="habits"]')).not.toBeAttached();
  expect((await data(page)).meta.settings.dashboard.order.indexOf('tomorrow')).toBe(3);
});

test('convierte una tarea en bloque sin duplicarla y completa ambos desde el calendario', async ({
  page,
}) => {
  await capture(page, 'Preparar informe');
  await page.getByRole('button', { name: 'Confirmar y guardar' }).click();
  await page.goto('/#tasks');
  await page.getByRole('button', { name: 'Acciones de Preparar informe' }).click();
  const day = await today(page);
  const next = await page.evaluate(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  await page.getByLabel('Fecha para planificar').fill(next);
  await page.getByRole('button', { name: 'Crear bloque de tiempo', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  const stored = await data(page);
  expect(stored.tasks).toHaveLength(1);
  expect(stored.events).toHaveLength(1);
  expect(stored.events[0].sourceTaskId).toBe(stored.tasks[0].id);
  await page.goto('/#calendar');
  await page.getByLabel('Buscar actividades').fill('Preparar informe');
  await page.locator('.search-result').filter({ hasText: 'Preparar informe' }).click();
  await expect(page.locator('.timeline-event')).toHaveCount(1);
  await page.locator('.timeline-event').click();
  await page.getByRole('button', { name: 'Marcar completada', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect((await data(page)).tasks[0].completedAt).not.toBeNull();
  expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test('el foco sigue activo al navegar y se puede pausar desde la barra persistente', async ({
  page,
}) => {
  await page.goto('/#focus');
  await page.getByLabel('Concentración (min)').fill('2');
  await page.getByRole('button', { name: 'Empezar sesión', exact: true }).click();
  await page.goto('/#calendar');
  await expect(
    page.getByRole('complementary', { name: 'Sesión de concentración activa' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Pausar sesión activa' }).click();
  await expect(page.getByRole('button', { name: 'Reanudar sesión activa' })).toBeVisible();
  const first = await data(page);
  expect(first.meta.focus.deadline).toBeNull();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Reanudar sesión activa' })).toBeVisible();
  await page.getByRole('button', { name: 'Reanudar sesión activa' }).click();
  await page.goto('/#focus');
  await expect(page.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
  expect((await data(page)).sessions).toHaveLength(0);
});

test('el calendario móvil tiene semana táctil sin desbordamientos y las estadísticas están vacías de logros', async ({
  page,
  isMobile,
}) => {
  await page.goto('/#calendar');
  await page.getByRole('button', { name: 'Semana', exact: true }).click();
  if (isMobile) {
    await expect(page.locator('.calendar-week-mobile')).toBeVisible();
    const last = page.locator('.calendar-week-mobile .week-strip button').last();
    await last.click();
    await expect(last).toHaveClass(/selected/);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/#stats');
  await expect(page.getByRole('heading', { name: 'Tu año, un día a la vez' })).toBeVisible();
  await expect(page.getByRole('img', { name: /Mapa anual de constancia: 0 días/ })).toBeVisible();
  await expect(page.locator('.achievement-list')).not.toBeAttached();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('migra los datos v1 al actualizar, cierra el navegador y conserva IDs y preferencias', async ({
  playwright,
  browserName,
}, info) => {
  await mkdir(info.project.outputDir, { recursive: true });
  const profile = await mkdtemp(join(info.project.outputDir, 'v1-'));
  const options = {
    headless: true,
    baseURL: 'http://localhost:4173',
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    viewport: { width: 390, height: 844 },
  };
  let context = await playwright[browserName].launchPersistentContext(profile, options);
  const legacyTask: Task = {
    id: 'stable-legacy-id',
    updatedAt: stamp(),
    title: 'Mi tarea conservada',
    date: null,
    time: null,
    deadline: null,
    duration: 30,
    priority: 'high',
    categoryId: 'personal',
    listId: 'inbox',
    tags: [],
    notes: 'Nota anterior intacta',
    subtasks: [{ id: 'stable-subtask', title: 'Primer paso', done: true }],
    recurrence: 'none',
    completedAt: null,
    doneDates: [],
    reminder: null,
  };
  const settings = defaults().settings;
  settings.name = 'Perfil anterior';
  try {
    let page = context.pages()[0] ?? (await context.newPage());
    await page.goto('/icon.svg');
    await page.evaluate(
      async ({ task, settings }) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const r = indexedDB.open('dayflow', 1);
          r.onupgradeneeded = () => {
            for (const s of ['events', 'tasks', 'habits', 'sessions', 'templates'])
              r.result.createObjectStore(s, { keyPath: 'id' });
            r.result.createObjectStore('meta');
          };
          r.onsuccess = () => resolve(r.result);
          r.onerror = reject;
        });
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(['tasks', 'meta'], 'readwrite');
          tx.objectStore('tasks').put(task);
          tx.objectStore('meta').put({ settings, focus: null, revision: 9 }, 'state');
          tx.oncomplete = () => resolve();
          tx.onerror = reject;
        });
        db.close();
      },
      { task: legacyTask, settings },
    );
    await page.goto('/#tasks');
    await expect(
      page.locator('.task-row-body').filter({ hasText: 'Mi tarea conservada' }),
    ).toBeVisible();
    const upgraded = await data(page);
    expect(upgraded.version).toBe(3);
    expect(upgraded.tasks[0]).toEqual(legacyTask);
    expect(upgraded.meta.revision).toBe(9);
    await context.close();
    context = await playwright[browserName].launchPersistentContext(profile, options);
    page = context.pages()[0] ?? (await context.newPage());
    await page.goto('/#settings');
    await expect(page.getByLabel('Cómo te llamas')).toHaveValue('Perfil anterior');
    expect((await data(page)).tasks[0]).toEqual(legacyTask);
  } finally {
    await context.close();
  }
});

test('pospone una tarea, filtra por fecha y completa subtareas y gestos sin abrir el editor', async ({
  page,
}) => {
  await page.goto('/#tasks');
  await page.getByRole('button', { name: 'Nueva tarea', exact: true }).click();
  await page.getByLabel('¿Qué necesitas hacer?').fill('Preparar entrega');
  await page.getByLabel('Nueva subtarea').fill('Revisar el borrador');
  await page.getByRole('button', { name: 'Añadir subtarea', exact: true }).click();
  await page.getByLabel('Nueva subtarea').fill('Paso descartado');
  await page.getByRole('button', { name: 'Añadir subtarea', exact: true }).click();
  await page.getByRole('button', { name: 'Eliminar Paso descartado', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect((await data(page)).tasks).toHaveLength(0);
  await page.getByRole('dialog').getByRole('button', { name: 'Crear', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page
    .locator('.inline-subtasks')
    .getByRole('checkbox', { name: 'Revisar el borrador', exact: true })
    .click();
  await expect(page.locator('.inline-subtasks').getByRole('checkbox')).toBeChecked();
  const before = await data(page);
  await page.getByRole('button', { name: 'Acciones de Preparar entrega' }).click();
  await page.getByRole('button', { name: 'Posponer para mañana', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  const after = await data(page);
  expect(after.tasks[0].id).toBe(before.tasks[0].id);
  expect(after.tasks[0].subtasks[0].done).toBe(true);
  expect(after.tasks[0].date).not.toBeNull();
  await page.getByLabel('Filtrar tareas por fecha').fill(after.tasks[0].date);
  await expect(page.locator('.task-row')).toHaveCount(1);
  await page.getByLabel('Filtrar tareas por fecha').fill(await today(page));
  await expect(page.locator('.task-row')).toHaveCount(0);
  await page.getByLabel('Filtrar tareas por fecha').fill('');
  const row = page.locator('.task-gesture');
  await row.dispatchEvent('pointerdown', { pointerType: 'touch', clientX: 60, clientY: 200 });
  await row.dispatchEvent('pointerup', { pointerType: 'touch', clientX: 180, clientY: 200 });
  await expect(page.locator('.task-row')).toHaveCount(0);
  expect((await data(page)).tasks[0].completedAt).not.toBeNull();
});

test('arrastra una actividad flexible a otra franja manteniendo ID y duración', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === 'webkit',
    'En el perfil de iPhone se verifica la alternativa táctil Editar / mover.',
  );
  await page.goto('/#calendar');
  await page.getByRole('button', { name: 'Nueva actividad', exact: true }).click();
  await page.getByLabel('Nombre de la actividad').fill('Bloque arrastrable');
  await page.getByLabel('Desde', { exact: true }).fill('14:00');
  await page.getByLabel('Hasta', { exact: true }).fill('15:00');
  await page.getByRole('dialog').getByRole('button', { name: 'Crear', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByLabel('Buscar actividades').fill('Bloque arrastrable');
  await page.locator('.search-result').click();
  const before = (await data(page)).events[0];
  const source = page.locator('.timeline-event');
  const target = page.getByRole('button', { name: 'Crear actividad a las 16:00', exact: true });
  await target.scrollIntoViewIfNeeded();
  await source.dragTo(target);
  await expect.poll(async () => (await data(page)).events[0].start).not.toBe('14:00');
  const after = (await data(page)).events[0];
  expect(after.id).toBe(before.id);
  const toMinutes = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  expect(toMinutes(after.end) - toMinutes(after.start)).toBe(60);
});
