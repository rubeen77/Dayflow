import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { defaults, stamp, stateSchema, type Activity, type Task } from '../src/lib/model';
import { parseCapture } from '../src/lib/capture';
import { agendaOn, eventsOn, freeSlots, minutes, taskDone } from '../src/lib/dates';
import {
  convertTaskToBlock,
  postponeTask,
  taskSlots,
  toggleActivity,
  toggleTask,
} from '../src/lib/actions';
import { dashboardLayout, summarizeDay } from '../src/lib/day';
import { focusRemaining, pauseOrResumeFocus, settleFocus } from '../src/lib/focus';
import { achievements, annualConsistency, weeklyComparison } from '../src/lib/insights';
import { exportBackup, IndexedDBRepository, parseBackup } from '../src/lib/storage';

const now = new Date(2026, 9, 23, 12, 0);
const task = (patch: Partial<Task> = {}): Task => ({
  id: 'task',
  updatedAt: stamp(),
  title: 'Pendiente',
  date: null,
  time: null,
  deadline: null,
  duration: 30,
  priority: 'medium',
  categoryId: 'personal',
  listId: 'inbox',
  tags: [],
  notes: '',
  subtasks: [],
  recurrence: 'none',
  completedAt: null,
  doneDates: [],
  reminder: null,
  ...patch,
});
const event = (patch: Partial<Activity> = {}): Activity => ({
  id: 'event',
  updatedAt: stamp(),
  title: 'Actividad',
  date: '2026-10-23',
  start: '13:00',
  end: '14:00',
  allDay: false,
  categoryId: 'personal',
  fixed: true,
  recurrence: 'none',
  until: null,
  exceptions: [],
  completedDates: [],
  location: '',
  notes: '',
  timeZone: 'Europe/Madrid',
  ...patch,
});

describe('Captura española determinista', () => {
  it('interpreta mañana y hora, conservando el nombre con acentos', () => {
    const draft = parseCapture(
      'Estudiar programación mañana a las 17:00',
      defaults().settings,
      now,
    );
    expect(draft).toMatchObject({
      title: 'Estudiar programación',
      date: '2026-10-24',
      time: '17:00',
      categoryId: 'study',
      recurrence: 'none',
    });
  });
  it('interpreta lunes y miércoles como dos días semanales reales', () => {
    const draft = parseCapture('Gimnasio lunes y miércoles a las 18:00', defaults().settings, now);
    expect(draft).toMatchObject({
      title: 'Gimnasio',
      kind: 'event',
      recurrence: 'custom',
      weekdays: [1, 3],
      date: '2026-10-26',
      time: '18:00',
    });
    const activity = event({ ...draft, date: draft.date!, start: draft.time!, end: '19:00' });
    expect(eventsOn({ events: [activity] }, '2026-10-26')).toHaveLength(1);
    expect(eventsOn({ events: [activity] }, '2026-10-27')).toHaveLength(0);
    expect(eventsOn({ events: [activity] }, '2026-10-28')).toHaveLength(1);
  });
  it('interpreta el viernes sin inventar una hora', () => {
    expect(
      parseCapture('Entregar práctica el viernes', defaults().settings, new Date(2026, 9, 21)),
    ).toMatchObject({
      title: 'Entregar práctica',
      date: '2026-10-23',
      time: null,
      recurrence: 'none',
    });
  });
  it('conserva títulos al eliminar expresiones de fecha que se solapan', () => {
    expect(
      parseCapture(
        'Estudiar de lunes a viernes a las 17:00 durante 45 minutos',
        defaults().settings,
        now,
      ),
    ).toMatchObject({ title: 'Estudiar', recurrence: 'weekdays', time: '17:00', duration: 45 });
  });
  it('señala fechas, horas y duraciones ambiguas o inválidas', () => {
    expect(
      parseCapture('Leer el 31/02/2026 a las 25:00', defaults().settings, now).warnings.length,
    ).toBeGreaterThan(0);
    expect(
      parseCapture('Leer a las 23:50 durante 45 minutos', defaults().settings, now).warnings.join(
        ' ',
      ),
    ).toContain('fuera del día');
  });
});

