import type { GoogleEvent, GoogleSnapshot } from '../../shared/google';
import type { Occurrence, State } from './model';

export const calendarKey = (accountId: string, calendarId: string) => `${accountId}:${calendarId}`;
export const googleDuration = (event: GoogleEvent) =>
  event.start.date
    ? (Date.parse(`${event.end.date}T00:00:00Z`) - Date.parse(`${event.start.date}T00:00:00Z`)) /
      60000
    : (Date.parse(event.end.dateTime!) - Date.parse(event.start.dateTime!)) / 60000;
export function zonedParts(
  value: string,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const get = (key: string) => parts.find((p) => p.type === key)!.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  };
}
export function googleOccurrences(
  state: Partial<Pick<State, 'googleEvents' | 'google' | 'settings'>>,
  day: string,
): Occurrence[] {
  return (state.googleEvents ?? []).flatMap((event) => {
    if (state.google?.hiddenCalendars.includes(calendarKey(event.accountId, event.calendarId)))
      return [];
    const allDay = !!event.start.date;
    const start = allDay
      ? { date: event.start.date!, time: '00:00' }
      : zonedParts(event.start.dateTime!);
    const end = allDay ? { date: event.end.date!, time: '00:00' } : zonedParts(event.end.dateTime!);
    // Google end dates/times are exclusive, including multi-day and midnight endings.
    if (day < start.date || day > end.date || (day === end.date && end.time === '00:00')) return [];
    const startTime = day === start.date ? start.time : '00:00';
    let endTime = day === end.date ? end.time : '24:00';
    const wallMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    const clockChange =
      !allDay &&
      start.date === end.date &&
      googleDuration(event) !== wallMinutes(end.time) - wallMinutes(start.time);
    // A repeated civil hour must never produce a negative/empty timeline block.
    // The original instants remain untouched; details show the real duration and offset.
    if (!allDay && endTime <= startTime) {
      const endMinute = Math.min(1440, wallMinutes(startTime) + googleDuration(event));
      endTime = `${String(Math.floor(endMinute / 60)).padStart(2, '0')}:${String(Math.round(endMinute % 60)).padStart(2, '0')}`;
    }
    return [
      {
        id: event.id,
        updatedAt: event.updatedAt,
        title: event.title,
        date: day,
        occurrenceDate: day,
        start: startTime,
        end: endTime,
        allDay,
        clockChange,
        categoryId: state.settings?.categories[0]?.id ?? 'personal',
        fixed: true,
        recurrence: 'none',
        until: null,
        exceptions: [],
        completedDates: [],
        location: event.location,
        notes: event.description,
        timeZone: event.start.timeZone ?? '',
        google: event,
      },
    ];
  });
}
export function searchableEvents(state: State) {
  return [
    ...state.events.filter(
      (e) =>
        e.recurrence !== 'none' ||
        !state.google.links.some((l) => l.localEventId === e.id && l.date === e.date),
    ),
    ...state.googleEvents.flatMap((event) => {
      const day = event.start.date ?? zonedParts(event.start.dateTime!).date;
      return googleOccurrences({ ...state, googleEvents: [event] }, day);
    }),
  ];
}
function inWindow(event: GoogleEvent, snapshot: GoogleSnapshot) {
  if (event.start.date)
    return (
      event.end.date! > snapshot.from.slice(0, 10) && event.start.date < snapshot.to.slice(0, 10)
    );
  return (
    Date.parse(event.end.dateTime!) > Date.parse(snapshot.from) &&
    Date.parse(event.start.dateTime!) < Date.parse(snapshot.to)
  );
}
export function previewGoogleSync(state: Pick<State, 'googleEvents'>, snapshot: GoogleSnapshot) {
  const existing = new Map(state.googleEvents.map((e) => [e.id, e]));
  const incoming = new Set(snapshot.events.map((e) => e.id));
  return {
    added: snapshot.events.filter((e) => !existing.has(e.id)),
    changed: snapshot.events.filter(
      (e) => existing.has(e.id) && JSON.stringify(existing.get(e.id)) !== JSON.stringify(e),
    ),
    removed: state.googleEvents.filter(
      (e) =>
        e.accountId === snapshot.accountId &&
        snapshot.calendarIds.includes(e.calendarId) &&
        inWindow(e, snapshot) &&
        !incoming.has(e.id),
    ),
  };
}
export function auditGoogle(state: State, action: string, detail: string) {
  state.google.audit = [
    ...state.google.audit,
    {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      action: action.slice(0, 80),
      detail: detail.slice(0, 500),
    },
  ].slice(-300);
}
export function applyGoogleSnapshot(state: State, snapshot: GoogleSnapshot, base: GoogleEvent[]) {
  // Only the cached account is compared: unrelated task/habit writes do not invalidate a preview.
  const current = state.googleEvents.filter((e) => e.accountId === snapshot.accountId);
  if (
    JSON.stringify(current) !==
    JSON.stringify(base.filter((e) => e.accountId === snapshot.accountId))
  )
    throw new Error(
      'La copia de Google cambió en otra pestaña. Vuelve a revisar la sincronización.',
    );
  const preview = previewGoogleSync(state, snapshot);
  const removed = new Set(preview.removed.map((e) => e.id));
  const merged = new Map(
    state.googleEvents.filter((e) => !removed.has(e.id)).map((e) => [e.id, e]),
  );
  for (const event of snapshot.events) merged.set(event.id, event);
  state.googleEvents = [...merged.values()];
  const prefix = `${snapshot.accountId}:`;
  state.google.hiddenCalendars = [
    ...state.google.hiddenCalendars.filter((key) => !key.startsWith(prefix)),
    ...new Set(
      state.googleEvents
        .filter(
          (e) => e.accountId === snapshot.accountId && !snapshot.calendarIds.includes(e.calendarId),
        )
        .map((e) => calendarKey(e.accountId, e.calendarId)),
    ),
  ];
  state.google.lastSync = snapshot.fetchedAt;
  auditGoogle(
    state,
    'Sincronización confirmada',
    `${preview.added.length} altas · ${preview.changed.length} cambios · ${preview.removed.length} retirados de la copia de Google`,
  );
}
