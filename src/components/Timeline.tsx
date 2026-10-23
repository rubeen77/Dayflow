import { useEffect, useRef, useState } from 'react';
import { CalendarPlus, Check, LockKeyhole, Repeat2 } from 'lucide-react';
import {
  dateKey,
  durationLabel,
  eventsOn,
  minutes,
  taskDone,
  taskHasBlock,
  tasksOn,
  timeOf,
} from '../lib/dates';
import { moveOccurrence } from '../lib/planner';
import type { Occurrence, Task } from '../lib/model';
import { useDayflow, useNow } from '../state/DayflowContext';
import { colorStyle, EmptyState } from './ui';
import { GoogleBadge } from './GoogleEvents';
import { googleDuration, zonedParts } from '../lib/googleEvents';

export function Timeline({
  date,
  onEvent,
  onTask,
  onCreate,
}: {
  date: string;
  onEvent: (e: Occurrence) => void;
  onTask: (t: Task) => void;
  onCreate: (time?: string) => void;
}) {
  const { state, save, notify } = useDayflow();
  const [dropMinute, setDropMinute] = useState<number | null>(null);
  const now = useNow();
  const scroll = useRef<HTMLDivElement>(null);
  const events = eventsOn(state, date);
  const tasks = tasksOn(state, date).filter((t) => t.time && !taskHasBlock(state, t, date));
  const startHour = Math.min(
    6,
    Math.floor(minutes(state.settings.wake) / 60),
    ...events.filter((e) => !e.allDay).map((e) => Math.floor(minutes(e.start) / 60)),
    ...tasks.map((t) => Math.floor(minutes(t.time!) / 60)),
  );
  const endHour = 24;
  const px = 1.05;
  const entries = [
    ...events
      .filter((e) => !e.allDay)
      .map((e) => ({
        key: e.id,
        start: minutes(e.start),
        end: minutes(e.end),
        title: e.title,
        color:
          e.google?.color ??
          state.settings.categories.find((c) => c.id === e.categoryId)?.color ??
          '#b6a0f7',
        done: e.completedDates.includes(date),
        event: e,
        task: undefined as Task | undefined,
      })),
    ...tasks.map((t) => ({
      key: t.id,
      start: minutes(t.time!),
      end: Math.min(1440, minutes(t.time!) + t.duration),
      title: t.title,
      color: state.settings.categories.find((c) => c.id === t.categoryId)?.color ?? '#b6a0f7',
      done: taskDone(t, date),
      event: undefined as Occurrence | undefined,
      task: t,
    })),
  ].sort((a, b) => a.start - b.start || b.end - a.end);
  // Connected overlap groups share a lane count. Reuse a lane only after its event ends.
  const layouts: ((typeof entries)[number] & { lane: number; lanes: number })[] = [];
  let group: (typeof layouts)[number][] = [];
  let groupEnd = -1;
  let laneEnds: number[] = [];
  const flush = () => {
    for (const item of group) item.lanes = laneEnds.length;
    layouts.push(...group);
    group = [];
    laneEnds = [];
  };
  for (const entry of entries) {
    if (entry.start >= groupEnd && group.length) flush();
    let lane = laneEnds.findIndex((end) => end <= entry.start);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = entry.end;
    groupEnd = Math.max(groupEnd, entry.end);
    group.push({ ...entry, lane, lanes: 1 });
  }
  flush();
  useEffect(() => {
    const first = events.find((e) => !e.allDay);
    const target =
      date === dateKey() && entries.length
        ? Math.max(startHour * 60, now.getHours() * 60 - 60)
        : first
          ? minutes(first.start) - 45
          : minutes(state.settings.wake);
    if (scroll.current) scroll.current.scrollTop = Math.max(0, target - startHour * 60) * px;
    // Reset the viewport only on a date change; ticking the clock must not move the user's scroll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);
  const currentMinute = now.getHours() * 60 + now.getMinutes();
  return (
    <>
      {events.some((e) => e.allDay) && (
        <div className="all-day-row">
          <span>Todo el día</span>
          {events
            .filter((e) => e.allDay)
            .map((e) => (
              <button
                key={e.id}
                className="all-day-chip"
                style={colorStyle(
                  e.google?.color ??
                    state.settings.categories.find((c) => c.id === e.categoryId)?.color ??
                    '#b6a0f7',
                )}
                onClick={() => onEvent(e)}
              >
                {e.google && <GoogleBadge />}
                {e.title}
              </button>
            ))}
        </div>
      )}
      <div className="timeline-scroll" ref={scroll}>
        <div
          className="timeline-canvas"
          style={{ height: (endHour - startHour) * 60 * px }}
          onDragOver={(e) => {
            e.preventDefault();
            const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
            setDropMinute(
              Math.max(0, Math.min(1425, Math.round((startHour * 60 + y / px) / 15) * 15)),
            );
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropMinute(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            const target = dropMinute;
            setDropMinute(null);
            if (target === null) return;
            try {
              const data = JSON.parse(e.dataTransfer.getData('application/dayflow'));
              const event = state.events.find((x) => x.id === data.id);
              if (!event || event.allDay) return;
              const length = minutes(event.end) - minutes(event.start);
              if (target + length > 1439) {
                notify('El bloque debe terminar dentro de este día.');
                return;
              }
              void save(
                (s) =>
                  moveOccurrence(
                    s,
                    event,
                    data.from,
                    date,
                    timeOf(target),
                    timeOf(target + length),
                  ),
                'Horario actualizado',
              );
            } catch {
              /* Ignore unrelated drags. */
            }
          }}
        >
          {dropMinute !== null && (
            <div className="drop-time-marker" style={{ top: (dropMinute - startHour * 60) * px }}>
              {timeOf(dropMinute)}
            </div>
          )}
          {Array.from({ length: endHour - startHour }, (_, i) => i + startHour).map((h) => (
            <div key={h} className="hour-line" style={{ top: (h - startHour) * 60 * px }}>
              <span>{String(h).padStart(2, '0')}:00</span>
              <button
                aria-label={`Crear actividad a las ${h}:00`}
                onClick={() => onCreate(timeOf(h * 60))}
              />
            </div>
          ))}
          {layouts.map((e) => (
            <button
              key={e.key}
              draggable={!!e.event && !e.event.fixed}
              onDragStart={(ev) => {
                if (e.event) {
                  ev.dataTransfer.setData(
                    'application/dayflow',
                    JSON.stringify({ id: e.event.id, from: date }),
                  );
                  ev.dataTransfer.effectAllowed = 'move';
                }
              }}
              onDragEnd={() => setDropMinute(null)}
              className={`timeline-event ${e.done ? 'is-done' : ''} ${e.task ? 'is-task' : ''}`}
              style={{
                ...colorStyle(e.color),
                top: (e.start - startHour * 60) * px + 3,
                minHeight: Math.max(32, (e.end - e.start) * px - 6),
                left: `calc(66px + (100% - 80px) * ${e.lane / e.lanes})`,
                width: `calc((100% - 80px) / ${e.lanes} - 5px)`,
              }}
              onClick={() => (e.event ? onEvent(e.event) : onTask(e.task!))}
            >
              <span className="event-topline">
                <span>
                  {timeOf(e.start)} —{' '}
                  {e.event?.clockChange
                    ? zonedParts(e.event.google!.end.dateTime!).time
                    : e.end === 1440
                      ? '24:00'
                      : timeOf(e.end)}
                </span>
                <span>
                  {e.done ? (
                    <Check size={12} />
                  ) : e.event?.fixed ? (
                    <LockKeyhole size={12} />
                  ) : e.event?.recurrence !== 'none' && e.event ? (
                    <Repeat2 size={12} />
                  ) : null}
                </span>
              </span>
              <strong>{e.title}</strong>
              {e.event?.google && (
                <GoogleBadge name={e.event.clockChange ? 'Cambio de horario' : undefined} />
              )}
              {e.end - e.start >= 50 && (
                <span className="event-description">
                  {e.task || e.event?.sourceTaskId
                    ? 'Tarea · Bloque de tiempo'
                    : e.event?.location ||
                      state.settings.categories.find((c) => c.id === e.event?.categoryId)
                        ?.name}{' '}
                  ·{' '}
                  {durationLabel(
                    e.event?.google ? googleDuration(e.event.google) : e.end - e.start,
                  )}
                </span>
              )}
            </button>
          ))}
          {!entries.length && !events.some((e) => e.allDay) && (
            <div
              className="timeline-empty"
              style={{ top: Math.max(0, minutes(state.settings.wake) - startHour * 60) * px + 34 }}
            >
              <EmptyState
                icon={CalendarPlus}
                title="Un día lleno de posibilidades"
                description="Reserva tiempo para lo que te importa. Lo demás encontrará su lugar."
                action={() => onCreate()}
                actionLabel="Planificar mi día"
              />
            </div>
          )}
          {date === dateKey(now) && currentMinute >= startHour * 60 && (
            <div className="now-line" style={{ top: (currentMinute - startHour * 60) * px }}>
              <span>{timeOf(currentMinute)}</span>
              <i />
              <b />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
