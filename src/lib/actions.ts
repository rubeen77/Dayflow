import {
  addDays,
  agendaOn,
  dateKey,
  freeSlots,
  minutes,
  repeatsOn,
  taskDone,
  timeOf,
} from './dates';
import { stamp, uid, type Activity, type State, type Task } from './model';

export function toggleTask(state: State, id: string, day: string) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) throw new Error('Esta tarea ya no está disponible.');
  if (task.recurrence !== 'none' && (!task.date || !repeatsOn({ ...task, date: task.date }, day)))
    throw new Error('Esta tarea no está programada para ese día.');
  const done = !taskDone(task, day);
  if (task.recurrence === 'none') task.completedAt = done ? stamp() : null;
  else
    task.doneDates = done
      ? [...new Set([...task.doneDates, day])]
      : task.doneDates.filter((d) => d !== day);
  task.updatedAt = stamp();
  for (const event of state.events.filter(
    (e) => e.sourceTaskId === id && (task.recurrence === 'none' || e.taskDate === day),
  )) {
    const key = event.date;
    event.completedDates = done
      ? [...new Set([...event.completedDates, key])]
      : event.completedDates.filter((d) => d !== key);
    event.updatedAt = stamp();
  }
}

export function toggleActivity(state: State, id: string, day: string) {
  const event = state.events.find((e) => e.id === id);
  if (!event) throw new Error('Esta actividad ya no está disponible.');
  const done = !event.completedDates.includes(day);
  if (event.sourceTaskId) {
    const task = state.tasks.find((t) => t.id === event.sourceTaskId);
    if (task && taskDone(task, event.taskDate ?? day) !== done)
      toggleTask(state, task.id, event.taskDate ?? day);
  }
  event.completedDates = done
    ? [...new Set([...event.completedDates, day])]
    : event.completedDates.filter((d) => d !== day);
  event.updatedAt = stamp();
}
export function syncLinkedTask(state: State, event: Activity) {
  const task = state.tasks.find((t) => t.id === event.sourceTaskId);
  if (task && task.recurrence === 'none') {
    task.date = event.date;
    task.time = event.allDay ? null : event.start;
    if (!event.allDay) task.duration = minutes(event.end) - minutes(event.start);
    task.updatedAt = stamp();
  }
}

export function postponeTask(state: State, id: string, to: string) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) throw new Error('Esta tarea ya no existe.');
  if (task.recurrence !== 'none')
    throw new Error('Edita la repetición para cambiar los días de esta tarea.');
  if (state.events.some((e) => e.sourceTaskId === id))
    throw new Error('Esta tarea tiene un bloque: muévelo desde el calendario.');
  task.date = to;
  task.time = null;
  task.updatedAt = stamp();
}

export function taskSlots(state: State, task: Task, day: string, now = new Date()) {
  const today = dateKey(now);
  if (day < today || (task.deadline && day > task.deadline)) return [];
  if (task.recurrence !== 'none' && (!task.date || !repeatsOn({ ...task, date: task.date }, day)))
    return [];
  const earliest =
    day === today ? Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15 : 0;
  const agenda = agendaOn(state, day).filter((e) => e.id !== `task:${task.id}`);
  return freeSlots(
    agenda,
    Math.max(earliest, minutes(state.settings.wake)),
    minutes(state.settings.sleep),
  )
    .filter((s) => s.end - s.start >= task.duration)
    .map((s) => ({
      date: day,
      start: timeOf(s.start),
      end: timeOf(s.start + task.duration),
      availableUntil: timeOf(s.end),
    }));
}

export function convertTaskToBlock(
  state: State,
  taskId: string,
  day: string,
  start: string,
  now = new Date(),
) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task || taskDone(task, day)) throw new Error('La tarea ya no está pendiente.');
  if (
    state.events.some(
      (e) => e.sourceTaskId === taskId && (task.recurrence === 'none' || e.taskDate === day),
    )
  )
    throw new Error('Esta tarea ya tiene un bloque de tiempo.');
  if (task.recurrence !== 'none' && (!task.date || !repeatsOn({ ...task, date: task.date }, day)))
    throw new Error('Elige un día programado para esta tarea recurrente.');
  const end = minutes(start) + task.duration;
  const slot = taskSlots(state, task, day, now).find(
    (s) => minutes(s.start) <= minutes(start) && minutes(s.availableUntil) >= end,
  );
  if (!slot || end > 1439) throw new Error('Ese hueco ya no está disponible. Elige otro horario.');
  const event: Activity = {
    id: uid(),
    updatedAt: stamp(),
    title: task.title,
    date: day,
    start,
    end: timeOf(end),
    allDay: false,
    categoryId: task.categoryId,
    fixed: false,
    recurrence: 'none',
    until: null,
    exceptions: [],
    completedDates: [],
    location: '',
    notes: task.notes,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    sourceTaskId: task.id,
    taskDate: day,
  };
  state.events.push(event);
  if (task.recurrence === 'none') {
    task.date = day;
    task.time = start;
    task.updatedAt = stamp();
  }
  return event;
}

export const nextTaskDay = (task: Task, from = dateKey()) => {
  if (task.recurrence === 'none') return task.date && task.date > from ? task.date : from;
  for (let n = 0; n < 370; n++) {
    const day = addDays(from, n);
    if (task.date && repeatsOn({ ...task, date: task.date }, day) && !taskDone(task, day))
      return day;
  }
  return from;
};
