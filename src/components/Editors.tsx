import { useState, type FormEvent } from 'react';
import { CalendarDays, CheckSquare, Plus, Repeat2, Trash2, X } from 'lucide-react';
import { dateKey, localDate, minutes, timeOf } from '../lib/dates';
import {
  eventSchema,
  habitSchema,
  stamp,
  taskSchema,
  uid,
  type Activity,
  type Habit,
  type Occurrence,
  type Task,
} from '../lib/model';
import { useDayflow } from '../state/DayflowContext';
import { CategoryBadge, IconButton, Modal } from './ui';
import { syncLinkedTask, toggleActivity } from '../lib/actions';
import { GoogleEventDetail, GoogleWriteDialog } from './GoogleEvents';
import { useGoogle } from '../state/GoogleContext';

export type EditorState =
  | { kind: 'event'; item?: Occurrence; date?: string; time?: string }
  | { kind: 'task'; item?: Task; date?: string }
  | { kind: 'habit'; item?: Habit };
export function Editor({ editor, onClose }: { editor: EditorState; onClose: () => void }) {
  if (editor.kind === 'event' && editor.item?.google)
    return <GoogleEventDetail event={editor.item.google} onClose={onClose} />;
  return editor.kind === 'event' ? (
    <EventEditor {...editor} onClose={onClose} />
  ) : editor.kind === 'task' ? (
    <TaskEditor {...editor} onClose={onClose} />
  ) : (
    <HabitEditor {...editor} onClose={onClose} />
  );
}
function CategorySelect({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  const { state } = useDayflow();
  return (
    <label>
      Categoría
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {state.settings.categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}
function RecurrenceSelect({
  value,
  onChange,
}: {
  value: Activity['recurrence'];
  onChange: (s: Activity['recurrence']) => void;
}) {
  return (
    <label>
      Repetir
      <select
        aria-label="Repetir"
        value={value}
        onChange={(e) => onChange(e.target.value as Activity['recurrence'])}
      >
        <option value="none">No se repite</option>
        <option value="daily">Cada día</option>
        <option value="weekdays">De lunes a viernes</option>
        <option value="weekly">Cada semana</option>
        <option value="custom">Días concretos</option>
      </select>
    </label>
  );
}
function RecurrenceDays({
  value,
  onChange,
}: {
  value?: number[];
  onChange: (days: number[]) => void;
}) {
  return (
    <div className="weekday-picker">
      {[1, 2, 3, 4, 5, 6, 0].map((d) => (
        <button
          type="button"
          key={d}
          aria-pressed={!!value?.includes(d)}
          className={value?.includes(d) ? 'selected' : ''}
          onClick={() =>
            onChange(value?.includes(d) ? value.filter((x) => x !== d) : [...(value ?? []), d])
          }
        >
          {['D', 'L', 'M', 'X', 'J', 'V', 'S'][d]}
        </button>
      ))}
    </div>
  );
}
function FormError({ error }: { error: string }) {
  return error ? (
    <p className="form-error" role="alert">
      {error}
    </p>
  ) : null;
}
function SaveFooter({
  existing,
  saving,
  onDelete,
}: {
  existing: boolean;
  saving: boolean;
  onDelete?: () => void;
}) {
  const { error } = useDayflow();
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-footer">
        {existing && onDelete ? (
          <button
            type="button"
            className="danger-button"
            onClick={() => {
              if (confirm) onDelete();
              else setConfirm(true);
            }}
            disabled={saving}
          >
            <Trash2 size={16} />
            {confirm ? 'Confirmar eliminación' : 'Eliminar'}
          </button>
        ) : (
          <span className="muted small">Guardado local en tu dispositivo</span>
        )}
        <button className="primary-button" type="submit" disabled={saving}>
          {saving ? 'Guardando…' : existing ? 'Guardar cambios' : 'Crear'}
        </button>
      </div>
    </>
  );
}
function EventEditor({
  item,
  date,
  time,
  onClose,
}: {
  item?: Occurrence;
  date?: string;
  time?: string;
  onClose: () => void;
}) {
  const { state, save } = useDayflow();
  const [form, setForm] = useState<Activity>(() =>
    item
      ? { ...item, date: item.occurrenceDate }
      : {
          id: uid(),
          updatedAt: stamp(),
          title: '',
          date: date ?? dateKey(),
          start: time ?? '09:00',
          end: timeOf(Math.min(minutes(time ?? '09:00') + state.settings.defaultDuration, 1439)),
          allDay: false,
          categoryId: state.settings.categories[0].id,
          fixed: false,
          recurrence: 'none',
          until: null,
          exceptions: [],
          completedDates: [],
          location: '',
          notes: '',
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
  );
  const [scope, setScope] = useState<'one' | 'all'>('one');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const field = <K extends keyof Activity>(key: K, value: Activity[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const commit = async (e: FormEvent) => {
    e.preventDefault();
    const result = eventSchema.safeParse({ ...form, updatedAt: stamp() });
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }
    setSaving(true);
    const ok = await save(
      (s) => {
        const index = s.events.findIndex((x) => x.id === form.id);
        if (item && (index < 0 || s.events[index].updatedAt !== item.updatedAt))
          throw new Error('La actividad cambió en otra pantalla. Cierra y vuelve a abrirla.');
        if (item && item.recurrence !== 'none' && scope === 'one') {
          s.events[index].exceptions = [
            ...new Set([...s.events[index].exceptions, item.occurrenceDate]),
          ];
          s.events[index].updatedAt = stamp();
          s.events.push({
            ...result.data,
            id: uid(),
            recurrence: 'none',
            until: null,
            exceptions: [],
            completedDates: item.completedDates.includes(item.occurrenceDate) ? [form.date] : [],
          });
        } else if (index >= 0)
          s.events[index] = {
            ...result.data,
            date: item?.recurrence !== 'none' && scope === 'all' ? item!.date : form.date,
          };
        else s.events.push(result.data);
        const stored = s.events.find((e) => e.id === form.id);
        if (stored) syncLinkedTask(s, stored);
      },
      item ? 'Actividad actualizada' : 'Actividad creada',
    );
    setSaving(false);
    if (ok) onClose();
  };
  const remove = async () => {
    setSaving(true);
    const ok = await save((s) => {
      if (item?.recurrence !== 'none' && scope === 'one') {
        const original = s.events.find((x) => x.id === form.id);
        if (original) {
          original.exceptions = [...new Set([...original.exceptions, item!.occurrenceDate])];
          original.updatedAt = stamp();
        }
      } else s.events = s.events.filter((x) => x.id !== form.id);
    }, 'Actividad eliminada');
    setSaving(false);
    if (ok) onClose();
  };
  return (
    <Modal
      title={item ? 'Editar actividad' : 'Un espacio para tus planes'}
      eyebrow={item ? 'TU AGENDA' : 'NUEVA ACTIVIDAD'}
      onClose={onClose}
    >
      <form onSubmit={commit} className="editor-form">
        <label>
          Nombre de la actividad
          <input
            autoFocus
            required
            maxLength={160}
            placeholder="¿Qué tienes en mente?"
            value={form.title}
            onChange={(e) => field('title', e.target.value)}
          />
        </label>
        {item && item.recurrence !== 'none' && (
          <label className="scope-control">
            <Repeat2 size={17} />
            Editar
            <select value={scope} onChange={(e) => setScope(e.target.value as 'one' | 'all')}>
              <option value="one">Solo esta repetición</option>
              <option value="all">Toda la serie</option>
            </select>
          </label>
        )}
        <label>
          Fecha
          <input
            type="date"
            required
            value={form.date}
            onChange={(e) => field('date', e.target.value)}
            disabled={!!item && item.recurrence !== 'none' && scope === 'all'}
          />
        </label>
        <label className="toggle-label">
          <span>Todo el día</span>
          <input
            type="checkbox"
            checked={form.allDay}
            onChange={(e) => field('allDay', e.target.checked)}
          />
        </label>
        {!form.allDay && (
          <div className="form-grid">
            <label>
              Desde
              <input
                type="time"
                required
                value={form.start}
                onChange={(e) => field('start', e.target.value)}
              />
            </label>
            <label>
              Hasta
              <input
                type="time"
                required
                value={form.end}
                onChange={(e) => field('end', e.target.value)}
              />
            </label>
          </div>
        )}
        <div className="form-grid">
          <CategorySelect value={form.categoryId} onChange={(v) => field('categoryId', v)} />
          <RecurrenceSelect value={form.recurrence} onChange={(v) => field('recurrence', v)} />
        </div>
        {form.recurrence === 'custom' && (
          <RecurrenceDays value={form.weekdays} onChange={(v) => field('weekdays', v)} />
        )}
        {form.recurrence !== 'none' && (
          <label>
            Repetir hasta (opcional)
            <input
              type="date"
              min={form.date}
              value={form.until ?? ''}
              onChange={(e) => field('until', e.target.value || null)}
            />
          </label>
        )}
        <label className="toggle-label">
          <span>
            Bloque fijo
            <small>
              El asistente reservará este espacio. Un bloque fijo de todo el día reserva la jornada.
            </small>
          </span>
          <input
            type="checkbox"
            checked={form.fixed}
            onChange={(e) => field('fixed', e.target.checked)}
          />
        </label>
        <label>
          Lugar (opcional)
          <input
            maxLength={250}
            placeholder="Añadir ubicación"
            value={form.location}
            onChange={(e) => field('location', e.target.value)}
          />
        </label>
        <label>
          Notas
          <textarea
            maxLength={5000}
            rows={2}
            placeholder="Algo que quieras recordar…"
            value={form.notes}
            onChange={(e) => field('notes', e.target.value)}
          />
        </label>
        <FormError error={error} />
        <SaveFooter existing={!!item} saving={saving} onDelete={remove} />
      </form>
    </Modal>
  );
}

function TaskEditor({ item, date, onClose }: { item?: Task; date?: string; onClose: () => void }) {
  const { state, save } = useDayflow();
  const [form, setForm] = useState<Task>(
    () =>
      item ?? {
        id: uid(),
        updatedAt: stamp(),
        title: '',
        date: date ?? null,
        time: null,
        deadline: null,
        duration: 30,
        priority: 'medium',
        categoryId: state.settings.categories[0].id,
        listId: state.settings.lists[0].id,
        tags: [],
        notes: '',
        subtasks: [],
        recurrence: 'none',
        completedAt: null,
        doneDates: [],
        reminder: null,
      },
  );
  const [tags, setTags] = useState(form.tags.join(', '));
  const [subtask, setSubtask] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const field = <K extends keyof Task>(key: K, value: Task[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const commit = async (e: FormEvent) => {
    e.preventDefault();
    const result = taskSchema.safeParse({
      ...form,
      tags: [
        ...new Set(
          tags
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      ],
      updatedAt: stamp(),
      time: form.date ? form.time : null,
      reminder: form.date && form.time ? form.reminder : null,
    });
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }
    setSaving(true);
    const ok = await save(
      (s) => {
        const index = s.tasks.findIndex((x) => x.id === form.id);
        if (item && (index < 0 || s.tasks[index].updatedAt !== item.updatedAt))
          throw new Error('La tarea cambió. Cierra y vuelve a abrirla para ver la última versión.');
        if (index >= 0) s.tasks[index] = result.data;
        else s.tasks.push(result.data);
      },
      item ? 'Tarea actualizada' : 'Tarea guardada',
    );
    setSaving(false);
    if (ok) onClose();
  };
  const addSubtask = () => {
    if (subtask.trim()) {
      field('subtasks', [...form.subtasks, { id: uid(), title: subtask.trim(), done: false }]);
      setSubtask('');
    }
  };
  return (
    <Modal
      title={item ? 'Editar tarea' : 'Sácalo de tu cabeza'}
      eyebrow={item ? 'TU TAREA' : 'NUEVA TAREA'}
      onClose={onClose}
    >
      <form className="editor-form" onSubmit={commit}>
        <label>
          ¿Qué necesitas hacer?
          <input
            autoFocus
            required
            maxLength={160}
            placeholder="Una cosa menos en la cabeza…"
            value={form.title}
            onChange={(e) => field('title', e.target.value)}
          />
        </label>
        <div className="form-grid">
          <label>
            Fecha (opcional)
            <input
              type="date"
              value={form.date ?? ''}
              onChange={(e) => field('date', e.target.value || null)}
            />
          </label>
          <label>
            Hora (opcional)
            <input
              type="time"
              disabled={!form.date}
              value={form.time ?? ''}
              onChange={(e) => field('time', e.target.value || null)}
            />
          </label>
        </div>
        <div className="form-grid">
          <label>
            Prioridad
            <select
              value={form.priority}
              onChange={(e) => field('priority', e.target.value as Task['priority'])}
            >
              <option value="high">Alta</option>
              <option value="medium">Media</option>
              <option value="low">Baja</option>
            </select>
          </label>
          <label>
            Duración estimada (min)
            <input
              type="number"
              min={5}
              max={720}
              step={5}
              required
              value={form.duration}
              onChange={(e) => field('duration', Number(e.target.value))}
            />
          </label>
        </div>
        <div className="form-grid">
          <CategorySelect value={form.categoryId} onChange={(v) => field('categoryId', v)} />
          <label>
            Lista
            <select value={form.listId} onChange={(e) => field('listId', e.target.value)}>
              {state.settings.lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-grid">
          <RecurrenceSelect value={form.recurrence} onChange={(v) => field('recurrence', v)} />
          <label>
            Fecha límite
            <input
              type="date"
              value={form.deadline ?? ''}
              onChange={(e) => field('deadline', e.target.value || null)}
            />
          </label>
        </div>
        {form.date && form.time && (
          <>
            <label>
              Recordatorio
              <select
                value={form.reminder ?? ''}
                onChange={(e) =>
                  field('reminder', e.target.value === '' ? null : Number(e.target.value))
                }
              >
                <option value="">Sin recordatorio</option>
                <option value="0">A la hora de la tarea</option>
                <option value="5">5 minutos antes</option>
                <option value="15">15 minutos antes</option>
                <option value="30">30 minutos antes</option>
                <option value="60">1 hora antes</option>
              </select>
            </label>
            <p className="helper">
              Los avisos se comprueban mientras DAYFLOW está abierta. iOS no garantiza alarmas
              locales con la PWA cerrada. Activa las notificaciones en Ajustes si tu dispositivo las
              permite.
            </p>
          </>
        )}
        {form.recurrence === 'custom' && (
          <RecurrenceDays value={form.weekdays} onChange={(v) => field('weekdays', v)} />
        )}
        <label>
          Etiquetas
          <input
            maxLength={300}
            placeholder="Exámenes, casa, ideas… Separadas por comas"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
        </label>
        <div className="subtasks">
          <span className="field-label">Subtareas</span>
          {form.subtasks.map((s) => (
            <div className="subtask-row" key={s.id}>
              <input
                type="checkbox"
                aria-label={`Completar ${s.title}`}
                checked={s.done}
                onChange={() =>
                  field(
                    'subtasks',
                    form.subtasks.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)),
                  )
                }
              />
              <span>{s.title}</span>
              <IconButton
                icon={X}
                label={`Eliminar ${s.title}`}
                onClick={() =>
                  field(
                    'subtasks',
                    form.subtasks.filter((x) => x.id !== s.id),
                  )
                }
              />
            </div>
          ))}
          <div className="inline-input">
            <input
              aria-label="Nueva subtarea"
              maxLength={200}
              placeholder="Añadir un paso"
              value={subtask}
              onChange={(e) => setSubtask(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addSubtask();
                }
              }}
            />
            <button
              type="button"
              className="icon-button"
              aria-label="Añadir subtarea"
              onClick={addSubtask}
            >
              <Plus size={18} />
            </button>
          </div>
        </div>
        <label>
          Notas
          <textarea
            maxLength={5000}
            rows={2}
            value={form.notes}
            onChange={(e) => field('notes', e.target.value)}
          />
        </label>
        <FormError error={error} />
        <SaveFooter
          existing={!!item}
          saving={saving}
          onDelete={async () => {
            setSaving(true);
            const ok = await save((s) => {
              s.tasks = s.tasks.filter((x) => x.id !== form.id);
            }, 'Tarea eliminada');
            setSaving(false);
            if (ok) onClose();
          }}
        />
      </form>
    </Modal>
  );
}

function HabitEditor({ item, onClose }: { item?: Habit; onClose: () => void }) {
  const { state, save } = useDayflow();
  const [form, setForm] = useState<Habit>(
    () =>
      item ?? {
        id: uid(),
        updatedAt: stamp(),
        title: '',
        categoryId: state.settings.categories[0].id,
        weekdays: [1, 2, 3, 4, 5],
        target: 5,
        createdDate: dateKey(),
        completions: [],
        archived: false,
      },
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const commit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = habitSchema.safeParse({ ...form, updatedAt: stamp() });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setSaving(true);
    const ok = await save((s) => {
      const i = s.habits.findIndex((h) => h.id === form.id);
      if (item && (i < 0 || s.habits[i].updatedAt !== item.updatedAt))
        throw new Error('El hábito cambió. Vuelve a abrirlo.');
      if (i >= 0) s.habits[i] = parsed.data;
      else s.habits.push(parsed.data);
    }, 'Hábito guardado');
    setSaving(false);
    if (ok) onClose();
  };
  return (
    <Modal
      title={item ? 'Tu hábito, a tu ritmo' : 'Los pequeños pasos cuentan'}
      eyebrow={item ? 'EDITAR HÁBITO' : 'NUEVO HÁBITO'}
      onClose={onClose}
    >
      <form className="editor-form" onSubmit={commit}>
        <label>
          Nombre del hábito
          <input
            autoFocus
            required
            maxLength={100}
            placeholder="¿Qué quieres cultivar?"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
        </label>
        <CategorySelect
          value={form.categoryId}
          onChange={(categoryId) => setForm((f) => ({ ...f, categoryId }))}
        />
        <span className="field-label">Días programados</span>
        <div className="weekday-picker">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={form.weekdays.includes(d)}
              className={form.weekdays.includes(d) ? 'selected' : ''}
              onClick={() =>
                setForm((f) => {
                  const weekdays = f.weekdays.includes(d)
                    ? f.weekdays.filter((x) => x !== d)
                    : [...f.weekdays, d];
                  return {
                    ...f,
                    weekdays,
                    target: Math.min(f.target, Math.max(1, weekdays.length)),
                  };
                })
              }
            >
              {['D', 'L', 'M', 'X', 'J', 'V', 'S'][d]}
            </button>
          ))}
        </div>
        <p className="helper">
          Los días sin programar son descanso y no rompen tu racha. Los cambios de días se aplican
          también al cálculo histórico.
        </p>
        <label>
          Objetivo semanal
          <input
            type="number"
            min={1}
            max={Math.max(1, form.weekdays.length)}
            value={form.target}
            onChange={(e) => setForm((f) => ({ ...f, target: Number(e.target.value) }))}
          />
        </label>
        {item && (
          <label className="toggle-label">
            <span>
              Archivar hábito
              <small>Conserva el historial y deja de aparecer entre los pendientes.</small>
            </span>
            <input
              type="checkbox"
              checked={form.archived}
              onChange={(e) => setForm((f) => ({ ...f, archived: e.target.checked }))}
            />
          </label>
        )}
        <FormError error={error} />
        <SaveFooter
          existing={!!item}
          saving={saving}
          onDelete={async () => {
            setSaving(true);
            const ok = await save((s) => {
              s.habits = s.habits.filter((x) => x.id !== form.id);
            }, 'Hábito eliminado');
            setSaving(false);
            if (ok) onClose();
          }}
        />
      </form>
    </Modal>
  );
}

export function QuickCreate({
  onSelect,
  onCapture,
  onClose,
  date,
}: {
  onSelect: (editor: EditorState) => void;
  onCapture: () => void;
  onClose: () => void;
  date: string;
}) {
  return (
    <Modal title="Hazle sitio a algo importante" eyebrow="AÑADIR A DAYFLOW" onClose={onClose}>
      <div className="create-choices">
        <button onClick={onCapture}>
          <span>
            <Plus />
          </span>
          <div>
            <h3>Captura inteligente</h3>
            <p>Escribe tu plan y revisa la fecha y la hora.</p>
          </div>
          <Plus size={18} />
        </button>
        <button onClick={() => onSelect({ kind: 'event', date })}>
          <span>
            <CalendarDays />
          </span>
          <div>
            <h3>Actividad</h3>
            <p>Reserva tiempo en tu calendario.</p>
          </div>
          <Plus size={18} />
        </button>
        <button onClick={() => onSelect({ kind: 'task' })}>
          <span>
            <CheckSquare />
          </span>
          <div>
            <h3>Tarea</h3>
            <p>Captura una idea. Organízala después.</p>
          </div>
          <Plus size={18} />
        </button>
        <button onClick={() => onSelect({ kind: 'habit' })}>
          <span>
            <Repeat2 />
          </span>
          <div>
            <h3>Hábito</h3>
            <p>Construye una rutina que te haga bien.</p>
          </div>
          <Plus size={18} />
        </button>
      </div>
    </Modal>
  );
}

export function ActivityDetail({
  item,
  onClose,
  onEdit,
}: {
  item: Occurrence;
  onClose: () => void;
  onEdit: () => void;
}) {
  const { state, save } = useDayflow();
  const { status } = useGoogle();
  const [publish, setPublish] = useState(false);
  const link = state.google.links.find(
    (l) => l.localEventId === item.id && l.date === item.occurrenceDate,
  );
  const remote = item.google ?? (link && state.googleEvents.find((g) => g.id === link.googleId));
  if (remote) return <GoogleEventDetail event={remote} onClose={onClose} />;
  if (publish) return <GoogleWriteDialog local={item} operation="create" onClose={onClose} />;
  return (
    <Modal
      title={item.title}
      eyebrow={item.allDay ? 'TODO EL DÍA' : `${item.start} — ${item.end}`}
      onClose={onClose}
    >
      <div className="detail-body">
        <CategoryBadge id={item.categoryId} />
        <p>
          {localDate(item.occurrenceDate).toLocaleDateString('es-ES', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </p>
        {item.location && <p>{item.location}</p>}
        {item.notes && <p className="preserve-lines">{item.notes}</p>}
        {status?.connected && !!status.preferences?.writable.length && (
          <button className="text-button" onClick={() => setPublish(true)}>
            Enviar esta actividad a Google Calendar
          </button>
        )}
        <div className="form-footer">
          <button
            className="secondary-button"
            onClick={async () => {
              if (
                await save((s) => {
                  toggleActivity(s, item.id, item.occurrenceDate);
                }, 'Actividad actualizada')
              )
                onClose();
            }}
          >
            {item.completedDates.includes(item.occurrenceDate)
              ? 'Marcar pendiente'
              : 'Marcar completada'}
          </button>
          <button className="primary-button" onClick={onEdit}>
            Editar / mover
          </button>
        </div>
      </div>
    </Modal>
  );
}
