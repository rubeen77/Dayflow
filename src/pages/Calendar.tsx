import { useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Plus,
  Search,
} from 'lucide-react';
import {
  agendaOn,
  addDays,
  capital,
  conflicts,
  dateKey,
  durationLabel,
  eventsOn,
  formatDate,
  freeSlots,
  minutes,
  monthDays,
  range,
  shiftMonth,
  startOfWeek,
  tasksOn,
  taskHasBlock,
  weekday,
} from '../lib/dates';
import { moveOccurrence } from '../lib/planner';
import { dateSchema } from '../lib/model';
import { useDayflow } from '../state/DayflowContext';
import {
  AddButton,
  colorStyle,
  DateNav,
  EmptyState,
  IconButton,
  SectionHeading,
} from '../components/ui';
import { Timeline } from '../components/Timeline';
import { DateSwipe } from '../components/Gestures';
import type { PageProps } from './Today';
import { GoogleBadge } from '../components/GoogleEvents';
import { searchableEvents } from '../lib/googleEvents';

export function Calendar({ date, setDate, edit, inspect }: PageProps) {
  const { state } = useDayflow();
  const [mode, setMode] = useState<'day' | 'week' | 'month'>('month');
  const [search, setSearch] = useState('');
  const days = monthDays(date, state.settings.weekStart);
  const searchedDate = dateSchema.safeParse(search.trim());
  const matches = search.trim()
    ? searchedDate.success
      ? eventsOn(state, searchedDate.data)
      : searchableEvents(state).filter(
          (e) =>
            e.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) ||
            e.date.includes(search.trim()),
        )
    : [];
  return (
    <div className="page-enter">
      <SectionHeading
        eyebrow="DALE PERSPECTIVA"
        title="Tu calendario"
        description="Un lugar para tus planes. Y para los que están por llegar."
        action={<AddButton onClick={() => edit({ kind: 'event', date })} />}
      />
      <div className="calendar-toolbar">
        <div className="segmented">
          {(['day', 'week', 'month'] as const).map((m, i) => (
            <button key={m} className={mode === m ? 'selected' : ''} onClick={() => setMode(m)}>
              {['Día', 'Semana', 'Mes'][i]}
            </button>
          ))}
        </div>
        <div className="calendar-date-controls">
          {mode === 'month' ? (
            <>
              <button className="small-button" onClick={() => setDate(dateKey())}>
                Hoy
              </button>
              <IconButton
                icon={ChevronLeft}
                label="Mes anterior"
                onClick={() => setDate(shiftMonth(date, -1))}
              />
              <span className="month-label">
                {capital(formatDate(date, { month: 'long', year: 'numeric' }))}
              </span>
              <IconButton
                icon={ChevronRight}
                label="Mes siguiente"
                onClick={() => setDate(shiftMonth(date, 1))}
              />
            </>
          ) : (
            <DateNav date={date} setDate={setDate} step={mode === 'week' ? 7 : 1} />
          )}
        </div>
      </div>
      <div className="search-field calendar-search">
        <Search size={17} />
        <input
          aria-label="Buscar actividades"
          placeholder="Buscar por nombre o fecha (AAAA-MM-DD)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <DateSwipe
        previous={() =>
          setDate(
            mode === 'month' ? shiftMonth(date, -1) : addDays(date, mode === 'week' ? -7 : -1),
          )
        }
        next={() =>
          setDate(mode === 'month' ? shiftMonth(date, 1) : addDays(date, mode === 'week' ? 7 : 1))
        }
      >
        {search.trim() ? (
          <section className="panel search-results">
            {matches.length ? (
              matches.map((e) => (
                <button
                  key={e.id}
                  className="search-result"
                  onClick={() => {
                    setDate(searchedDate.success ? searchedDate.data : e.date);
                    setSearch('');
                    setMode('day');
                  }}
                >
                  <CalendarDays size={20} />
                  <div>
                    <strong>{e.title}</strong>
                    <span>
                      {formatDate(searchedDate.success ? searchedDate.data : e.date)} ·{' '}
                      {e.allDay ? 'Todo el día' : `${e.start} — ${e.end}`}
                      {e.recurrence !== 'none' ? ' · Se repite' : ''}
                    </span>
                  </div>
                </button>
              ))
            ) : (
              <EmptyState
                icon={Search}
                title="No hay coincidencias"
                description="Prueba otro nombre o usa el selector de fecha."
              />
            )}
          </section>
        ) : mode === 'day' ? (
          <section className="panel">
            <div className="panel-heading">
              <h2>
                {capital(formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' }))}
              </h2>
              <span className="muted small">{eventsOn(state, date).length} actividades</span>
            </div>
            <CalendarConflicts date={date} />
            <Timeline
              date={date}
              onEvent={inspect}
              onTask={(item) => edit({ kind: 'task', item })}
              onCreate={(time) => edit({ kind: 'event', date, time })}
            />
          </section>
        ) : mode === 'week' ? (
          <>
            <div className="calendar-week-desktop">
              <WeekBoard date={date} edit={edit} inspect={inspect} />
            </div>
            <section className="panel calendar-week-mobile">
              <div className="week-strip">
                {range(startOfWeek(date, state.settings.weekStart), 7).map((d) => (
                  <button
                    key={d}
                    aria-label={`Ver semana, día ${d}`}
                    className={d === date ? 'selected' : ''}
                    onClick={() => setDate(d)}
                  >
                    <span>{weekday(d, true)}</span>
                    <strong>{Number(d.slice(-2))}</strong>
                    <i className={agendaOn(state, d).length ? 'has-events' : ''} />
                  </button>
                ))}
              </div>
              <div className="panel-heading">
                <h2>{capital(formatDate(date, { weekday: 'long', day: 'numeric' }))}</h2>
                <span className="muted small">Desliza para cambiar de semana</span>
              </div>
              <CalendarConflicts date={date} />
              <Timeline
                key={date}
                date={date}
                onEvent={inspect}
                onTask={(item) => edit({ kind: 'task', item })}
                onCreate={(time) => edit({ kind: 'event', date, time })}
              />
            </section>
          </>
        ) : (
          <section className="panel month-calendar">
            <div className="month-weekdays">
              {range(startOfWeek(date, state.settings.weekStart), 7).map((d) => (
                <span key={d}>{weekday(d, true)}</span>
              ))}
            </div>
            <div className="month-grid">
              {days.map((d) => {
                const events = eventsOn(state, d);
                const tasks = tasksOn(state, d);
                return (
                  <div
                    key={d}
                    className={`month-cell ${d.slice(0, 7) !== date.slice(0, 7) ? 'outside' : ''} ${d === dateKey() ? 'today-cell' : ''}`}
                  >
                    <button
                      className="month-day-number"
                      aria-label={`Ver día ${d}`}
                      onClick={() => {
                        setDate(d);
                        setMode('day');
                      }}
                    >
                      {Number(d.slice(-2))}
                    </button>
                    <div className="month-cell-events">
                      {events.slice(0, 3).map((e) => (
                        <button
                          key={e.id}
                          style={colorStyle(
                            e.google?.color ??
                              state.settings.categories.find((c) => c.id === e.categoryId)?.color ??
                              '#b6a0f7',
                          )}
                          onClick={() => inspect(e)}
                        >
                          <i />
                          <span>
                            {!e.allDay && <small>{e.start} </small>}
                            {e.google ? '☁ ' : ''}
                            {e.title}
                          </span>
                        </button>
                      ))}
                      {tasks.slice(0, 1).map((t) => (
                        <button
                          key={t.id}
                          className="month-task"
                          onClick={() => edit({ kind: 'task', item: t })}
                        >
                          <span>□ {t.title}</span>
                        </button>
                      ))}
                      {events.length > 3 && (
                        <button
                          className="month-more"
                          onClick={() => {
                            setDate(d);
                            setMode('day');
                          }}
                        >
                          +{events.length - 3} más
                        </button>
                      )}
                    </div>
                    <button
                      className="month-add"
                      aria-label={`Crear actividad el ${d}`}
                      onClick={() => edit({ kind: 'event', date: d })}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </DateSwipe>
      <div className="calendar-legend">
        {!!state.googleEvents.length && <GoogleBadge />}
        {state.settings.categories.map((c) => (
          <span key={c.id}>
            <i style={{ background: c.color }} />
            {c.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function CalendarConflicts({ date }: { date: string }) {
  const { state } = useDayflow();
  const pairs = conflicts(agendaOn(state, date));
  return pairs.length ? (
    <div className="calendar-conflicts" role="status">
      <AlertCircle size={16} />
      <div>
        <strong>
          {pairs.length} solapamiento{pairs.length > 1 ? 's' : ''}
        </strong>
        {pairs.map(([a, b], i) => (
          <p key={i}>
            {a.title} · {b.title}
          </p>
        ))}
        <small>Abre una actividad y usa «Editar / mover» para cambiar su horario.</small>
      </div>
    </div>
  ) : null;
}

export function WeekBoard({
  date,
  edit,
  inspect,
  showGaps = false,
}: Pick<PageProps, 'date' | 'edit' | 'inspect'> & { showGaps?: boolean }) {
  const { state, save } = useDayflow();
  const days = range(startOfWeek(date, state.settings.weekStart), 7);
  const [dragDay, setDragDay] = useState<string | null>(null);
  return (
    <div className="week-board-scroll">
      <div className="week-board">
        {days.map((d) => {
          const events = eventsOn(state, d);
          const tasks = tasksOn(state, d).filter((t) => !taskHasBlock(state, t, d));
          const agenda = agendaOn(state, d);
          const overlaps = conflicts(agenda);
          const slots = freeSlots(
            agenda,
            minutes(state.settings.wake),
            minutes(state.settings.sleep),
          );
          return (
            <section
              key={d}
              className={`week-column ${d === dateKey() ? 'current-column' : ''} ${dragDay === d ? 'drop-active' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setDragDay(d);
              }}
              onDragLeave={() => setDragDay(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragDay(null);
                try {
                  const data = JSON.parse(e.dataTransfer.getData('application/dayflow'));
                  const activity = state.events.find((x) => x.id === data.id);
                  if (activity && data.from !== d)
                    void save((s) => moveOccurrence(s, activity, data.from, d), 'Actividad movida');
                } catch {
                  /* External drags are ignored. */
                }
              }}
            >
              <div className="week-column-heading">
                <span>{weekday(d, true)}</span>
                <strong>{Number(d.slice(-2))}</strong>
                <small>{formatDate(d, { month: 'short' }).replace('.', '')}</small>
              </div>
              {overlaps.length > 0 && (
                <div className="overlap-tag">
                  <AlertCircle size={12} />
                  {overlaps.length} solapamiento{overlaps.length > 1 ? 's' : ''}
                </div>
              )}
              <div className="week-column-body">
                {events.map((e) => (
                  <button
                    key={e.id}
                    className="week-event"
                    draggable
                    style={colorStyle(
                      e.google?.color ??
                        state.settings.categories.find((c) => c.id === e.categoryId)?.color ??
                        '#b6a0f7',
                    )}
                    onDragStart={(ev) => {
                      ev.dataTransfer.setData(
                        'application/dayflow',
                        JSON.stringify({ id: e.id, from: d }),
                      );
                      ev.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragEnd={() => setDragDay(null)}
                    onClick={() => inspect(e)}
                  >
                    <span>
                      {e.allDay ? 'Todo el día' : `${e.start} — ${e.end}`}
                      <GripVertical size={11} />
                    </span>
                    <strong>{e.title}</strong>
                    {e.google && <GoogleBadge />}
                    <small>
                      {e.sourceTaskId
                        ? 'Tarea planificada'
                        : e.fixed
                          ? 'Bloque fijo'
                          : 'Actividad flexible'}
                    </small>
                  </button>
                ))}
                {tasks.map((t) => (
                  <button
                    className="week-task"
                    key={t.id}
                    onClick={() => edit({ kind: 'task', item: t })}
                  >
                    <span>{t.time ?? 'Sin hora'} · Tarea</span>
                    <strong>{t.title}</strong>
                  </button>
                ))}
                {showGaps &&
                  slots
                    .filter((s) => s.end - s.start >= 30)
                    .slice(0, 3)
                    .map((slot) => (
                      <button
                        className="free-block"
                        key={slot.start}
                        onClick={() =>
                          edit({
                            kind: 'event',
                            date: d,
                            time: `${String(Math.floor(slot.start / 60)).padStart(2, '0')}:${String(slot.start % 60).padStart(2, '0')}`,
                          })
                        }
                      >
                        <span>{durationLabel(slot.end - slot.start)} libres</span>
                        <small>
                          {`${String(Math.floor(slot.start / 60)).padStart(2, '0')}:${String(slot.start % 60).padStart(2, '0')}`}{' '}
                          en adelante
                        </small>
                        <Plus size={13} />
                      </button>
                    ))}
                {!events.length && !tasks.length && !showGaps && (
                  <span className="week-empty">Sin planes todavía</span>
                )}
                <button className="week-add" onClick={() => edit({ kind: 'event', date: d })}>
                  <Plus size={15} />
                  <span>Añadir</span>
                </button>
              </div>
              <div className="week-column-footer">
                {durationLabel(slots.reduce((n, s) => n + s.end - s.start, 0))} disponibles
              </div>
            </section>
          );
        })}
      </div>
      <p className="helper board-help">
        Arrastra una actividad a otro día. En pantalla táctil, ábrela y pulsa «Editar / mover» para
        cambiar su fecha y hora.
      </p>
    </div>
  );
}
