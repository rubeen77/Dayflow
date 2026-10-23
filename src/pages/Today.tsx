import { useState, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronRight,
  Clock3,
  Flame,
  Leaf,
  Play,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Target,
} from 'lucide-react';
import {
  addDays,
  capital,
  dateKey,
  durationLabel,
  eventsOn,
  formatDate,
  minutes,
  range,
  startOfWeek,
  weekday,
} from '../lib/dates';
import { dashboardLayout, isUrgent, summarizeDay } from '../lib/day';
import { toggleTask } from '../lib/actions';
import { stamp, type Occurrence, type View } from '../lib/model';
import { useDayflow, useNow } from '../state/DayflowContext';
import type { EditorState } from '../components/Editors';
import {
  CategoryBadge,
  CheckButton,
  colorStyle,
  DateNav,
  IconButton,
  Modal,
  PanelHeading,
  ProgressRing,
} from '../components/ui';
import { Timeline } from '../components/Timeline';
import { GoogleBadge } from '../components/GoogleEvents';
import { googleDuration } from '../lib/googleEvents';

export interface PageProps {
  date: string;
  setDate: (s: string) => void;
  edit: (e: EditorState) => void;
  inspect: (e: Occurrence) => void;
  navigate: (v: View) => void;
  capture: (text?: string, onSaved?: () => void) => void;
}
const cardNames = {
  next: 'Próxima actividad',
  priorities: 'Tus prioridades',
  progress: 'Progreso diario',
  habits: 'Pequeños rituales',
  tomorrow: 'Lo que viene mañana',
  focus: 'Concentración',
};
const compactDuration = (value: number) =>
  value < 60
    ? `${Math.round(value)}m`
    : `${Math.floor(value / 60)}h${value % 60 ? ` ${Math.round(value % 60)}m` : ''}`;

