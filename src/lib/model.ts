import { z } from 'zod';
import { googleEventSchema, googleLocalSchema, type GoogleEvent } from '../../shared/google';

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const d = new Date(`${value}T12:00:00`);
    return (
      !Number.isNaN(d.getTime()) &&
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` ===
        value
    );
  }, 'Fecha no válida');
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const id = z.string().min(1).max(100);
const timestamp = z.string().datetime();
const recurrence = z.enum(['none', 'daily', 'weekdays', 'weekly', 'custom']);
const scheduledDays = z.array(z.number().int().min(0).max(6)).min(1).max(7).optional();
export const dashboardCards = [
  'next',
  'priorities',
  'progress',
  'habits',
  'tomorrow',
  'focus',
] as const;
const base = { id, updatedAt: timestamp };
export const categorySchema = z.object({
  id,
  name: z.string().trim().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
export const eventSchema = z
  .object({
    ...base,
    title: z.string().trim().min(1).max(160),
    date: dateSchema,
    start: timeSchema,
    end: timeSchema,
    allDay: z.boolean(),
    categoryId: id,
    fixed: z.boolean(),
    recurrence,
    weekdays: scheduledDays,
    sourceTaskId: id.optional(),
    taskDate: dateSchema.optional(),
    until: dateSchema.nullable(),
    exceptions: z.array(dateSchema),
    completedDates: z.array(dateSchema),
    location: z.string().max(250),
    notes: z.string().max(5000),
    timeZone: z.string().max(100),
  })
  .refine((e) => e.recurrence !== 'custom' || !!e.weekdays?.length, 'Elige los días de repetición')
  .refine((e) => e.allDay || e.end > e.start, 'La hora de fin debe ser posterior al inicio')
  .refine((e) => !e.until || e.until >= e.date, 'La fecha final no puede ser anterior al inicio');
export const subtaskSchema = z.object({
  id,
  title: z.string().trim().min(1).max(200),
  done: z.boolean(),
});
export const taskSchema = z
  .object({
    ...base,
    title: z.string().trim().min(1).max(160),
    date: dateSchema.nullable(),
    time: timeSchema.nullable(),
    deadline: dateSchema.nullable(),
    duration: z.number().int().min(5).max(720),
    priority: z.enum(['high', 'medium', 'low']),
    categoryId: id,
    listId: id,
    tags: z.array(z.string().trim().min(1).max(30)).max(20),
    notes: z.string().max(5000),
    subtasks: z.array(subtaskSchema).max(100),
    recurrence,
    weekdays: scheduledDays,
    completedAt: timestamp.nullable(),
    doneDates: z.array(dateSchema),
    reminder: z.number().int().min(0).max(1440).nullable(),
  })
  .refine((t) => t.recurrence !== 'custom' || !!t.weekdays?.length, 'Elige los días de repetición')
  .refine(
    (t) => t.recurrence === 'none' || t.date !== null,
    'Una tarea recurrente necesita fecha de inicio',
  )
  .refine((t) => !t.time || !!t.date, 'Una tarea con hora necesita una fecha')
  .refine(
    (t) =>
      !t.time || Number(t.time.slice(0, 2)) * 60 + Number(t.time.slice(3)) + t.duration <= 1439,
    'La tarea debe terminar dentro del mismo día; adelanta la hora o reduce su duración',
  );
export const habitSchema = z
  .object({
    ...base,
    title: z.string().trim().min(1).max(100),
    categoryId: id,
    weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    target: z.number().int().min(1).max(7),
    createdDate: dateSchema,
    completions: z.array(dateSchema),
    archived: z.boolean(),
  })
  .refine(
    (h) => h.target <= new Set(h.weekdays).size,
    'El objetivo no puede superar los días programados',
  );
export const sessionSchema = z.object({
  ...base,
  startedAt: timestamp,
  endedAt: timestamp,
  minutes: z.number().min(0).max(360),
  categoryId: id,
  taskId: id.nullable(),
});
export const focusSchema = z.object({
  id,
  phase: z.enum(['focus', 'break']),
  duration: z.number().int().min(60).max(21600),
  remaining: z.number().min(0).max(21600),
  deadline: z.number().nullable(),
  startedAt: timestamp,
  taskId: id.nullable(),
  categoryId: id,
});
const templateSchema = z.object({
  ...base,
  name: z.string().trim().min(1).max(80),
  blocks: z
    .array(z.object({ offset: z.number().int().min(0).max(6), event: eventSchema }))
    .max(500),
});
export const settingsSchema = z
  .object({
    name: z.string().max(60),
    wake: timeSchema,
    sleep: timeSchema,
    weekStart: z.union([z.literal(0), z.literal(1)]),
    defaultDuration: z.number().int().min(5).max(240),
    accent: z.enum(['violet', 'blue']),
    compact: z.boolean(),
    dashboard: z
      .object({
        order: z
          .array(z.enum(dashboardCards))
          .max(6)
          .refine((a) => new Set(a).size === a.length, 'Tarjetas duplicadas'),
        hidden: z.array(z.enum(dashboardCards)).max(6),
      })
      .optional(),
    focusSound: z.boolean().optional(),
    goal: z.string().max(250),
    focusMinutes: z.number().int().min(1).max(180),
    breakMinutes: z.number().int().min(1).max(60),
    categories: z.array(categorySchema).min(1).max(30),
    lists: z
      .array(z.object({ id, name: z.string().trim().min(1).max(60) }))
      .min(1)
      .max(50),
  })
  .refine((s) => s.sleep > s.wake, 'La hora de dormir debe ser posterior a la de despertar');
export const stateSchema = z
  .object({
    events: z.array(eventSchema).max(20000),
    tasks: z.array(taskSchema).max(20000),
    habits: z.array(habitSchema).max(2000),
    sessions: z.array(sessionSchema).max(100000),
    templates: z.array(templateSchema).max(100),
    googleEvents: z.array(googleEventSchema).max(20000).default([]),
    google: googleLocalSchema.default({
      lastSync: null,
      audit: [],
      hiddenCalendars: [],
      links: [],
      outbox: [],
    }),
    settings: settingsSchema,
    focus: focusSchema.nullable(),
    revision: z.number().int().min(0),
  })
  .superRefine((s, ctx) => {
    for (const items of [
      s.events,
      s.tasks,
      s.habits,
      s.sessions,
      s.templates,
      s.googleEvents,
      s.settings.categories,
      s.settings.lists,
    ]) {
      if (new Set(items.map((x) => x.id)).size !== items.length)
        ctx.addIssue({ code: 'custom', message: 'Hay identificadores duplicados' });
    }
    const categories = new Set(s.settings.categories.map((c) => c.id));
    const lists = new Set(s.settings.lists.map((l) => l.id));
    if (
      [
        ...s.events,
        ...s.tasks,
        ...s.habits,
        ...s.sessions,
        ...s.templates.flatMap((t) => t.blocks.map((b) => b.event)),
      ].some((x) => !categories.has(x.categoryId))
    )
      ctx.addIssue({ code: 'custom', message: 'Hay categorías inexistentes' });
    if (s.tasks.some((t) => !lists.has(t.listId)))
      ctx.addIssue({ code: 'custom', message: 'Hay listas inexistentes' });
  });
export const backupSchema = z.object({
  app: z.literal('DAYFLOW'),
  schemaVersion: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  exportedAt: timestamp,
  state: stateSchema,
});
export type Activity = z.infer<typeof eventSchema>;
export type Task = z.infer<typeof taskSchema>;
export type Habit = z.infer<typeof habitSchema>;
export type Focus = z.infer<typeof focusSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type State = z.infer<typeof stateSchema>;
export type Settings = State['settings'];
export type Category = z.infer<typeof categorySchema>;
export type View =
  'today' | 'calendar' | 'tasks' | 'planner' | 'habits' | 'focus' | 'stats' | 'settings';
export type Occurrence = Activity & {
  occurrenceDate: string;
  google?: GoogleEvent;
  clockChange?: boolean;
};
export const uid = () => crypto.randomUUID();
export const stamp = () => new Date().toISOString();
export const defaults = (): State => ({
  events: [],
  tasks: [],
  habits: [],
  sessions: [],
  templates: [],
  googleEvents: [],
  google: { lastSync: null, audit: [], hiddenCalendars: [], links: [], outbox: [] },
  focus: null,
  revision: 0,
  settings: {
    name: '',
    wake: '07:00',
    sleep: '23:00',
    weekStart: 1,
    defaultDuration: 60,
    accent: 'violet',
    compact: false,
    goal: '',
    focusMinutes: 25,
    breakMinutes: 5,
    categories: [
      { id: 'personal', name: 'Personal', color: '#b6a0f7' },
      { id: 'study', name: 'Estudios', color: '#8eafff' },
      { id: 'work', name: 'Trabajo', color: '#f5bd79' },
      { id: 'health', name: 'Salud', color: '#83cbb1' },
      { id: 'leisure', name: 'Ocio', color: '#e49cbf' },
      { id: 'rest', name: 'Descanso', color: '#9babc4' },
    ],
    lists: [{ id: 'inbox', name: 'Bandeja de entrada' }],
  },
});
