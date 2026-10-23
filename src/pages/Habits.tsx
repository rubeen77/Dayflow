import { useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Flame,
  Leaf,
  Pencil,
  Sprout,
  TrendingUp,
} from 'lucide-react';
import {
  addDays,
  capital,
  dateKey,
  formatDate,
  habitRate,
  habitScheduled,
  habitStreak,
  monthDays,
  range,
  shiftMonth,
  startOfWeek,
  weekday,
} from '../lib/dates';
import { stamp } from '../lib/model';
import { useDayflow } from '../state/DayflowContext';
import {
  AddButton,
  CategoryBadge,
  colorStyle,
  EmptyState,
  IconButton,
  MiniBars,
  PanelHeading,
  ProgressRing,
  SectionHeading,
} from '../components/ui';
import type { PageProps } from './Today';

export function Habits({ date, setDate, edit }: PageProps) {
  const { state, save } = useDayflow();
  const today = dateKey();
  const [includeArchived, setIncludeArchived] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const habits = state.habits.filter((h) => includeArchived || !h.archived);
  const active = habits.find((h) => h.id === selectedId) ?? habits[0];
  const week = range(startOfWeek(date, state.settings.weekStart), 7);
  const monthStart = `${date.slice(0, 7)}-01`;
  const monthEnd = addDays(shiftMonth(date, 1), -1);
  const end = monthEnd > today ? today : monthEnd;
  const rates = habits.filter((h) => !h.archived).map((h) => habitRate(h, monthStart, end));
  const total = rates.reduce((n, x) => n + x.total, 0);
  const done = rates.reduce((n, x) => n + x.done, 0);
  const toggle = (id: string, day: string) =>
    void save((s) => {
      const h = s.habits.find((x) => x.id === id);
      if (!h || !habitScheduled(h, day) || day > dateKey()) return;
      h.completions = h.completions.includes(day)
        ? h.completions.filter((x) => x !== day)
        : [...h.completions, day];
      h.updatedAt = stamp();
    });
  const weeklyRates = Array.from({ length: 4 }, (_, i) => {
    const start = addDays(startOfWeek(today, state.settings.weekStart), -(3 - i) * 7);
    const end = addDays(start, 6) > today ? today : addDays(start, 6);
    const r = active ? habitRate(active, start, end) : { done: 0, total: 0 };
    return r.total ? Math.round((r.done / r.total) * 100) : 0;
  });
  return (
    <div className="page-enter">
      <SectionHeading
        eyebrow="CONSTANCIA, SIN PRISA"
        title="Pequeños rituales"
        description="No hace falta hacerlo perfecto. Hace falta volver a empezar."
        action={<AddButton onClick={() => edit({ kind: 'habit' })}>Nuevo hábito</AddButton>}
      />
      <div className="habit-overview">
        <div className="panel habit-overview-main">
          <div className="large-icon green">
            <Sprout size={29} />
          </div>
          <div>
            <span className="eyebrow">ESTE MES</span>
            <h2>Cuida de tu constancia</h2>
            <p>
              {done
                ? `${done} pequeños pasos que ya son parte de tu historia.`
                : 'Tu progreso empieza con el primer paso.'}
            </p>
          </div>
          <ProgressRing progress={total ? Math.round((done / total) * 100) : 0} size={82} />
        </div>
        <div className="panel habit-highlight">
          <Flame size={23} />
          <strong>{Math.max(0, ...habits.map((h) => habitStreak(h)))}</strong>
          <span>mejor racha actual</span>
        </div>
        <div className="panel habit-highlight">
          <Leaf size={23} />
          <strong>{habits.filter((h) => !h.archived).length}</strong>
          <span>hábitos en marcha</span>
        </div>
      </div>
      <div className="habits-layout">
        <section className="panel habit-tracker">
          <PanelHeading title="Un paso cada día">
            <div className="inline-controls">
              <IconButton
                icon={ChevronLeft}
                label="Semana anterior"
                onClick={() => setDate(addDays(date, -7))}
              />
              <span className="small muted">
                {formatDate(week[0], { day: 'numeric', month: 'short' })} —{' '}
                {formatDate(week[6], { day: 'numeric', month: 'short' })}
              </span>
              <IconButton
                icon={ChevronRight}
                label="Semana siguiente"
                onClick={() => setDate(addDays(date, 7))}
              />
            </div>
          </PanelHeading>
          <div className="habit-week-table">
            <div className="habit-table-head">
              <span>HÁBITO</span>
              {week.map((d) => (
                <span key={d} className={d === today ? 'today-text' : ''}>
                  {weekday(d, true)}
                  <b>{Number(d.slice(-2))}</b>
                </span>
              ))}
            </div>
            {habits.map((h) => {
              const count = week.filter(
                (d) =>
                  h.completions.includes(d) &&
                  h.weekdays.includes(new Date(`${d}T12:00:00`).getDay()),
              ).length;
              return (
                <div className={`habit-table-row ${h.archived ? 'archived' : ''}`} key={h.id}>
                  <div>
                    <button className="habit-name" onClick={() => setSelectedId(h.id)}>
                      <strong>{h.title}</strong>
                      <span>
                        {count}/{h.target} esta semana{' '}
                        {habitStreak(h) > 0 ? ` · ${habitStreak(h)} de racha` : ''}
                      </span>
                    </button>
                    <IconButton
                      icon={Pencil}
                      label={`Editar ${h.title}`}
                      onClick={() => edit({ kind: 'habit', item: h })}
                    />
                  </div>
                  {week.map((d) => (
                    <button
                      key={d}
                      className={`habit-day ${h.completions.includes(d) ? 'done' : ''} ${!habitScheduled(h, d) ? 'rest' : ''}`}
                      style={colorStyle(
                        state.settings.categories.find((c) => c.id === h.categoryId)?.color ??
                          '#b6a0f7',
                      )}
                      aria-label={`${h.title}, ${d}${!habitScheduled(h, d) ? ', descanso' : ''}`}
                      aria-pressed={h.completions.includes(d)}
                      disabled={!habitScheduled(h, d) || d > today}
                      onClick={() => toggle(h.id, d)}
                    >
                      {h.completions.includes(d) ? (
                        <Check size={16} />
                      ) : !habitScheduled(h, d) ? (
                        <span>—</span>
                      ) : (
                        <i />
                      )}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
          {!habits.length && (
            <EmptyState
              icon={Sprout}
              title="Haz sitio a tu mejor versión"
              description="Leer, moverte, descansar. Tú eliges qué quieres cultivar."
              action={() => edit({ kind: 'habit' })}
              actionLabel="Crear mi primer hábito"
            />
          )}
          <div className="tracker-footer">
            <label>
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(e) => setIncludeArchived(e.target.checked)}
              />{' '}
              Mostrar archivados
            </label>
            <span>
              <i /> Día de descanso
            </span>
          </div>
        </section>
        <aside>
          {active ? (
            <section className="panel habit-detail">
              <PanelHeading title="Tu constancia">
                <select
                  aria-label="Hábito de seguimiento"
                  value={active.id}
                  onChange={(e) => setSelectedId(e.target.value)}
                >
                  {habits.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.title}
                    </option>
                  ))}
                </select>
              </PanelHeading>
              <div className="habit-detail-title">
                <h3>{active.title}</h3>
                <CategoryBadge id={active.categoryId} />
              </div>
              <div className="habit-month-nav">
                <IconButton
                  icon={ChevronLeft}
                  label="Mes anterior"
                  onClick={() => setDate(shiftMonth(date, -1))}
                />
                <span>{capital(formatDate(date, { month: 'long', year: 'numeric' }))}</span>
                <IconButton
                  icon={ChevronRight}
                  label="Mes siguiente"
                  onClick={() => setDate(shiftMonth(date, 1))}
                />
              </div>
              <div className="habit-month-grid">
                {monthDays(date, state.settings.weekStart).map((d) => (
                  <button
                    key={d}
                    disabled={
                      d.slice(0, 7) !== date.slice(0, 7) || d > today || !habitScheduled(active, d)
                    }
                    className={`${active.completions.includes(d) ? 'done' : ''} ${d.slice(0, 7) !== date.slice(0, 7) ? 'outside' : ''} ${!habitScheduled(active, d) ? 'rest' : ''}`}
                    aria-label={`Registrar ${active.title} el ${d}`}
                    onClick={() => toggle(active.id, d)}
                  >
                    {Number(d.slice(-2))}
                  </button>
                ))}
              </div>
              <div className="habit-evolution">
                <span className="field-label">
                  <TrendingUp size={14} />
                  Cumplimiento · últimas 4 semanas
                </span>
                <MiniBars
                  values={weeklyRates}
                  labels={['Hace 3', 'Hace 2', 'Anterior', 'Actual']}
                  color="#83cbb1"
                />
                <p className="helper">
                  Porcentaje sobre los días programados. Los descansos quedan fuera del cálculo.
                </p>
              </div>
            </section>
          ) : (
            <section className="habit-note">
              <Leaf size={25} />
              <h3>El descanso también es progreso.</h3>
              <p>Programa tus días de descanso. Tu racha los respetará.</p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
