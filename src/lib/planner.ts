import {
  addDays,
  conflicts,
  dateKey,
  eventsOn,
  freeSlots,
  minutes,
  taskDone,
  repeatsOn,
  taskHasBlock,
  timeOf,
} from './dates';
import { stamp, uid, type Activity, type State, type Task } from './model';
import { syncLinkedTask } from './actions';

export interface Proposal {
  taskId: string;
  title: string;
  date: string;
  start: string;
  end: string;
  categoryId: string;
  reason: string;
}
export interface Relocation {
  eventId: string;
  title: string;
  from: string;
  date: string;
  start: string;
  end: string;
}
export interface Plan {
  proposals: Proposal[];
  relocations: Relocation[];
  unplaced: Task[];
  conflicts: ReturnType<typeof conflicts>;
  revision: number;
}
export interface PlanningEngine {
  suggest(state: State, start: string, days: number, now?: Date): Plan;
}

export const deterministicPlanner: PlanningEngine = {
  suggest(state, start, days, now = new Date()) {
    const proposals: Proposal[] = [];
    const unplaced: Task[] = [];
    const relocations: Relocation[] = [];
    const occupied: Activity[] = Array.from({ length: days }, (_, n) =>
      eventsOn(state, addDays(start, n))
        .filter((e) => e.google?.busy !== false)
        .map((e) => ({
          ...e,
          date: e.occurrenceDate,
          recurrence: 'none' as const,
          until: null,
          exceptions: [],
        })),
    ).flat();
    const today = dateKey(now);
    const priorities = { high: 0, medium: 1, low: 2 };
    const scheduledTaskIds = new Set<string>();
    // Timed tasks reserve space too; events are never silently moved.
    for (let n = 0; n < days; n++) {
      const day = addDays(start, n);
      for (const task of state.tasks)
        if (task.date && task.time && !taskDone(task, day)) {
          const onDay = repeatsOn({ ...task, date: task.date }, day);
          if (onDay && !taskHasBlock(state, task, day)) {
            scheduledTaskIds.add(task.id);
            occupied.push({
              id: `task-${task.id}-${day}`,
              updatedAt: stamp(),
              title: task.title,
              date: day,
              start: task.time,
              end: timeOf(Math.min(minutes(task.time) + task.duration, 1439)),
              allDay: false,
              categoryId: task.categoryId,
              fixed: true,
              recurrence: 'none',
              until: null,
              exceptions: [],
              completedDates: [],
              location: '',
              notes: '',
              timeZone: '',
            });
          }
        }
    }
    const foundConflicts = Array.from({ length: days }, (_, n) =>
      conflicts(eventsOn(state, addDays(start, n))),
    ).flat();
    const moved = new Set<string>();
    for (const pair of foundConflicts) {
      const event = [...pair]
        .reverse()
        .find(
          (e) => !e.fixed && e.categoryId !== 'rest' && !moved.has(`${e.id}-${e.occurrenceDate}`),
        );
      if (!event) continue;
      const length = minutes(event.end) - minutes(event.start);
      for (let n = 0; n < days; n++) {
        const day = addDays(start, n);
        if (day < today) continue;
        const earliest =
          day === today ? Math.ceil((now.getHours() * 60 + now.getMinutes() + 5) / 15) * 15 : 0;
        const onDay = eventsOn({ events: occupied }, day).filter(
          (x) => !(x.id === event.id && day === event.occurrenceDate),
        );
        const slot = freeSlots(
          onDay,
          Math.max(minutes(state.settings.wake), earliest),
          minutes(state.settings.sleep),
        ).find((s) => s.end - s.start >= length + 10);
        if (!slot) continue;
        relocations.push({
          eventId: event.id,
          title: event.title,
          from: event.occurrenceDate,
          date: day,
          start: timeOf(slot.start),
          end: timeOf(slot.start + length),
        });
        moved.add(`${event.id}-${event.occurrenceDate}`);
        // Keep the original reservation while suggesting tasks so rejecting a move remains safe.
        occupied.push({
          ...event,
          id: uid(),
          date: day,
          start: timeOf(slot.start),
          end: timeOf(slot.start + length + 10),
          recurrence: 'none',
          exceptions: [],
        });
        break;
      }
    }
    const candidates = state.tasks
      .filter(
        (t) => !t.completedAt && !t.time && t.recurrence === 'none' && !scheduledTaskIds.has(t.id),
      )
      .sort(
        (a, b) =>
          priorities[a.priority] - priorities[b.priority] ||
          (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') ||
          a.id.localeCompare(b.id),
      );
    for (const task of candidates) {
      let placed = false;
      for (let n = 0; n < days; n++) {
        const day = addDays(start, n);
        if (day < today || (task.date && day < task.date) || (task.deadline && day > task.deadline))
          continue;
        const earliest =
          day === today ? Math.ceil((now.getHours() * 60 + now.getMinutes() + 5) / 15) * 15 : 0;
        const slots = freeSlots(
          eventsOn({ events: occupied }, day),
          Math.max(minutes(state.settings.wake), earliest),
          minutes(state.settings.sleep),
        );
        const slot = slots.find((s) => s.end - s.start >= task.duration + 10);
        if (!slot) continue;
        const proposal: Proposal = {
          taskId: task.id,
          title: task.title,
          date: day,
          start: timeOf(slot.start),
          end: timeOf(slot.start + task.duration),
          categoryId: task.categoryId,
          reason: `${task.priority === 'high' ? 'Prioridad alta · ' : ''}${task.duration} min + 10 min de margen${task.deadline ? ' · antes de la fecha límite' : ''}`,
        };
        proposals.push(proposal);
        occupied.push({
          id: uid(),
          updatedAt: stamp(),
          title: task.title,
          date: day,
          start: proposal.start,
          end: timeOf(slot.start + task.duration + 10),
          allDay: false,
          categoryId: task.categoryId,
          fixed: false,
          recurrence: 'none',
          until: null,
          exceptions: [],
          completedDates: [],
          location: '',
          notes: '',
          timeZone: '',
        });
        placed = true;
        break;
      }
      if (!placed) unplaced.push(task);
    }
    return {
      proposals,
      relocations,
      unplaced,
      conflicts: foundConflicts,
      revision: state.revision,
    };
  },
};

export function applyProposals(state: State, plan: Plan, selected: Set<string>) {
  if (state.revision !== plan.revision)
    throw new Error('La agenda ha cambiado. Vuelve a calcular las propuestas antes de aplicarlas.');
  for (const p of plan.proposals)
    if (selected.has(p.taskId)) {
      const task = state.tasks.find((t) => t.id === p.taskId);
      if (!task || task.completedAt) throw new Error('Una tarea ha cambiado. Recalcula el plan.');
      task.date = p.date;
      task.time = p.start;
      task.updatedAt = stamp();
    }
  for (const p of plan.relocations)
    if (selected.has(`move:${p.eventId}:${p.from}`)) {
      const event = state.events.find((e) => e.id === p.eventId);
      if (!event || event.fixed) throw new Error('La actividad ha cambiado. Recalcula el plan.');
      moveOccurrence(state, event, p.from, p.date, p.start, p.end);
    }
}

export function moveOccurrence(
  state: State,
  event: Activity,
  from: string,
  to: string,
  start = event.start,
  end = event.end,
) {
  const original = state.events.find((e) => e.id === event.id);
  if (!original) throw new Error('Esta actividad ya no existe.');
  if (original.updatedAt !== event.updatedAt)
    throw new Error('La actividad ha cambiado. Vuelve a abrirla antes de moverla.');
  if (original.recurrence === 'none') {
    Object.assign(original, {
      date: to,
      start,
      end,
      completedDates: original.completedDates.map((d) => (d === from ? to : d)),
      updatedAt: stamp(),
    });
    syncLinkedTask(state, original);
    return;
  }
  if (!original.exceptions.includes(from)) original.exceptions.push(from);
  original.updatedAt = stamp();
  state.events.push({
    ...original,
    id: uid(),
    updatedAt: stamp(),
    date: to,
    start,
    end,
    recurrence: 'none',
    until: null,
    exceptions: [],
    completedDates: original.completedDates.includes(from) ? [to] : [],
  });
}
