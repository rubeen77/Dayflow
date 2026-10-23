import { useState } from 'react';
import { ArrowUpRight, BarChart3, CheckCheck, Clock3, Flame, TrendingUp } from 'lucide-react';
import {
  addDays,
  dateKey,
  daysBetween,
  durationLabel,
  eventsOn,
  formatDate,
  habitRate,
  range,
  startOfWeek,
  weekday,
} from '../lib/dates';
import { useDayflow } from '../state/DayflowContext';
import { Momentum } from '../components/Momentum';
import { colorStyle, EmptyState, MiniBars, PanelHeading, SectionHeading } from '../components/ui';

export function Stats() {
  const { state } = useDayflow();
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const today = dateKey();
  const start =
    period === 'week' ? startOfWeek(today, state.settings.weekStart) : `${today.slice(0, 7)}-01`;
  const days = range(start, daysBetween(start, today) + 1);
  const prevEnd = addDays(start, -1);
  const prevStart = addDays(start, -days.length);
  const completedDates = state.tasks.flatMap((t) =>
    t.recurrence === 'none'
      ? t.completedAt
        ? [dateKey(new Date(t.completedAt))]
        : []
      : t.doneDates,
  );
  const completed = completedDates.filter((d) => d >= start && d <= today).length;
  const previous = completedDates.filter((d) => d >= prevStart && d <= prevEnd).length;
  const sessions = state.sessions.filter((s) => {
    const d = dateKey(new Date(s.startedAt));
    return d >= start && d <= today;
  });
  const totalFocus = sessions.reduce((n, s) => n + s.minutes, 0);
  const studyMinutes = sessions
    .filter((s) => s.categoryId === 'study')
    .reduce((n, s) => n + s.minutes, 0);
  const habits = state.habits.filter((h) => !h.archived).map((h) => habitRate(h, start, today));
  const totalHabit = habits.reduce((n, h) => n + h.total, 0);
  const doneHabit = habits.reduce((n, h) => n + h.done, 0);
  const taskBars = days.map((d) => completedDates.filter((day) => day === d).length);
  const focusBars = days.map((d) =>
    Math.round(
      sessions
        .filter((s) => dateKey(new Date(s.startedAt)) === d)
        .reduce((n, s) => n + s.minutes, 0),
    ),
  );
  const chartIndices =
    days.length <= 8
      ? days.map((_, i) => i)
      : Array.from({ length: Math.ceil(days.length / 4) }, (_, i) => i * 4);
  const aggregate = (values: number[]) =>
    chartIndices.map((i) =>
      values.slice(i, days.length <= 8 ? i + 1 : i + 4).reduce((n, v) => n + v, 0),
    );
  const labels = chartIndices.map((i) =>
    days.length <= 8
      ? weekday(days[i], true)
      : `${Number(days[i].slice(-2))}–${Number(days[Math.min(i + 3, days.length - 1)].slice(-2))}`,
  );
  const recordedActivities = days.flatMap((day) =>
    eventsOn(state, day).filter((e) => e.completedDates.includes(day) && !e.allDay),
  );
  const categoryTimes = state.settings.categories.map((c) => ({
    ...c,
    minutes: recordedActivities
      .filter((e) => e.categoryId === c.id)
      .reduce(
        (n, e) =>
          n +
          Number(e.end.slice(0, 2)) * 60 +
          Number(e.end.slice(3)) -
          Number(e.start.slice(0, 2)) * 60 -
          Number(e.start.slice(3)),
        0,
      ),
  }));
  const recordedTotal = categoryTimes.reduce((n, c) => n + c.minutes, 0);
  const best =
    taskBars.length && Math.max(...taskBars) > 0
      ? days[taskBars.indexOf(Math.max(...taskBars))]
      : null;
  const records =
    completedDates.length +
    state.sessions.length +
    state.habits.reduce((n, h) => n + h.completions.length, 0) +
    state.events.reduce((n, e) => n + e.completedDates.length, 0);
  return (
    <div className="page-enter">
      <SectionHeading
        eyebrow="TU PROGRESO, CON PERSPECTIVA"
        title="Cada paso cuenta"
        description="Una mirada honesta a cómo estás dedicando tu tiempo."
        action={
          <div className="segmented">
            <button
              className={period === 'week' ? 'selected' : ''}
              onClick={() => setPeriod('week')}
            >
              Esta semana
            </button>
            <button
              className={period === 'month' ? 'selected' : ''}
              onClick={() => setPeriod('month')}
            >
              Este mes
            </button>
          </div>
        }
      />
      <p className="stats-period">
        {formatDate(start)} — {formatDate(today)} · Comparación con los {days.length} días
        anteriores
      </p>
      <div className="stats-metrics">
        {[
          {
            icon: CheckCheck,
            label: 'Tareas completadas',
            value: String(completed),
            sub:
              previous > 0
                ? `${completed - previous >= 0 ? '+' : ''}${completed - previous} frente al período anterior`
                : 'Sin base suficiente para comparar',
            color: 'lilac',
          },
          {
            icon: Clock3,
            label: 'Tiempo de concentración',
            value: durationLabel(totalFocus),
            sub: `${sessions.length} sesiones registradas`,
            color: 'blue',
          },
          {
            icon: Flame,
            label: 'Cumplimiento de hábitos',
            value: totalHabit ? `${Math.round((doneHabit / totalHabit) * 100)}%` : '—',
            sub: `${doneHabit} de ${totalHabit} días programados`,
            color: 'green',
          },
          {
            icon: TrendingUp,
            label: 'Tiempo de estudio',
            value: durationLabel(studyMinutes),
            sub: 'Sesiones en la categoría Estudios',
            color: 'peach',
          },
        ].map((m) => (
          <div className="panel stats-metric" key={m.label}>
            <span className={`metric-icon ${m.color}`}>
              <m.icon size={20} />
            </span>
            <span>{m.label}</span>
            <strong>{m.value}</strong>
            <p>{m.sub}</p>
          </div>
        ))}
      </div>
      {!records && (
        <div className="notice stats-notice">
          <BarChart3 size={20} />
          <span>
            Tu historia aún está por escribir. Los gráficos se llenarán con tus tareas completadas,
            sesiones y hábitos. Sin estimaciones ni datos de ejemplo.
          </span>
        </div>
      )}
      <Momentum />
      <div className="stats-charts">
        <section className="panel">
          <PanelHeading title="Pequeñas victorias" aside="Tareas completadas" />
          <div className="chart-headline">
            <strong>{completed}</strong>
            <span>cosas menos en tu cabeza</span>
          </div>
          <MiniBars values={aggregate(taskBars)} labels={labels} active={labels.length - 1} />
          <p className="chart-footnote">
            {best
              ? `Día con más tareas completadas: ${weekday(best)}, ${formatDate(best)} (${Math.max(...taskBars)}).`
              : 'Al completar tareas verás tu evolución aquí.'}
          </p>
        </section>
        <section className="panel">
          <PanelHeading title="Tiempo bien dedicado" aside="Minutos de concentración" />
          <div className="chart-headline">
            <strong>{Math.round(totalFocus)}</strong>
            <span>minutos de atención plena</span>
          </div>
          <MiniBars values={aggregate(focusBars)} labels={labels} color="#8eafff" />
          <p className="chart-footnote">
            Tiempo registrado por el temporizador. Las pausas no se cuentan.
          </p>
        </section>
        <section className="panel category-stats">
          <PanelHeading title="A qué le haces espacio" aside="Actividades completadas" />
          {recordedTotal ? (
            <div className="category-time-list">
              {categoryTimes
                .filter((c) => c.minutes > 0)
                .sort((a, b) => b.minutes - a.minutes)
                .map((c) => (
                  <div key={c.id} style={colorStyle(c.color)}>
                    <div>
                      <span>
                        <i />
                        {c.name}
                      </span>
                      <strong>{durationLabel(c.minutes)}</strong>
                    </div>
                    <div className="category-time-track">
                      <span style={{ width: `${(c.minutes / recordedTotal) * 100}%` }} />
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <EmptyState
              compact
              icon={Clock3}
              title="Dale significado a tu tiempo"
              description="Marca actividades como completadas para ver su duración por categoría."
            />
          )}
          <p className="chart-footnote">
            Duración prevista de actividades que marcaste como completadas. Las actividades
            solapadas se cuentan por separado.
          </p>
        </section>
        <section className="panel">
          <PanelHeading title="Tu foco por categoría" />
          <div className="category-time-list">
            {state.settings.categories
              .map((c) => ({
                ...c,
                total: sessions
                  .filter((s) => s.categoryId === c.id)
                  .reduce((n, s) => n + s.minutes, 0),
              }))
              .filter((c) => c.total > 0)
              .map((c) => (
                <div key={c.id} style={colorStyle(c.color)}>
                  <div>
                    <span>
                      <i />
                      {c.name}
                    </span>
                    <strong>{durationLabel(c.total)}</strong>
                  </div>
                  <div className="category-time-track">
                    <span style={{ width: `${(c.total / Math.max(1, totalFocus)) * 100}%` }} />
                  </div>
                </div>
              ))}
          </div>
          {!sessions.length && (
            <EmptyState
              compact
              icon={ArrowUpRight}
              title="Encuentra tu ritmo"
              description="Tus sesiones de concentración darán forma a este gráfico."
            />
          )}
          <p className="chart-footnote">
            Los días sin registros aportan cero; no se estiman sesiones ni actividad.
          </p>
        </section>
      </div>
    </div>
  );
}
