import { useState } from 'react';
import { Award, Check, Leaf } from 'lucide-react';
import { dateKey, durationLabel, formatDate, weekday } from '../lib/dates';
import {
  achievements,
  activityHistory,
  annualConsistency,
  weeklyComparison,
} from '../lib/insights';
import { useDayflow } from '../state/DayflowContext';
import { PanelHeading } from './ui';

export function Momentum() {
  const { state } = useDayflow();
  const today = dateKey();
  const currentYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(currentYear);
  const [selected, setSelected] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const annual = annualConsistency(state, year);
  const history = activityHistory(state);
  const week = weeklyComparison(state);
  const awards = achievements(state);
  const monthlyTasks = [...history.tasks.entries()]
    .filter(([d]) => d.startsWith(month))
    .reduce((n, [, v]) => n + v, 0);
  const monthlyFocus = [...history.focus.entries()]
    .filter(([d]) => d.startsWith(month))
    .reduce((n, [, v]) => n + v, 0);
  const monthlyHabitDays = state.habits.reduce(
    (n, h) => n + new Set(h.completions.filter((d) => d.startsWith(month) && d <= today)).size,
    0,
  );
  const max = Math.max(1, ...week.taskValues, ...week.previousValues);
  return (
    <div className="momentum-sections">
      <section className="panel annual-panel">
        <PanelHeading title="Tu año, un día a la vez">
          <select
            aria-label="Año del mapa de constancia"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {Array.from({ length: 6 }, (_, i) => currentYear - i).map((y) => (
              <option value={y} key={y}>
                {y}
              </option>
            ))}
          </select>
        </PanelHeading>
        <div className="annual-summary">
          <strong>{annual.activeDays}</strong>
          <span>
            días con pasos registrados · {annual.total} acciones en {year}
          </span>
        </div>
        <div className="annual-map">
          <svg
            viewBox="0 0 755 126"
            role="img"
            aria-label={`Mapa anual de constancia: ${annual.activeDays} días activos en ${year}`}
          >
            <text x="0" y="34">
              L
            </text>
            <text x="0" y="62">
              X
            </text>
            <text x="0" y="90">
              V
            </text>
            {[
              'Ene',
              'Feb',
              'Mar',
              'Abr',
              'May',
              'Jun',
              'Jul',
              'Ago',
              'Sep',
              'Oct',
              'Nov',
              'Dic',
            ].map((m, i) => (
              <text key={m} x={21 + i * 60} y="12">
                {m}
              </text>
            ))}
            {annual.days.map((d) => (
              <rect
                key={d.date}
                x={19 + d.column * 13.5}
                y={22 + d.row * 13.5}
                width="10"
                height="10"
                rx="2"
                className={`heat-cell level-${d.count === 0 ? 0 : Math.min(4, d.count)} ${d.future ? 'future' : ''}`}
              >
                <title>
                  {formatDate(d.date)}: {d.count} acciones
                </title>
              </rect>
            ))}
          </svg>
        </div>
        <div className="heatmap-legend">
          <span>Menos</span>
          {[0, 1, 2, 3, 4].map((n) => (
            <i className={`heat-cell level-${n}`} key={n} />
          ))}
          <span>Más constancia</span>
        </div>
        <div className="annual-detail">
          <label>
            Consultar un día
            <input
              type="date"
              max={today}
              value={selected}
              onChange={(e) => e.target.value && setSelected(e.target.value)}
            />
          </label>
          <span>
            {history.counts.get(selected) ?? 0} acciones registradas el {formatDate(selected)}.
          </span>
        </div>
      </section>
      <div className="stats-charts">
        <section className="panel">
          <PanelHeading title="Una semana frente a otra" />
          <div className="week-compare-stats">
            <div>
              <span>Tareas</span>
              <strong>
                {week.currentTasks} <small>frente a {week.previousTasks}</small>
              </strong>
            </div>
            <div>
              <span>Concentración</span>
              <strong>
                {durationLabel(week.currentFocus)}
                <small>frente a {durationLabel(week.previousFocus)}</small>
              </strong>
            </div>
          </div>
          <div className="paired-bars">
            {week.currentDays.map((d, i) => (
              <div key={d}>
                <span>
                  <i style={{ height: `${(week.taskValues[i] / max) * 100}%` }} />
                  <b style={{ height: `${(week.previousValues[i] / max) * 100}%` }} />
                </span>
                <small>{weekday(d, true)}</small>
              </div>
            ))}
          </div>
          <p className="chart-footnote">
            <i className="comparison-key current" />
            Esta semana <i className="comparison-key previous" />
            Anterior · Comparación de los primeros {week.elapsed} días de cada semana. Los días sin
            registros aportan cero.
          </p>
        </section>
        <section className="panel monthly-summary">
          <PanelHeading title="Tu mes, con perspectiva">
            <input
              aria-label="Mes del resumen"
              type="month"
              max={today.slice(0, 7)}
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
            />
          </PanelHeading>
          <div className="month-records">
            <div>
              <Check size={19} />
              <strong>{monthlyTasks}</strong>
              <span>tareas completadas</span>
            </div>
            <div>
              <Leaf size={19} />
              <strong>{monthlyHabitDays}</strong>
              <span>hábitos registrados</span>
            </div>
            <div>
              <Award size={19} />
              <strong>{durationLabel(monthlyFocus)}</strong>
              <span>de concentración</span>
            </div>
          </div>
        </section>
      </div>
      <section className="panel achievement-panel">
        <PanelHeading title="Motivos para seguir" aside="Logros a tu ritmo" />
        {awards.length ? (
          <div className="achievement-list">
            {awards.map((a) => (
              <div key={a.id}>
                <span>
                  <Check size={17} />
                </span>
                <div>
                  <h3>{a.title}</h3>
                  <p>{a.detail}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-inline">
            Tus logros aparecerán al conseguir objetivos con tus registros reales. Cada paso cuenta.
          </p>
        )}
      </section>
    </div>
  );
}
