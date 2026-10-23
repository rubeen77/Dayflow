import type { Activity, Habit, Occurrence, State, Task } from './model';
import { googleOccurrences } from './googleEvents';

export function dateKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const localDate = (s: string) => new Date(`${s}T12:00:00`);
export function addDays(s: string, amount: number) {
  const d = localDate(s);
  d.setDate(d.getDate() + amount);
  return dateKey(d);
}
export function startOfWeek(s: string, start: 0 | 1 = 1) {
  return addDays(s, -((localDate(s).getDay() - start + 7) % 7));
}
export const daysBetween = (a: string, b: string) =>
  Math.round((Date.UTC(...dateParts(b)) - Date.UTC(...dateParts(a))) / 86400000);
function dateParts(s: string): [number, number, number] {
  const [y, m, d] = s.split('-').map(Number);
  return [y, m - 1, d];
}
export const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
export const timeOf = (n: number) =>
  `${String(Math.floor(Math.max(0, Math.min(n, 1439)) / 60)).padStart(2, '0')}:${String(Math.max(0, Math.min(n, 1439)) % 60).padStart(2, '0')}`;
export const durationLabel = (m: number) =>
  m < 60
    ? `${Math.round(m)} min`
    : `${Math.floor(m / 60)} h${m % 60 ? ` ${Math.round(m % 60)} min` : ''}`;
export const formatDate = (
  s: string,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' },
) => localDate(s).toLocaleDateString('es-ES', options);
export const weekday = (s: string, short = false) =>
  formatDate(s, { weekday: short ? 'short' : 'long' }).replace('.', '');
export const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const range = (date: string, length: number) =>
  Array.from({ length }, (_, i) => addDays(date, i));
export function repeatsOn(
  item: {
    date: string;
    recurrence: Activity['recurrence'];
    until?: string | null;
    weekdays?: number[];
  },
  day: string,
) {
  if (day < item.date || (item.until && day > item.until)) return false;
  if (item.recurrence === 'none') return day === item.date;
  if (item.recurrence === 'daily') return true;
  if (item.recurrence === 'custom') return !!item.weekdays?.includes(localDate(day).getDay());
  if (item.recurrence === 'weekdays') return [1, 2, 3, 4, 5].includes(localDate(day).getDay());
  return localDate(day).getDay() === localDate(item.date).getDay();
}
export const eventsOn = (
  state: Pick<State, 'events'> & Partial<Pick<State, 'googleEvents' | 'google' | 'settings'>>,
  day: string,
): Occurrence[] =>
  [
    ...state.events
      .filter(
        (e) =>
          repeatsOn(e, day) &&
          !e.exceptions.includes(day) &&
          !state.google?.links.some((link) => link.localEventId === e.id && link.date === day),
      )
      .map((e) => ({ ...e, occurrenceDate: day })),
    ...googleOccurrences(state, day),
  ].sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start));
export const taskDone = (t: Task, day: string) =>
  t.recurrence === 'none' ? !!t.completedAt : t.doneDates.includes(day);
export const tasksOn = (state: Pick<State, 'tasks'>, day: string) =>
  state.tasks.filter((t) => t.date && repeatsOn({ ...t, date: t.date }, day));
export const taskHasBlock = (state: Pick<State, 'events'>, task: Task, day: string) =>
  state.events.some(
    (e) => e.sourceTaskId === task.id && (task.recurrence === 'none' || e.taskDate === day),
  );
export function agendaOn(
  state: Pick<State, 'events' | 'tasks'> &
    Partial<Pick<State, 'googleEvents' | 'google' | 'settings'>>,
  day: string,
): Occurrence[] {
  return [
    ...eventsOn(state, day),
    ...tasksOn(state, day)
      .filter((t) => t.time && !taskHasBlock(state, t, day))
      .map((t) => ({
        id: `task:${t.id}`,
        updatedAt: t.updatedAt,
        title: t.title,
        date: day,
        occurrenceDate: day,
        start: t.time!,
        end: timeOf(minutes(t.time!) + t.duration),
        allDay: false,
        categoryId: t.categoryId,
        fixed: true,
        recurrence: 'none' as const,
        until: null,
        exceptions: [],
        completedDates: taskDone(t, day) ? [day] : [],
        location: '',
        notes: '',
        timeZone: '',
      })),
  ];
}
export const habitScheduled = (h: Habit, day: string) =>
  !h.archived && day >= h.createdDate && h.weekdays.includes(localDate(day).getDay());
export function habitStreak(h: Habit, today = dateKey()) {
  let streak = 0;
  let day = today;
  if (!h.completions.includes(day)) day = addDays(day, -1);
  for (let n = 0; n < 3650 && day >= h.createdDate; n++, day = addDays(day, -1)) {
    if (!h.weekdays.includes(localDate(day).getDay())) continue;
    if (!h.completions.includes(day)) break;
    streak++;
  }
  return streak;
}
export function habitRate(h: Habit, start: string, end: string) {
  let total = 0;
  let done = 0;
  for (let d = start; d <= end; d = addDays(d, 1))
    if (d >= h.createdDate && h.weekdays.includes(localDate(d).getDay())) {
      total++;
      if (h.completions.includes(d)) done++;
    }
  return { total, done, percent: total ? Math.round((done / total) * 100) : 0 };
}
export function monthDays(day: string, weekStart: 0 | 1) {
  return range(startOfWeek(`${day.slice(0, 7)}-01`, weekStart), 42);
}
export function shiftMonth(day: string, n: number) {
  const d = localDate(`${day.slice(0, 7)}-01`);
  d.setMonth(d.getMonth() + n);
  return dateKey(d);
}
export function occupied(events: Occurrence[], from: number, to: number) {
  const segments = events
    .filter((e) => !e.allDay && e.google?.busy !== false)
    .map((e) => [Math.max(from, minutes(e.start)), Math.min(to, minutes(e.end))])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  const merged: number[][] = [];
  for (const segment of segments) {
    const last = merged.at(-1);
    if (last && segment[0] <= last[1]) last[1] = Math.max(last[1], segment[1]);
    else merged.push([...segment]);
  }
  return merged;
}
export function freeSlots(events: Occurrence[], wake: number, sleep: number) {
  if (events.some((e) => e.allDay && e.fixed && e.google?.busy !== false)) return [];
  const slots: { start: number; end: number }[] = [];
  let cursor = wake;
  for (const [s, e] of occupied(events, wake, sleep)) {
    if (s > cursor) slots.push({ start: cursor, end: s });
    cursor = e;
  }
  if (cursor < sleep) slots.push({ start: cursor, end: sleep });
  return slots;
}
export function conflicts(events: Occurrence[]) {
  const timed = events.filter((e) => !e.allDay);
  return timed.flatMap((a, i) =>
    timed
      .slice(i + 1)
      .filter((b) => a.start < b.end && a.end > b.start)
      .map((b) => [a, b] as const),
  );
}