describe('Mi día y bloques enlazados', () => {
  it('resta tiempo transcurrido, solapamientos y bloques sin duplicar minutos', () => {
    const state = defaults();
    state.settings.sleep = '18:00';
    state.events = [
      event({ start: '13:00', end: '15:00' }),
      event({ id: 'two', start: '14:00', end: '16:00' }),
    ];
    const day = summarizeDay(state, '2026-10-23', now);
    expect(day.free).toBe(180);
    expect(day.next?.id).toBe('event');
    expect(summarizeDay(state, '2026-10-22', now).free).toBe(0);
  });
  it('ordena primero urgencias vencidas y permite configurar tarjetas sin campos previos', () => {
    const state = defaults();
    state.tasks = [task(), task({ id: 'urgent', date: '2026-10-26', deadline: '2026-10-22' })];
    expect(summarizeDay(state, '2026-10-23', now).pending[0].id).toBe('urgent');
    expect(dashboardLayout(state.settings).order).toHaveLength(6);
  });
  it('convierte una tarea una sola vez, conserva su ID y sincroniza completado en ambos sentidos', () => {
    const state = defaults();
    state.tasks = [task()];
    const block = convertTaskToBlock(state, 'task', '2026-10-23', '14:00', now);
    expect(state.tasks[0].id).toBe('task');
    expect(agendaOn(state, '2026-10-23')).toHaveLength(1);
    expect(() => convertTaskToBlock(state, 'task', '2026-10-23', '15:00', now)).toThrow('ya tiene');
    toggleActivity(state, block.id, '2026-10-23');
    expect(taskDone(state.tasks[0], '2026-10-23')).toBe(true);
    toggleTask(state, 'task', '2026-10-23');
    expect(state.events[0].completedDates).toEqual([]);
  });
  it('rechaza huecos ocupados y días de descanso de una tarea recurrente', () => {
    const state = defaults();
    state.events = [event()];
    state.tasks = [task()];
    expect(() => convertTaskToBlock(state, 'task', '2026-10-23', '13:30', now)).toThrow(
      'no está disponible',
    );
    state.tasks = [task({ date: '2026-10-19', recurrence: 'custom', weekdays: [1, 3] })];
    expect(() => convertTaskToBlock(state, 'task', '2026-10-23', '14:00', now)).toThrow(
      'día programado',
    );
  });
  it('recalcula huecos al cambiar la agenda y pospone sin alterar el historial', () => {
    const state = defaults();
    state.tasks = [task()];
    const before = taskSlots(state, state.tasks[0], '2026-10-23', now);
    expect(before.length).toBeGreaterThan(0);
    state.events = [event({ allDay: true })];
    expect(taskSlots(state, state.tasks[0], '2026-10-23', now)).toHaveLength(0);
    postponeTask(state, 'task', '2026-10-24');
    expect(state.tasks[0].date).toBe('2026-10-24');
    expect(state.tasks[0].completedAt).toBeNull();
    expect(freeSlots(eventsOn(state, '2026-10-23'), minutes('07:00'), minutes('23:00'))).toEqual(
      [],
    );
  });
});

describe('Concentración y constancia reales', () => {
  it('excluye pausas y usa marcas temporales aunque no se ejecuten intervalos', () => {
    const state = defaults();
    const started = now.getTime();
    state.focus = {
      id: 'focus',
      phase: 'focus',
      duration: 120,
      remaining: 120,
      deadline: started + 120000,
      startedAt: now.toISOString(),
      taskId: null,
      categoryId: 'study',
    };
    pauseOrResumeFocus(state, 'focus', started + 30000);
    expect(focusRemaining(state.focus!, started + 900000)).toBe(90);
    pauseOrResumeFocus(state, 'focus', started + 900000);
    expect(settleFocus(state, 'focus', started + 990000)).toBe(true);
    expect(state.sessions[0].minutes).toBe(2);
    expect(settleFocus(state, 'focus', started + 991000)).toBe(false);
    expect(state.sessions).toHaveLength(1);
  });
  it('no inventa actividad, logros ni comparaciones', () => {
    const state = defaults();
    expect(annualConsistency(state, 2026, '2026-10-23').activeDays).toBe(0);
    expect(achievements(state, '2026-10-23')).toEqual([]);
    expect(weeklyComparison(state, '2026-10-23').currentTasks).toBe(0);
    state.tasks = [task({ completedAt: now.toISOString() })];
    expect(annualConsistency(state, 2026, '2026-10-23').activeDays).toBe(1);
    expect(achievements(state, '2026-10-23').map((a) => a.id)).toEqual(['first']);
  });
});

