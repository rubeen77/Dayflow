import { z } from 'zod';

// This module is public. Credentials and provider tokens never belong here.
export const calendarSchema = z.object({
  id: z.string().min(1).max(1024),
  summary: z.string().max(1024),
  color: z.string().regex(/^#[\da-fA-F]{6}$/),
  timeZone: z.string().max(100),
  accessRole: z.enum(['freeBusyReader', 'reader', 'writer', 'owner']),
  primary: z.boolean(),
});
export const boundarySchema = z
  .object({
    date: z.iso.date().optional(),
    dateTime: z
      .string()
      .max(100)
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/)
      .refine((v) => Number.isFinite(Date.parse(v)), 'Fecha y hora no válidas')
      .optional(),
    timeZone: z
      .string()
      .max(100)
      .refine((v) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: v });
          return true;
        } catch {
          return false;
        }
      }, 'Zona horaria no válida')
      .optional(),
  })
  .refine((b) => !!b.date !== !!b.dateTime, 'Fecha de Google no válida');
export const googleEventSchema = z
  .object({
    id: z.string().min(1).max(100),
    updatedAt: z.string().datetime(),
    accountId: z.string().max(100),
    calendarId: z.string().max(1024),
    calendarName: z.string().max(1024),
    color: z.string().regex(/^#[\da-fA-F]{6}$/),
    eventId: z.string().min(1).max(1024),
    etag: z.string().min(1).max(256),
    title: z.string().max(1024),
    description: z.string().max(20000),
    location: z.string().max(2000),
    start: boundarySchema,
    end: boundarySchema,
    recurringEventId: z.string().max(1024).optional(),
    originalStartTime: boundarySchema.optional(),
    htmlLink: z.string().url().optional(),
    editable: z.boolean(),
    busy: z.boolean(),
  })
  .refine((e) => !!e.start.date === !!e.end.date, 'Formato de fechas incompatible')
  .refine(
    (e) =>
      e.start.date
        ? e.end.date! > e.start.date
        : /(?:Z|[+-]\d{2}:\d{2})$/.test(e.start.dateTime!) &&
          /(?:Z|[+-]\d{2}:\d{2})$/.test(e.end.dateTime!) &&
          Date.parse(e.end.dateTime!) > Date.parse(e.start.dateTime!),
    'Intervalo de Google no válido',
  );
export const snapshotSchema = z
  .object({
    accountId: z.string().min(1).max(100),
    calendarIds: z.array(z.string().max(1024)).max(20),
    from: z.string().datetime(),
    to: z.string().datetime(),
    fetchedAt: z.string().datetime(),
    events: z.array(googleEventSchema).max(10000),
  })
  .refine(
    (s) =>
      s.to > s.from &&
      new Set(s.events.map((e) => e.id)).size === s.events.length &&
      s.events.every((e) => e.accountId === s.accountId && s.calendarIds.includes(e.calendarId)),
    'La instantánea de Google no es coherente',
  );
export const preferencesSchema = z
  .object({
    selected: z.array(z.string().min(1).max(1024)).max(20),
    writable: z.array(z.string().min(1).max(1024)).max(20),
  })
  .refine(
    (p) => p.writable.every((id) => p.selected.includes(id)),
    'Selecciona el calendario antes de activar la escritura',
  );
export type GoogleEvent = z.infer<typeof googleEventSchema>;
export type GoogleCalendar = z.infer<typeof calendarSchema>;
export type GoogleSnapshot = z.infer<typeof snapshotSchema>;
export type GooglePreferences = z.infer<typeof preferencesSchema>;
export interface GoogleStatus {
  configured: boolean;
  connected: boolean;
  missing?: string[];
  accountId?: string;
  writeGranted?: boolean;
  preferences?: GooglePreferences;
}
export const draftSchema = z
  .object({
    title: z.string().trim().min(1).max(1024),
    description: z.string().max(20000),
    location: z.string().max(2000),
    start: boundarySchema,
    end: boundarySchema,
  })
  .refine((e) => !!e.start.date === !!e.end.date, 'Inicio y fin deben tener el mismo formato');
export const mutationSchema = z
  .object({
    accountId: z.string().min(1).max(100),
    operation: z.enum(['create', 'update', 'delete']),
    operationId: z.string().uuid(),
    calendarId: z.string().min(1).max(1024),
    eventId: z.string().min(1).max(1024).optional(),
    etag: z.string().min(1).max(256).optional(),
    draft: draftSchema.optional(),
    confirmed: z.literal(true),
  })
  .refine(
    (m) => m.operation === 'create' || (!!m.eventId && !!m.etag),
    'Falta la versión del evento',
  )
  .refine((m) => m.operation === 'delete' || !!m.draft, 'Faltan los datos del evento');
export type GoogleDraft = z.infer<typeof draftSchema>;
export type GoogleMutation = z.infer<typeof mutationSchema>;
export const googleLocalSchema = z.object({
  lastSync: z.string().datetime().nullable(),
  hiddenCalendars: z.array(z.string().max(1200)).max(200).default([]),
  links: z
    .array(
      z.object({
        localEventId: z.string().max(100),
        date: z.string(),
        googleId: z.string().max(100),
      }),
    )
    .max(20000)
    .default([]),
  outbox: z
    .array(
      z.object({
        id: z.string().uuid(),
        mutation: mutationSchema,
        localEventId: z.string().max(100).optional(),
        date: z.string().optional(),
      }),
    )
    .max(100)
    .default([]),
  audit: z
    .array(
      z.object({
        id: z.string().max(100),
        at: z.string().datetime(),
        action: z.string().max(80),
        detail: z.string().max(500),
      }),
    )
    .max(300),
});
export type GooglePending = z.infer<typeof googleLocalSchema>['outbox'][number];
