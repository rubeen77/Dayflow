import {
  addDays,
  agendaOn,
  dateKey,
  freeSlots,
  minutes,
  occupied,
  taskDone,
  tasksOn,
  habitScheduled,
} from './dates';
import { dashboardCards, type Settings, type State, type Task } from './model';

export const isUrgent = (task: Task, day: string) =>
  task.priority === 'high' ||
  !!(task.deadline && task.deadline <= day) ||
  !!(task.date && task.date < day && task.recurrence === 'none');
export function dashboardLayout(settings: Settings) {
  const stored = settings.dashboard;
  return {
    order: [
      ...(stored?.order ?? dashboardCards),
      ...dashboardCards.filter((id) => !stored?.order?.includes(id) && !!stored),
    ],
    hidden: stored?.hidden ?? [],
  };
}
export function summarizeDay(state: State, day: string, now = new Date()) {
  const today = dateKey(now);
  const minute = now.getHours() * 60 + now.getMinutes();
  const agenda = agendaOn(state, day).sort((a, b) => a.start.localeCompare(b.start));
  const tasks = tasksOn(state, day);
  const habits = state.habits.filter((h) => habitScheduled(h, day));
  const from =
    day < today
      ? minutes(state.settings.sleep)
      : day === today
        ? Math.max(minutes(state.settings.wake), minute)
        : minutes(state.settings.wake);
  const slots = freeSlots(agenda, from, minutes(state.settings.sleep));
  const next = agenda.find(
    (e) =>
      !e.allDay &&
      !e.completedDates.includes(day) &&
      (day > today ||
        (day === today &&
          (e.google?.end.dateTime
            ? Date.parse(e.google.end.dateTime) > now.getTime()
            : minutes(e.end) > minute))),
  );
  const pending = state.tasks
    .filter(
      (t) =>
        !taskDone(t, day) &&
        (tasks.some((x) => x.id === t.id) ||
          (t.deadline && t.deadline <= day) ||
          !t.date ||
          (t.date < day && t.recurrence === 'none')),
    )
    .sort(
      (a, b) =>
        Number(isUrgent(b, day)) - Number(isUrgent(a, day)) ||
        (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') ||
        { high: 0, medium: 1, low: 2 }[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority],
    );
  const doneTasks = tasks.filter((t) => taskDone(t, day)).length;
  const doneHabits = habits.filter((h) => h.completions.includes(day)).length;
  const independentEvents = agenda.filter(
    (e) => !e.google && !e.id.startsWith('task:') && !e.sourceTaskId,
  );
  const total = independentEvents.length + tasks.length + habits.length;
  const done =
    independentEvents.filter((e) => e.completedDates.includes(day)).length + doneTasks + doneHabits;
  return {
    agenda,
    tasks,
    habits,
    pending,
    next,
    slots,
    total,
    done,
    doneTasks,
    doneHabits,
    urgent: pending.filter((t) => isUrgent(t, day)),
    free: slots.reduce((n, s) => n + s.end - s.start, 0),
    planned: occupied(agenda, minutes(state.settings.wake), minutes(state.settings.sleep)).reduce(
      (n, [s, e]) => n + e - s,
      0,
    ),
    progress: total ? Math.round((done / total) * 100) : 0,
    tomorrow: agendaOn(state, addDays(day, 1)),
  };
}
