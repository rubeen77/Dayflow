import { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bookmark,
  CalendarRange,
  Check,
  Copy,
  LayoutTemplate,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  WandSparkles,
} from 'lucide-react';
import {
  addDays,
  conflicts,
  dateKey,
  daysBetween,
  eventsOn,
  formatDate,
  range,
  startOfWeek,
} from '../lib/dates';
import { stamp, uid } from '../lib/model';
import { applyProposals, deterministicPlanner, type Plan } from '../lib/planner';
import { useDayflow } from '../state/DayflowContext';
import {
  AddButton,
  CheckButton,
  DateNav,
  EmptyState,
  IconButton,
  Modal,
  SectionHeading,
} from '../components/ui';
import { WeekBoard } from './Calendar';
import type { PageProps } from './Today';

export function Planner({ date, setDate, edit, inspect }: PageProps) {
  const { state, save, notify, pending } = useDayflow();
  const [templateModal, setTemplateModal] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [applyTemplate, setApplyTemplate] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [selected, setSelected] = useState(new Set<string>());
  const weekStart = startOfWeek(date, state.settings.weekStart);
  const days = range(weekStart, 7);
  const weekEvents = days.flatMap((d) => eventsOn(state, d));
  const overlaps = days.flatMap((d) => conflicts(eventsOn(state, d)));
  const suggest = () => {
    const p = deterministicPlanner.suggest(state, date < dateKey() ? dateKey() : date, 7);
    setPlan(p);
    setSelected(
      new Set([
        ...p.proposals.map((p) => p.taskId),
        ...p.relocations.map((p) => `move:${p.eventId}:${p.from}`),
      ]),
    );
  };
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const template = state.templates.find((t) => t.id === applyTemplate);
  return (
    <div className="page-enter">
      <SectionHeading
        eyebrow="MIRA UN POCO MÁS ALLÁ"
        title="Diseña tu semana"
        description="Dale a cada cosa su tiempo. Deja margen para la vida."
        action={<AddButton onClick={() => edit({ kind: 'event', date })}>Nuevo bloque</AddButton>}
      />
      <section className="planner-assistant">
        <span className="assistant-symbol">
          <Sparkles size={25} />
        </span>
        <div>
          <span className="eyebrow">UN POCO DE PERSPECTIVA</span>
          <h2>Tu semana puede fluir mejor.</h2>
          <p>
            Encuentra huecos para tus tareas y resuelve solapamientos, respetando tus bloques fijos.
          </p>
        </div>
        <button className="primary-button" onClick={suggest}>
          <WandSparkles size={17} />
          Organizar mi semana
        </button>
      </section>
      <div className="planner-toolbar">
        <DateNav date={date} setDate={setDate} step={7} />
        <div className="inline-controls">
          <button className="secondary-button" onClick={() => setTemplateModal(true)}>
            <Bookmark size={16} />
            Plantillas
          </button>
          <span className="planner-event-count">{weekEvents.length} bloques</span>
        </div>
      </div>
      {overlaps.length > 0 && (
        <div className="notice warning-notice">
          <AlertTriangle size={18} />
          <span>
            {overlaps.length} solapamiento{overlaps.length > 1 ? 's' : ''} en esta semana. Abre el
            asistente para ver opciones de reorganización.
          </span>
        </div>
      )}
      <section className="panel planner-board">
        <WeekBoard date={date} edit={edit} inspect={inspect} showGaps />
      </section>
      <div className="planner-notes">
        <div>
          <span className="metric-icon blue">
            <CalendarRange size={20} />
          </span>
          <h3>Tu horario, a tu manera</h3>
          <p>
            Crea un bloque y selecciona una repetición para tus clases, gimnasio o rutinas
            habituales.
          </p>
          <button className="text-button" onClick={() => edit({ kind: 'event', date })}>
            Crear un horario habitual
            <ArrowRight size={15} />
          </button>
        </div>
        <div>
          <span className="metric-icon lilac">
            <LayoutTemplate size={20} />
          </span>
          <h3>Lo que funciona, se repite</h3>
          <p>
            Guarda esta semana como plantilla y aplícala cuando la necesites, sin modificar los
            bloques existentes.
          </p>
          <button className="text-button" onClick={() => setTemplateModal(true)}>
            Mis plantillas
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
      {plan && (
        <Modal
          wide
          title="Una propuesta para fluir mejor"
          eyebrow="PLANIFICACIÓN POR REGLAS · SIN API"
          onClose={() => setPlan(null)}
        >
          <div className="plan-body">
            <p>
              Propuesta para 7 días desde el {formatDate(date < dateKey() ? dateKey() : date)}.
              Respeta tu descanso nocturno, actividades, tareas con hora y un margen de 10 minutos
              entre nuevas tareas.
            </p>
            {state.revision !== plan.revision && (
              <div className="notice warning-notice">
                Tu agenda ha cambiado. Recalcula antes de aplicar.
              </div>
            )}
            {plan.conflicts.length > 0 && (
              <div className="conflict-summary">
                <h3>
                  <AlertTriangle size={17} />
                  Hay {plan.conflicts.length} solapamientos
                </h3>
                {plan.conflicts.map(([a, b], i) => (
                  <p key={i}>
                    {formatDate(a.occurrenceDate)}: «{a.title}» y «{b.title}»
                  </p>
                ))}
              </div>
            )}
            {plan.relocations.map((p) => {
              const key = `move:${p.eventId}:${p.from}`;
              return (
                <div className="proposal-row" key={key}>
                  <CheckButton
                    checked={selected.has(key)}
                    label={`Aceptar reorganización de ${p.title}`}
                    onClick={() => toggle(key)}
                  />
                  <div>
                    <strong>Mover: {p.title}</strong>
                    <span>
                      {formatDate(p.from)} → {formatDate(p.date)} · {p.start} — {p.end}
                    </span>
                    <small>Resuelve un solapamiento sin mover los eventos fijos.</small>
                  </div>
                </div>
              );
            })}
            {plan.proposals.map((p) => (
              <div className="proposal-row" key={p.taskId}>
                <CheckButton
                  checked={selected.has(p.taskId)}
                  label={`Aceptar ${p.title}`}
                  onClick={() => toggle(p.taskId)}
                />
                <div>
                  <strong>{p.title}</strong>
                  <span>
                    {formatDate(p.date)} · {p.start} — {p.end}
                  </span>
                  <small>{p.reason}</small>
                </div>
              </div>
            ))}
            {!plan.proposals.length && !plan.relocations.length && (
              <EmptyState
                compact
                icon={Check}
                title={
                  plan.conflicts.length
                    ? 'Estos bloques necesitan tu decisión'
                    : 'Todo tiene su espacio'
                }
                description={
                  plan.conflicts.length
                    ? 'Los bloques fijos se mantienen. Puedes abrirlos en la agenda y elegir otro horario.'
                    : 'No hay tareas sin hora pendientes de distribuir, o no caben en el período elegido.'
                }
              />
            )}
            {plan.unplaced.length > 0 && (
              <div className="notice">
                <span>
                  No caben sin cambiar tus límites: {plan.unplaced.map((t) => t.title).join(', ')}.
                  Amplía sus fechas o reduce su duración.
                </span>
              </div>
            )}
            <p className="helper">
              Las tareas se ordenan por prioridad y fecha límite. Las fechas asignadas actúan como
              primer día posible. Las tareas recurrentes se mantienen en su horario. Solo se aplican
              las opciones seleccionadas.
            </p>
            <div className="form-footer">
              <button className="secondary-button" onClick={suggest}>
                <RefreshCw size={16} />
                Recalcular
              </button>
              <button
                className="primary-button"
                disabled={!selected.size || state.revision !== plan.revision || pending > 0}
                onClick={async () => {
                  if (
                    await save(
                      (s) => applyProposals(s, plan, selected),
                      `${selected.size} cambios aplicados`,
                    )
                  )
                    setPlan(null);
                }}
              >
                Aplicar {selected.size} cambios
              </button>
            </div>
          </div>
        </Modal>
      )}
      {templateModal && (
        <Modal
          title="Semanas que funcionan"
          eyebrow="TUS PLANTILLAS"
          onClose={() => setTemplateModal(false)}
        >
          <div className="template-body">
            <p className="muted">
              Se guardan tus bloques locales de la semana visible, sin historiales de completado ni
              copias de Google. Al aplicar, se crean actividades independientes.
            </p>
            <form
              className="inline-input"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!templateName.trim() || !weekEvents.some((e) => !e.google)) {
                  notify('Añade bloques a esta semana antes de guardarla.');
                  return;
                }
                if (
                  await save((s) => {
                    s.templates.push({
                      id: uid(),
                      updatedAt: stamp(),
                      name: templateName.trim(),
                      blocks: weekEvents
                        .filter((e) => !e.google)
                        .map((e) => ({
                          offset: daysBetween(weekStart, e.occurrenceDate),
                          event: {
                            ...e,
                            date: e.occurrenceDate,
                            completedDates: [],
                            exceptions: [],
                            recurrence: 'none',
                            until: null,
                          },
                        })),
                    });
                  }, 'Plantilla guardada')
                )
                  setTemplateName('');
              }}
            >
              <input
                aria-label="Nombre de la plantilla"
                maxLength={80}
                placeholder="Nombre para esta semana"
                required
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
              />
              <button
                className="secondary-button"
                disabled={!weekEvents.some((e) => !e.google) || pending > 0}
              >
                <Plus size={17} />
                Guardar
              </button>
            </form>
            {state.templates.map((t) => (
              <div className="template-row" key={t.id}>
                <LayoutTemplate size={20} />
                <div>
                  <strong>{t.name}</strong>
                  <span>{t.blocks.length} bloques</span>
                </div>
                <button
                  className="small-button"
                  onClick={() => {
                    setTemplateModal(false);
                    setApplyTemplate(t.id);
                  }}
                >
                  <Copy size={14} />
                  Aplicar
                </button>
                <IconButton
                  icon={Trash2}
                  label={`Eliminar plantilla ${t.name}`}
                  onClick={() =>
                    void save((s) => {
                      s.templates = s.templates.filter((x) => x.id !== t.id);
                    }, 'Plantilla eliminada')
                  }
                />
              </div>
            ))}
            {!state.templates.length && (
              <EmptyState
                compact
                icon={Bookmark}
                title="Conserva tu mejor semana"
                description="Crea bloques en el calendario y guárdalos aquí."
              />
            )}
          </div>
        </Modal>
      )}
      {template && (
        <Modal
          title={`Aplicar «${template.name}»`}
          eyebrow="REVISAR ANTES DE CREAR"
          onClose={() => setApplyTemplate(null)}
        >
          <div className="plan-body">
            <p>
              Se añadirán {template.blocks.length} bloques a la semana del {formatDate(weekStart)}.
              Los bloques que ya existen se conservan. Revisa después los posibles solapamientos.
            </p>
            <ul className="template-preview">
              {template.blocks.map((b, i) => (
                <li key={i}>
                  {formatDate(addDays(weekStart, b.offset))} · {b.event.start} · {b.event.title}
                </li>
              ))}
            </ul>
            <button
              className="primary-button"
              disabled={pending > 0}
              onClick={async () => {
                if (
                  await save((s) => {
                    for (const block of template.blocks) {
                      const date = addDays(weekStart, block.offset);
                      if (
                        !s.events.some(
                          (e) =>
                            e.date === date &&
                            e.title === block.event.title &&
                            e.start === block.event.start &&
                            e.end === block.event.end,
                        )
                      )
                        s.events.push({
                          ...block.event,
                          id: uid(),
                          date,
                          updatedAt: stamp(),
                          completedDates: [],
                          exceptions: [],
                        });
                    }
                  }, 'Plantilla aplicada; los bloques idénticos se han omitido')
                )
                  setApplyTemplate(null);
              }}
            >
              Crear bloques de esta semana
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