describe('Actualización aditiva y copias de la fase anterior', () => {
  it('solo registra una sesión cuando dos ventanas completan el mismo temporizador', async () => {
    const name = `focus-${crypto.randomUUID()}`;
    const a = new IndexedDBRepository(name);
    const b = new IndexedDBRepository(name);
    const end = Date.now();
    await a.transact((s) => {
      s.focus = {
        id: 'same-session',
        phase: 'focus',
        duration: 120,
        remaining: 120,
        deadline: end,
        startedAt: new Date(end - 120000).toISOString(),
        taskId: null,
        categoryId: 'study',
      };
    });
    await Promise.all([
      a.transact((s) => {
        settleFocus(s, 'same-session', end);
      }),
      b.transact((s) => {
        settleFocus(s, 'same-session', end);
      }),
    ]);
    expect((await a.read()).sessions).toHaveLength(1);
    a.close();
    b.close();
  });
  it('acepta JSON v1 y exporta v2 para proteger los nuevos datos ante aplicaciones antiguas', () => {
    const state = defaults();
    const json = JSON.stringify({ app: 'DAYFLOW', schemaVersion: 1, exportedAt: stamp(), state });
    expect(parseBackup(json).schemaVersion).toBe(1);
    expect(JSON.parse(exportBackup(state)).schemaVersion).toBe(3);
  });
  it('conserva logros de racha ya conseguidos después de un día incumplido', () => {
    const state = defaults();
    state.habits = [
      {
        id: 'h',
        updatedAt: stamp(),
        title: 'Leer',
        categoryId: 'personal',
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        target: 7,
        createdDate: '2026-10-01',
        completions: [
          '2026-10-01',
          '2026-10-02',
          '2026-10-03',
          '2026-10-04',
          '2026-10-05',
          '2026-10-06',
          '2026-10-07',
        ],
        archived: false,
      },
    ];
    expect(achievements(state, '2026-10-23').some((a) => a.id === 'week')).toBe(true);
  });
  it('abre un IndexedDB v1 en v2 conservando registros e identificadores y bloquea clientes v1', async () => {
    const name = `legacy-${crypto.randomUUID()}`;
    const legacy = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(name, 1);
      r.onupgradeneeded = () => {
        for (const s of ['events', 'tasks', 'habits', 'sessions', 'templates'])
          r.result.createObjectStore(s, { keyPath: 'id' });
        r.result.createObjectStore('meta');
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = reject;
    });
    await new Promise<void>((resolve, reject) => {
      const tx = legacy.transaction(['tasks', 'meta'], 'readwrite');
      tx.objectStore('tasks').put(task());
      tx.objectStore('meta').put(
        { settings: defaults().settings, focus: null, revision: 7 },
        'state',
      );
      tx.oncomplete = () => resolve();
      tx.onerror = reject;
    });
    legacy.close();
    const repository = new IndexedDBRepository(name);
    const initial = await repository.read();
    expect(initial.tasks[0].id).toBe('task');
    expect(initial.revision).toBe(7);
    await repository.transact((s) => {
      s.settings.dashboard = { order: ['tomorrow', 'next'], hidden: ['focus'] };
    });
    repository.close();
    const reopened = new IndexedDBRepository(name);
    expect((await reopened.read()).tasks).toEqual(initial.tasks);
    expect((await reopened.read()).settings.dashboard?.order).toEqual(['tomorrow', 'next']);
    await expect(
      new Promise((resolve, reject) => {
        const r = indexedDB.open(name, 1);
        r.onsuccess = () => {
          r.result.close();
          resolve(true);
        };
        r.onerror = () => reject(r.error);
      }),
    ).rejects.toMatchObject({ name: 'VersionError' });
    reopened.close();
  });
  it('recupera copias antiguas y conserva nuevas preferencias y repeticiones', () => {
    const legacy = defaults();
    delete legacy.settings.dashboard;
    delete legacy.settings.focusSound;
    expect(parseBackup(exportBackup(legacy)).state.tasks).toEqual([]);
    legacy.tasks = [task({ date: '2026-10-23', recurrence: 'custom', weekdays: [1, 3] })];
    legacy.settings.dashboard = { order: ['tomorrow'], hidden: ['focus'] };
    legacy.settings.focusSound = true;
    expect(stateSchema.safeParse(legacy).success).toBe(true);
    expect(parseBackup(exportBackup(legacy)).state).toEqual(legacy);
  });
});
