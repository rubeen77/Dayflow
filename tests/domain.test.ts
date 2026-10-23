import { describe, expect, it } from 'vitest';
import {
  addDays,
  conflicts,
  dateKey,
  daysBetween,
  eventsOn,
  freeSlots,
  habitRate,
  habitStreak,
  minutes,
  repeatsOn,
  startOfWeek,
} from '../src/lib/dates';
import { defaults, stateSchema, type Activity, type Habit, type Task } from '../src/lib/model';
import { applyProposals, deterministicPlanner, moveOccurrence } from '../src/lib/planner';
import { exportBackup, mergeBackup, parseBackup } from '../src/lib/storage';

const timestamp = '2026-10-23T09:00:00.000Z';
const activity = (patch: Partial<Activity> = {}): Activity => ({
  id: 'event-1',
  updatedAt: timestamp,
  title: 'Estudio',
  date: '2026-10-23',
  start: '10:00',
  end: '11:00',
  allDay: false,
  categoryId: 'study',
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
const task = (patch: Partial<Task> = {}): Task => ({
  id: 'task-1',
  updatedAt: timestamp,
  title: 'Preparar examen',
  date: null,
  time: null,
  deadline: null,
  duration: 45,
  priority: 'high',
  categoryId: 'study',
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
const habit = (patch: Partial<Habit> = {}): Habit => ({
  id: 'habit-1',
  updatedAt: timestamp,
  title: 'Leer',
  categoryId: 'personal',
  weekdays: [1, 2, 3, 4, 5],
  target: 3,
  createdDate: '2026-10-19',
  completions: ['2026-10-22', '2026-10-23', '2026-10-26'],
  archived: false,
  ...patch,
});

describe('Fechas civiles y horario de verano', () => {
  it('cruza los cambios de horario sin saltar ni duplicar días', () => {
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(dateKey(new Date(2026, 9, 25, 0, 30))).toBe('2026-10-25');
  });
  it('permite empezar la semana en domingo o lunes', () => {
    expect(startOfWeek('2026-10-25', 1)).toBe('2026-10-19');
    expect(startOfWeek('2026-10-25', 0)).toBe('2026-10-25');
  });
  it('respeta inicio, final y excepciones de recurrencia', () => {
    const event = activity({
      recurrence: 'weekly',
      until: '2026-11-06',
      exceptions: ['2026-10-30'],
    });
    expect(repeatsOn(event, '2026-10-16')).toBe(false);
    expect(eventsOn({ events: [event] }, '2026-10-30')).toHaveLength(0);
    expect(eventsOn({ events: [event] }, '2026-11-06')).toHaveLength(1);
    expect(eventsOn({ events: [event] }, '2026-11-13')).toHaveLength(0);
  });
  it('rechaza fechas que el motor de JavaScript normalizaría', () => {
    expect(
      stateSchema.safeParse({ ...defaults(), events: [activity({ date: '2026-02-30' })] }).success,
    ).toBe(false);
  });
});

describe('Planificación determinista', () => {
  it('reserva intervalos solapados una sola vez y respeta eventos fijos de todo el día', () => {
    const events = [activity(), activity({ id: 'e2', start: '10:30', end: '12:00' })];
    expect(freeSlots(eventsOn({ events }, '2026-10-23'), 9 * 60, 13 * 60)).toEqual([
      { start: 540, end: 600 },
      { start: 720, end: 780 },
    ]);
    expect(conflicts(eventsOn({ events }, '2026-10-23'))).toHaveLength(1);
    expect(
      freeSlots(eventsOn({ events: [activity({ allDay: true })] }, '2026-10-23'), 420, 1380),
    ).toEqual([]);
  });
  it('coloca por prioridad sin alterar eventos, descanso ni tareas con hora', () => {
    const state = defaults();
    state.events = [activity()];
    state.settings.wake = '09:00';
    state.settings.sleep = '13:00';
    state.tasks = [
      task({ id: 'low', priority: 'low', duration: 30 }),
      task({ id: 'high', duration: 45 }),
      task({ id: 'timed', date: '2026-10-23', time: '11:00', duration: 45 }),
    ];
    const before = structuredClone(state.events);
    const plan = deterministicPlanner.suggest(
      state,
      '2026-10-23',
      1,
      new Date('2026-10-22T15:00:00'),
    );
    expect(plan.proposals.map((p) => p.taskId)).toEqual(['high', 'low']);
    expect(plan.proposals[0].start).toBe('09:00');
    expect(plan.proposals[1].start).toBe('11:45');
    expect(state.events).toEqual(before);
    expect(state.tasks[0].date).toBeNull();
    applyProposals(state, plan, new Set(['high']));
    expect(state.tasks.find((t) => t.id === 'high')?.time).toBe('09:00');
    expect(state.tasks[0].date).toBeNull();
  });
  it('no planifica en el pasado ni después de la fecha límite', () => {
    const state = defaults();
    state.tasks = [task({ deadline: '2026-10-22' })];
    const plan = deterministicPlanner.suggest(
      state,
      '2026-10-23',
      7,
      new Date('2026-10-23T14:00:00'),
    );
    expect(plan.proposals).toHaveLength(0);
    expect(plan.unplaced).toHaveLength(1);
  });
  it('rechaza aplicar un plan si la agenda ha cambiado', () => {
    const state = defaults();
    state.tasks = [task()];
    const plan = deterministicPlanner.suggest(
      state,
      '2026-10-23',
      7,
      new Date('2026-10-22T12:00:00'),
    );
    state.revision++;
    expect(() => applyProposals(state, plan, new Set(['task-1']))).toThrow('agenda ha cambiado');
  });
  it('propone reubicar un evento flexible y conserva el fijo', () => {
    const state = defaults();
    state.events = [
      activity(),
      activity({ id: 'flex', start: '10:30', end: '11:30', fixed: false }),
    ];
    const plan = deterministicPlanner.suggest(
      state,
      '2026-10-23',
      1,
      new Date('2026-10-22T12:00:00'),
    );
    expect(plan.relocations).toHaveLength(1);
    expect(plan.relocations[0].eventId).toBe('flex');
    applyProposals(state, plan, new Set(['move:flex:2026-10-23']));
    expect(state.events[0].start).toBe('10:00');
    expect(conflicts(eventsOn(state, '2026-10-23'))).toHaveLength(0);
  });
  it('mueve una repetición sin cambiar el ID ni las otras repeticiones de la serie', () => {
    const state = defaults();
    const event = activity({ recurrence: 'weekly' });
    state.events = [event];
    moveOccurrence(state, event, '2026-10-30', '2026-10-31');
    expect(state.events[0].id).toBe('event-1');
    expect(eventsOn(state, '2026-10-30')).toHaveLength(0);
    expect(eventsOn(state, '2026-10-31')).toHaveLength(1);
    expect(eventsOn(state, '2026-11-06')).toHaveLength(1);
  });
});

describe('Hábitos y copias reales', () => {
  it('los descansos no rompen la racha ni reducen el cumplimiento', () => {
    const h = habit();
    expect(habitStreak(h, '2026-10-26')).toBe(3);
    expect(habitRate(h, '2026-10-22', '2026-10-26')).toEqual({ done: 3, total: 3, percent: 100 });
  });
  it('exporta/importa con IDs estables, valida referencias y no inventa registros', () => {
    const empty = defaults();
    expect(empty.tasks).toHaveLength(0);
    expect(empty.events).toHaveLength(0);
    const state = defaults();
    state.tasks = [task()];
    const parsed = parseBackup(exportBackup(state));
    expect(parsed.state.tasks[0].id).toBe('task-1');
    expect(() => parseBackup(JSON.stringify({ ...parsed, schemaVersion: 99 }))).toThrow(
      'incompatible',
    );
    const bad = structuredClone(parsed);
    bad.state.tasks[0].categoryId = 'unknown';
    expect(() => parseBackup(JSON.stringify(bad))).toThrow('categorías');
  });
  it('combina sin duplicar ni sobrescribir registros más recientes', () => {
    const state = defaults();
    state.tasks = [task({ updatedAt: '2026-10-24T09:00:00.000Z', title: 'Versión reciente' })];
    const imported = defaults();
    imported.tasks = [task()];
    mergeBackup(state, imported);
    mergeBackup(state, imported);
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0].title).toBe('Versión reciente');
  });
  it('no cruza la hora de dormir cuando no hay hueco suficiente', () => {
    const state = defaults();
    state.settings.wake = '22:30';
    state.settings.sleep = '23:00';
    state.tasks = [task({ duration: 45 })];
    const plan = deterministicPlanner.suggest(
      state,
      '2026-10-23',
      1,
      new Date('2026-10-22T12:00:00'),
    );
    expect(plan.proposals).toHaveLength(0);
    expect(minutes(state.settings.sleep)).toBe(1380);
  });
});