export function Today({ date, setDate, edit, inspect, navigate, capture }: PageProps) {
  const { state, save, pending } = useDayflow();
  const now = useNow(10000);
  const today = dateKey(now);
  const [customize, setCustomize] = useState(false);
  const [quick, setQuick] = useState('');
  const day = summarizeDay(state, date, now);
  const layout = dashboardLayout(state.settings);
  const greeting =
    date !== today
      ? capital(weekday(date))
      : now.getHours() < 13
        ? 'Buenos días'
        : now.getHours() < 21
          ? 'Buenas tardes'
          : 'Buenas noches';
  const focusMinutes = state.sessions
    .filter((s) => dateKey(new Date(s.startedAt)) === date)
    .reduce((n, s) => n + s.minutes, 0);
  const openItem = (item: Occurrence) => {
    if (item.id.startsWith('task:')) {
      const task = state.tasks.find((t) => `task:${t.id}` === item.id);
      if (task) edit({ kind: 'task', item: task });
    } else inspect(item);
  };
  const startsIn = day.next
    ? day.next.google?.start.dateTime
      ? Math.ceil((Date.parse(day.next.google.start.dateTime) - now.getTime()) / 60000)
      : minutes(day.next.start) - now.getHours() * 60 - now.getMinutes()
    : 0;
  const cards: Record<keyof typeof cardNames, ReactNode> = {
    next: (
      <section className="next-panel next-featured">
        <div className="panel-heading">
          <span className="eyebrow">
            <span className="status-dot" />
            {day.next
              ? date === today && startsIn <= 0
                ? 'AHORA MISMO'
                : 'TU PRÓXIMO PASO'
              : 'ESPACIO PARA TI'}
          </span>
          <CalendarDays size={17} />
        </div>
        <h3>
          {day.next?.title ??
            (day.agenda.length ? 'Has llegado al final de tus planes' : 'Un día por diseñar')}
        </h3>
        {day.next ? (
          <>
            <div className="next-timing">
              <strong>
                {date === today
                  ? startsIn > 0
                    ? `Empieza en ${durationLabel(startsIn)}`
                    : `Quedan ${durationLabel(day.next.google?.end.dateTime ? (Date.parse(day.next.google.end.dateTime) - now.getTime()) / 60000 : minutes(day.next.end) - now.getHours() * 60 - now.getMinutes())}`
                  : `${day.next.start} — ${day.next.end}`}
              </strong>
              <span>
                {durationLabel(
                  day.next.google
                    ? googleDuration(day.next.google)
                    : minutes(day.next.end) - minutes(day.next.start),
                )}{' '}
                de duración
              </span>
            </div>
            <p>
              {day.next.start} — {day.next.end}
              {day.next.location && ` · ${day.next.location}`}
            </p>
            <div className="next-bottom">
              {day.next.google ? (
                <GoogleBadge name={day.next.google.calendarName} />
              ) : (
                <CategoryBadge id={day.next.categoryId} />
              )}
              <button className="text-button" onClick={() => openItem(day.next!)}>
                Ver actividad
                <ArrowRight size={16} />
              </button>
            </div>
          </>
        ) : (
          <>
            <p>
              {day.free
                ? `${durationLabel(day.free)} disponibles para lo que te importa.`
                : 'Tu tiempo de descanso también cuenta.'}
            </p>
            <button className="text-button" onClick={() => edit({ kind: 'event', date })}>
              Crear mi primera actividad
              <ArrowRight size={15} />
            </button>
          </>
        )}
      </section>
    ),
    priorities: (
      <section className="panel priorities-panel">
        <PanelHeading title="Tus prioridades">
          <span className={day.urgent.length ? 'urgent-count' : 'muted small'}>
            {day.urgent.length
              ? `${day.urgent.length} urgentes`
              : `${day.pending.length} pendientes`}
          </span>
        </PanelHeading>
        <div className="compact-task-list">
          {day.pending.slice(0, 4).map((t) => (
            <div className={`compact-task ${isUrgent(t, date) ? 'urgent-task' : ''}`} key={t.id}>
              <CheckButton
                checked={false}
                disabled={pending > 0 || date > today}
                label={`Completar ${t.title}`}
                onClick={() => void save((s) => toggleTask(s, t.id, date), 'Tarea completada')}
              />
              <button onClick={() => edit({ kind: 'task', item: t })}>
                <strong>{t.title}</strong>
                <span>
                  {t.deadline && t.deadline <= date
                    ? t.deadline < date
                      ? 'Fecha límite vencida'
                      : 'Vence hoy'
                    : t.priority === 'high'
                      ? 'Prioridad alta'
                      : t.date && t.date < date
                        ? 'Pendiente de otro día'
                        : (t.time ?? 'Sin hora')}
                  <i />
                  {durationLabel(t.duration)}
                  {t.subtasks.length > 0 &&
                    ` · ${t.subtasks.filter((x) => x.done).length}/${t.subtasks.length} pasos`}
                </span>
              </button>
              <span className={`priority-dot ${t.priority}`} />
            </div>
          ))}
          {!day.pending.length && (
            <p className="empty-priorities">
              Todo al día. Captura lo siguiente cuando lo necesites.
            </p>
          )}
        </div>
        <button className="panel-bottom-button" onClick={() => edit({ kind: 'task' })}>
          <Plus size={15} />
          Añadir una tarea
          <ChevronRight size={14} />
        </button>
      </section>
    ),
    progress: (
      <section className="panel progress-panel">
        <div>
          <span className="eyebrow">PASO A PASO</span>
          <h2>Tu progreso {date === today ? 'de hoy' : 'del día'}</h2>
          <p>
            {day.total
              ? `${day.done} de ${day.total} pasos completados`
              : 'Cada día es un nuevo comienzo'}
          </p>
        </div>
        <ProgressRing progress={day.progress} size={68} />
      </section>
    ),
    habits: (
      <section className="panel habits-summary">
        <PanelHeading title="Pequeños rituales" aside={`${day.doneHabits}/${day.habits.length}`} />
        {day.habits.map((h) => (
          <button
            className={`habit-mini ${h.completions.includes(date) ? 'is-done' : ''}`}
            key={h.id}
            disabled={date > today || pending > 0}
            aria-pressed={h.completions.includes(date)}
            onClick={() =>
              void save((s) => {
                const x = s.habits.find((x) => x.id === h.id);
                if (x) {
                  x.completions = x.completions.includes(date)
                    ? x.completions.filter((d) => d !== date)
                    : [...x.completions, date];
                  x.updatedAt = stamp();
                }
              })
            }
          >
            <span
              className="habit-mini-icon"
              style={colorStyle(
                state.settings.categories.find((c) => c.id === h.categoryId)?.color ?? '#b6a0f7',
              )}
            >
              {h.completions.includes(date) ? <Check size={17} /> : <Flame size={17} />}
            </span>
            <span>{h.title}</span>
            <span className={`habit-mini-check ${h.completions.includes(date) ? 'checked' : ''}`}>
              {h.completions.includes(date) && <Check size={12} />}
            </span>
          </button>
        ))}
        {!day.habits.length && (
          <p className="empty-inline">
            {state.habits.some((h) => !h.archived)
              ? 'Día de descanso. Tu racha está a salvo.'
              : 'Una buena rutina empieza con un pequeño paso.'}
          </p>
        )}
        <button className="panel-bottom-button" onClick={() => navigate('habits')}>
          Ver mis hábitos
          <ChevronRight size={14} />
        </button>
      </section>
    ),
    tomorrow: (
      <section className="panel tomorrow-panel">
        <PanelHeading
          title="Lo que viene mañana"
          aside={formatDate(addDays(date, 1), { day: 'numeric', month: 'short' })}
        />
        {day.tomorrow.slice(0, 3).map((e) => (
          <button
            key={e.id}
            className="tomorrow-item"
            style={colorStyle(
              e.google?.color ??
                state.settings.categories.find((c) => c.id === e.categoryId)?.color ??
                '#b6a0f7',
            )}
            onClick={() => openItem(e)}
          >
            <span>{e.allDay ? 'Todo el día' : e.start}</span>
            <strong>
              {e.google ? '☁ ' : ''}
              {e.title}
            </strong>
            <ChevronRight size={14} />
          </button>
        ))}
        {!day.tomorrow.length && (
          <p className="empty-inline">Todavía no hay bloques. Puedes empezar a preparar el día.</p>
        )}
        <button
          className="panel-bottom-button"
          onClick={() => {
            setDate(addDays(date, 1));
            navigate('calendar');
          }}
        >
          Preparar mañana
          <ArrowRight size={14} />
        </button>
      </section>
    ),
    focus: (
      <button className="focus-promo" onClick={() => navigate('focus')}>
        <span className="focus-promo-icon">
          <Play size={18} fill="currentColor" />
        </span>
        <div>
          <strong>{state.focus ? 'Tu sesión sigue contigo' : 'Una cosa a la vez'}</strong>
          <span>{state.focus ? 'Volver a concentración' : 'Encuentra tu momento de foco'}</span>
        </div>
        <ArrowRight size={17} />
      </button>
    ),
  };
  return (
    <div className="page-enter dayflow-v2">
      <div className="day-heading">
        <div>
          <span className="eyebrow">
            <span className="status-dot" />
            {capital(formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' }))}
          </span>
          <h1>
            {greeting}
            {state.settings.name ? `, ${state.settings.name.split(' ')[0]}` : ''}
            <span className="greeting-dot">.</span>
          </h1>
          <p>
            {day.urgent.length
              ? `${day.urgent.length} pendientes importantes. Vamos paso a paso.`
              : day.agenda.length
                ? `${day.agenda.length} bloques y ${durationLabel(day.free)} de margen.`
                : 'Un poco de claridad. Más espacio para ti.'}
          </p>
        </div>
        <div className="day-heading-actions">
          <IconButton
            icon={SlidersHorizontal}
            label="Personalizar Mi día"
            onClick={() => setCustomize(true)}
          />
          <DateNav date={date} setDate={setDate} />
        </div>
      </div>
      <section className="day-hero">
        <div className="hero-copy">
          <span className="hero-tag">
            <Sparkles size={13} />
            TU DÍA, CON INTENCIÓN
          </span>
          <h2>
            Haz espacio para lo importante<span>.</span>
          </h2>
          <p>{state.settings.goal || 'Un poco de orden para vivir con más calma.'}</p>
        </div>
        <div className="hero-art" aria-hidden="true">
          <svg viewBox="0 0 440 270">
            <defs>
              <linearGradient id="orb" x2=".8" y2="1">
                <stop stopColor="#f0e8ff" />
                <stop offset="1" stopColor="#8d7ab9" />
              </linearGradient>
            </defs>
            <g transform="rotate(-24 260 136)">
              <ellipse
                cx="260"
                cy="136"
                rx="154"
                ry="54"
                fill="none"
                stroke="#eee7ff"
                opacity=".7"
              />
              <circle cx="260" cy="136" r="85" fill="url(#orb)" />
              <path
                d="M106 136c0 30 69 54 154 54s154-24 154-54"
                fill="none"
                stroke="#f9f6ff"
                strokeWidth="2"
              />
            </g>
            <circle cx="366" cy="65" r="19" fill="#e3d8f6" />
          </svg>
        </div>
      </section>
      <div className="daily-metrics">
        {[
          {
            label: 'Tareas',
            value: `${day.doneTasks}/${day.tasks.length}`,
            icon: CheckCheck,
            color: 'lilac',
          },
          {
            label: 'Planificado',
            value: compactDuration(day.planned),
            icon: Clock3,
            color: 'blue',
          },
          {
            label: date === today ? 'Tiempo libre restante' : 'Tiempo libre',
            value: compactDuration(day.free),
            icon: Leaf,
            color: 'green',
          },
          {
            label: 'Concentración',
            value: compactDuration(focusMinutes),
            icon: Target,
            color: 'peach',
          },
        ].map((m) => (
          <div className="metric-card" key={m.label}>
            <span className={`metric-icon ${m.color}`}>
              <m.icon size={18} />
            </span>
            <div>
              <span>{m.label}</span>
              <strong>{m.value}</strong>
            </div>
          </div>
        ))}
      </div>
      <form
        className="day-quick-capture search-field"
        onSubmit={(e) => {
          e.preventDefault();
          capture(quick, () => setQuick(''));
        }}
      >
        <Sparkles size={17} />
        <input
          aria-label="Capturar desde Mi día"
          placeholder="Por ejemplo: Estudiar mañana a las 17:00"
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          enterKeyHint="go"
        />
        <button className="small-button" disabled={!quick.trim()}>
          Revisar
        </button>
      </form>
      <div className="day-workspace">
        {layout.order
          .filter((id) => !layout.hidden.includes(id))
          .map((id, i) => (
            <div className="dashboard-widget" data-card={id} key={id} style={{ order: i * 2 }}>
              {cards[id]}
            </div>
          ))}
        <section className="panel agenda-panel day-agenda" style={{ order: 3 }}>
          <PanelHeading title="Tu línea del día">
            <span className="live-label">
              <i />
              {date === today ? 'HOY' : capital(weekday(date, true))}
            </span>
            <button className="text-button" onClick={() => navigate('calendar')}>
              Ver calendario
              <ChevronRight size={15} />
            </button>
          </PanelHeading>
          <div className="week-strip">
            {range(startOfWeek(date, state.settings.weekStart), 7).map((d) => (
              <button
                aria-label={`Seleccionar ${d}`}
                className={`${d === date ? 'selected' : ''} ${d === today ? 'is-today' : ''}`}
                key={d}
                onClick={() => setDate(d)}
              >
                <span>{weekday(d, true)}</span>
                <strong>{Number(d.slice(-2))}</strong>
                <i className={eventsOn(state, d).length ? 'has-events' : ''} />
              </button>
            ))}
          </div>
          <div key={date} className="timeline-transition">
            <Timeline
              date={date}
              onEvent={inspect}
              onTask={(item) => edit({ kind: 'task', item })}
              onCreate={(time) => edit({ kind: 'event', date, time })}
            />
          </div>
          <button className="agenda-add" onClick={() => edit({ kind: 'event', date })}>
            <Plus size={16} />
            Añadir una actividad<span>Hazle hueco en tu día</span>
          </button>
        </section>
      </div>
      {customize && (
        <Modal
          title="Tu día, a tu manera"
          eyebrow="PERSONALIZAR INICIO"
          onClose={() => setCustomize(false)}
        >
          <div className="plan-body">
            <p>Elige qué tarjetas ver y qué quieres encontrar primero.</p>
            {layout.order.map((id, index) => (
              <div className="dashboard-setting" key={id}>
                <label>
                  <input
                    type="checkbox"
                    aria-label={`Mostrar ${cardNames[id]}`}
                    checked={!layout.hidden.includes(id)}
                    disabled={pending > 0}
                    onChange={() =>
                      void save((s) => {
                        const current = dashboardLayout(s.settings);
                        s.settings.dashboard = {
                          ...current,
                          hidden: current.hidden.includes(id)
                            ? current.hidden.filter((x) => x !== id)
                            : [...current.hidden, id],
                        };
                      })
                    }
                  />
                  {cardNames[id]}
                </label>
                <IconButton
                  icon={ArrowUp}
                  label={`Subir ${cardNames[id]}`}
                  disabled={index === 0 || pending > 0}
                  onClick={() =>
                    void save((s) => {
                      const current = dashboardLayout(s.settings);
                      const i = current.order.indexOf(id);
                      if (i > 0)
                        [current.order[i - 1], current.order[i]] = [
                          current.order[i],
                          current.order[i - 1],
                        ];
                      s.settings.dashboard = current;
                    })
                  }
                />
                <IconButton
                  icon={ArrowDown}
                  label={`Bajar ${cardNames[id]}`}
                  disabled={index === layout.order.length - 1 || pending > 0}
                  onClick={() =>
                    void save((s) => {
                      const current = dashboardLayout(s.settings);
                      const i = current.order.indexOf(id);
                      if (i < current.order.length - 1)
                        [current.order[i], current.order[i + 1]] = [
                          current.order[i + 1],
                          current.order[i],
                        ];
                      s.settings.dashboard = current;
                    })
                  }
                />
              </div>
            ))}
            <button className="primary-button" onClick={() => setCustomize(false)}>
              Listo
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
