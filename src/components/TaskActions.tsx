import { useState } from 'react';
import { ArrowRight, CalendarClock, Clock3 } from 'lucide-react';
import { addDays, dateKey, durationLabel, formatDate } from '../lib/dates';
import { convertTaskToBlock, nextTaskDay, postponeTask, taskSlots } from '../lib/actions';
import type { Task } from '../lib/model';
import { useDayflow } from '../state/DayflowContext';
import { Modal } from './ui';

export function TaskActions({
  task,
  onClose,
  onEdit,
}: {
  task: Task;
  onClose: () => void;
  onEdit: () => void;
}) {
  const { state, save, pending, error } = useDayflow();
  const [day, setDay] = useState(() => nextTaskDay(task));
  const [start, setStart] = useState(
    () => taskSlots(state, task, nextTaskDay(task))[0]?.start ?? '09:00',
  );
  const slots = taskSlots(state, task, day);
  const hasBlock = state.events.some(
    (e) => e.sourceTaskId === task.id && (task.recurrence === 'none' || e.taskDate === day),
  );
  return (
    <Modal title={task.title} eyebrow="HAZLE ESPACIO EN TU DÍA" onClose={onClose}>
      <div className="plan-body task-action-body">
        <div className="inline-controls">
          <Clock3 size={17} />
          <span>
            {durationLabel(task.duration)} estimados · {task.subtasks.filter((s) => s.done).length}/
            {task.subtasks.length} pasos
          </span>
        </div>
        {task.recurrence === 'none' && !hasBlock && (
          <button
            className="secondary-button"
            disabled={pending > 0}
            onClick={async () => {
              if (
                await save(
                  (s) => postponeTask(s, task.id, addDays(dateKey(), 1)),
                  'Tarea pospuesta para mañana',
                )
              )
                onClose();
            }}
          >
            Posponer para mañana
            <ArrowRight size={16} />
          </button>
        )}
        <label>
          Fecha para planificar
          <input
            type="date"
            min={dateKey()}
            value={day}
            onChange={(e) => {
              if (!e.target.value) return;
              setDay(e.target.value);
              setStart(taskSlots(state, task, e.target.value)[0]?.start ?? '09:00');
            }}
          />
        </label>
        {!hasBlock ? (
          <>
            <div className="slot-heading">
              <CalendarClock size={17} />
              <h3>Huecos disponibles</h3>
            </div>
            {slots.length ? (
              <div className="slot-options">
                {slots.map((slot) => (
                  <button
                    className={start === slot.start ? 'selected' : ''}
                    key={slot.start}
                    onClick={() => setStart(slot.start)}
                  >
                    <strong>
                      {slot.start} — {slot.end}
                    </strong>
                    <span>Libre hasta {slot.availableUntil}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="helper">
                No cabe la tarea en este día respetando tus horarios y la fecha límite. Prueba otra
                fecha.
              </p>
            )}
            <label>
              Hora de inicio
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <p className="helper">
              Se creará un bloque enlazado a la tarea el {formatDate(day)}. Completar cualquiera de
              los dos actualizará ambos.
            </p>
            <button
              className="primary-button"
              disabled={pending > 0 || !slots.length}
              onClick={async () => {
                if (
                  await save(
                    (s) => convertTaskToBlock(s, task.id, day, start),
                    'Tarea convertida en bloque de tiempo',
                  )
                )
                  onClose();
              }}
            >
              Crear bloque de tiempo
            </button>
            {task.recurrence === 'none' && (
              <button
                className="secondary-button"
                disabled={pending > 0}
                onClick={async () => {
                  if (
                    await save(
                      (s) => postponeTask(s, task.id, day),
                      'Fecha de la tarea actualizada',
                    )
                  )
                    onClose();
                }}
              >
                Posponer al día elegido
              </button>
            )}
          </>
        ) : (
          <p className="notice">
            Esta tarea ya tiene un bloque. Puedes moverlo y cambiar su duración en el calendario.
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="text-button" onClick={onEdit}>
          Editar todos los detalles
          <ArrowRight size={15} />
        </button>
      </div>
    </Modal>
  );
}
