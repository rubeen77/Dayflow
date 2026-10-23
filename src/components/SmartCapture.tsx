import { useRef, useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { dateKey, minutes, timeOf } from '../lib/dates';
import { captureDays, parseCapture } from '../lib/capture';
import { eventSchema, stamp, taskSchema, uid, type Activity } from '../lib/model';
import { useDayflow } from '../state/DayflowContext';
import { Modal } from './ui';

export function SmartCapture({
  initialText = '',
  onClose,
  onSaved,
}: {
  initialText?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { state, save, error } = useDayflow();
  const [text, setText] = useState(initialText);
  const [draft, setDraft] = useState(() =>
    initialText.trim() ? parseCapture(initialText, state.settings) : null,
  );
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const guard = useRef(false);
  const recordId = useRef(uid());
  const interpret = () => {
    if (text.trim()) {
      setDraft(parseCapture(text, state.settings));
      setFormError('');
    }
  };
  return (
    <Modal
      title={draft ? 'Así quedaría tu plan' : 'Escríbelo como lo piensas'}
      eyebrow="CAPTURA INTELIGENTE · EN TU DISPOSITIVO"
      onClose={onClose}
    >
      <form
        className="editor-form smart-capture"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!draft) {
            interpret();
            return;
          }
          if (guard.current) return;
          const now = stamp();
          const common = {
            id: recordId.current,
            updatedAt: now,
            title: draft.title,
            categoryId: draft.categoryId,
            recurrence: draft.recurrence,
            weekdays: draft.weekdays,
          };
          const event = {
            ...common,
            date: draft.date ?? dateKey(),
            start: draft.time ?? '09:00',
            end: timeOf(minutes(draft.time ?? '09:00') + draft.duration),
            allDay: !draft.time,
            fixed: false,
            until: null,
            exceptions: [],
            completedDates: [],
            location: '',
            notes: '',
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          };
          const task = {
            ...common,
            date: draft.date,
            time: draft.time,
            deadline: null,
            duration: draft.duration,
            priority: 'medium' as const,
            listId: state.settings.lists[0].id,
            tags: [],
            notes: '',
            subtasks: [],
            completedAt: null,
            doneDates: [],
            reminder: null,
          };
          const parsed =
            draft.kind === 'event' ? eventSchema.safeParse(event) : taskSchema.safeParse(task);
          if (!parsed.success || (draft.time && minutes(draft.time) + draft.duration > 1439)) {
            setFormError(
              parsed.error?.issues[0]?.message ?? 'La duración debe terminar dentro del día.',
            );
            return;
          }
          guard.current = true;
          setSaving(true);
          const ok = await save(
            (s) => {
              if (
                s.events.some((e) => e.id === common.id) ||
                s.tasks.some((t) => t.id === common.id)
              )
                throw new Error('Este plan ya se ha guardado.');
              if (draft.kind === 'event') s.events.push(eventSchema.parse(event));
              else s.tasks.push(taskSchema.parse(task));
            },
            draft.kind === 'event' ? 'Actividad creada' : 'Tarea guardada',
          );
          guard.current = false;
          setSaving(false);
          if (ok) onSaved();
        }}
      >
        <label>
          Tu idea
          <input
            autoFocus={!draft}
            aria-label="Texto de captura inteligente"
            maxLength={300}
            value={text}
            placeholder="Estudiar programación mañana a las 17:00"
            onChange={(e) => {
              setText(e.target.value);
              setDraft(null);
            }}
            enterKeyHint="go"
          />
        </label>
        {!draft ? (
          <>
            <p className="helper">
              Reconoce hoy, mañana, fechas, días de la semana, horas y repeticiones. Siempre
              revisarás los datos antes de guardarlos.
            </p>
            <button className="primary-button" disabled={!text.trim()}>
              <Sparkles size={16} />
              Interpretar y revisar
            </button>
          </>
        ) : (
          <>
            <div className="capture-understood">
              <Sparkles size={16} />
              Revisa y ajusta lo que he entendido
            </div>
            <div className="segmented">
              <button
                type="button"
                className={draft.kind === 'task' ? 'selected' : ''}
                onClick={() => setDraft({ ...draft, kind: 'task' })}
              >
                Tarea
              </button>
              <button
                type="button"
                className={draft.kind === 'event' ? 'selected' : ''}
                onClick={() => setDraft({ ...draft, kind: 'event', date: draft.date ?? dateKey() })}
              >
                Actividad
              </button>
            </div>
            <label>
              Nombre interpretado
              <input
                required
                maxLength={160}
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
            <div className="form-grid">
              <label>
                Fecha interpretada
                <input
                  type="date"
                  required={draft.kind === 'event' || draft.recurrence !== 'none'}
                  value={draft.date ?? ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      date: e.target.value || null,
                      time: e.target.value ? draft.time : null,
                    })
                  }
                />
              </label>
              <label>
                Hora interpretada
                <input
                  type="time"
                  disabled={!draft.date}
                  value={draft.time ?? ''}
                  onChange={(e) => setDraft({ ...draft, time: e.target.value || null })}
                />
              </label>
            </div>
            <div className="form-grid">
              <label>
                Duración estimada (min)
                <input
                  required
                  type="number"
                  min={5}
                  max={720}
                  value={draft.duration}
                  onChange={(e) => setDraft({ ...draft, duration: Number(e.target.value) })}
                />
              </label>
              <label>
                Categoría
                <select
                  value={draft.categoryId}
                  onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}
                >
                  {state.settings.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Repetición interpretada
              <select
                value={draft.recurrence}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    recurrence: e.target.value as Activity['recurrence'],
                    weekdays: captureDays(draft.date, draft.weekdays),
                  })
                }
              >
                <option value="none">No se repite</option>
                <option value="daily">Cada día</option>
                <option value="weekdays">De lunes a viernes</option>
                <option value="weekly">Cada semana</option>
                <option value="custom">Días concretos</option>
              </select>
            </label>
            {draft.recurrence === 'custom' && (
              <div className="weekday-picker">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={!!draft.weekdays?.includes(d)}
                    className={draft.weekdays?.includes(d) ? 'selected' : ''}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        weekdays: draft.weekdays?.includes(d)
                          ? draft.weekdays.filter((x) => x !== d)
                          : [...(draft.weekdays ?? []), d],
                      })
                    }
                  >
                    {['D', 'L', 'M', 'X', 'J', 'V', 'S'][d]}
                  </button>
                ))}
              </div>
            )}
            {draft.warnings.map((w) => (
              <p className="helper" key={w}>
                {w}
              </p>
            ))}
            {(formError || error) && (
              <p className="form-error" role="alert">
                {formError || error}
              </p>
            )}
            <button className="primary-button" disabled={saving}>
              {saving ? 'Guardando…' : 'Confirmar y guardar'}
              <ArrowRight size={16} />
            </button>
          </>
        )}
      </form>
    </Modal>
  );
}
