import { addDays, dateKey, localDate, range, startOfWeek } from './dates';
import type { State } from './model';

export function activityHistory(state: State, today = dateKey()) {
  const counts = new Map<string, number>();
  const tasks = new Map<string, number>();
  const focus = new Map<string, number>();
  const add = (map: Map<string, number>, day: string, n = 1) => {
    if (day <= today) map.set(day, (map.get(day) ?? 0) + n);
  };
  for (const task of state.tasks) {
    const dates =
      task.recurrence === 'none'
        ? task.completedAt
          ? [dateKey(new Date(task.completedAt))]
          : []
        : [...new Set(task.doneDates)];
    for (const day of dates) {
      add(counts, day);
      add(tasks, day);
    }
  }
  for (const habit of state.habits) for (const day of new Set(habit.completions)) add(counts, day);
  for (const event of state.events)
    if (!event.sourceTaskId) for (const day of new Set(event.completedDates)) add(counts, day);
  for (const session of state.sessions) {
    const day = dateKey(new Date(session.startedAt));
    add(counts, day);
    add(focus, day, session.minutes);
  }
  return { counts, tasks, focus };
}
export function annualConsistency(state: State, year: number, today = dateKey()) {
  const history = activityHistory(state, today);
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const offset = (localDate(start).getDay() + 6) % 7;
  const days: { date: string; count: number; future: boolean; column: number; row: number }[] = [];
  for (let day = start, n = 0; day <= end; day = addDays(day, 1), n++)
    days.push({
      date: day,
      count: history.counts.get(day) ?? 0,
      future: day > today,
      column: Math.floor((n + offset) / 7),
      row: (n + offset) % 7,
    });
  return {
    days,
    activeDays: days.filter((d) => d.count > 0).length,
    total: days.reduce((n, d) => n + d.count, 0),
  };
}
export function weeklyComparison(state: State, today = dateKey()) {
  const history = activityHistory(state, today);
  const current = startOfWeek(today, state.settings.weekStart);
  const previous = addDays(current, -7);
  const currentDays = range(current, 7);
  const previousDays = range(previous, 7);
  const elapsed = currentDays.filter((d) => d <= today).length;
  const sum = (map: Map<string, number>, days: string[]) =>
    days.slice(0, elapsed).reduce((n, d) => n + (map.get(d) ?? 0), 0);
  return {
    currentDays,
    previousDays,
    elapsed,
    currentTasks: sum(history.tasks, currentDays),
    previousTasks: sum(history.tasks, previousDays),
    currentFocus: sum(history.focus, currentDays),
    previousFocus: sum(history.focus, previousDays),
    taskValues: currentDays.map((d) => history.tasks.get(d) ?? 0),
    previousValues: previousDays.map((d, i) => (i < elapsed ? (history.tasks.get(d) ?? 0) : 0)),
  };
}
export function achievements(state: State, today = dateKey()) {
  const history = activityHistory(state, today);
  const taskCount = [...history.tasks.values()].reduce((n, v) => n + v, 0);
  const minutes = [...history.focus.values()].reduce((n, v) => n + v, 0);
  const streak = Math.max(
    0,
    ...state.habits.map((h) => {
      const dates = [...new Set(h.completions)]
        .filter(
          (d) => d >= h.createdDate && d <= today && h.weekdays.includes(localDate(d).getDay()),
        )
        .sort();
      let best = 0;
      let current = 0;
      let previous: string | null = null;
      for (const day of dates) {
        let gap = false;
        if (previous)
          for (let d = addDays(previous, 1); d < day; d = addDays(d, 1)) {
            if (h.weekdays.includes(localDate(d).getDay())) {
              gap = true;
              break;
            }
          }
        current = previous && !gap ? current + 1 : 1;
        best = Math.max(best, current);
        previous = day;
      }
      return best;
    }),
  );
  return [
    {
      id: 'first',
      title: 'El primer paso',
      detail: 'Primera tarea completada',
      achieved: taskCount >= 1,
    },
    {
      id: 'ten',
      title: 'Menos ruido mental',
      detail: '10 tareas completadas',
      achieved: taskCount >= 10,
    },
    {
      id: 'fifty',
      title: 'Un camino recorrido',
      detail: '50 tareas completadas',
      achieved: taskCount >= 50,
    },
    {
      id: 'hour',
      title: 'Tiempo para lo importante',
      detail: 'Una hora de concentración registrada',
      achieved: minutes >= 60,
    },
    {
      id: 'five-hours',
      title: 'Atención con intención',
      detail: '5 horas de concentración registradas',
      achieved: minutes >= 300,
    },
    {
      id: 'week',
      title: 'La fuerza de volver',
      detail: '7 días programados de racha en un hábito',
      achieved: streak >= 7,
    },
  ].filter((a) => a.achieved);
}
