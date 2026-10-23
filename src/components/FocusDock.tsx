import { Headphones, Pause, Play } from 'lucide-react';
import { focusRemaining, pauseOrResumeFocus } from '../lib/focus';
import { useDayflow, useNow } from '../state/DayflowContext';
export function FocusDock({ onOpen }: { onOpen: () => void }) {
  const { state, save, pending } = useDayflow();
  const now = useNow(1000);
  const focus = state.focus;
  if (!focus) return null;
  const seconds = Math.ceil(focusRemaining(focus, now.getTime()));
  return (
    <aside className="focus-dock" aria-label="Sesión de concentración activa">
      <button onClick={onOpen}>
        <Headphones size={18} />
        <span>
          <strong>
            {focus.phase === 'break'
              ? 'Tu descanso'
              : (state.tasks.find((t) => t.id === focus.taskId)?.title ?? 'Concentración')}
          </strong>
          <small>{focus.deadline ? 'En marcha' : 'En pausa'}</small>
        </span>
        <b>
          {String(Math.floor(seconds / 60)).padStart(2, '0')}:
          {String(seconds % 60).padStart(2, '0')}
        </b>
      </button>
      <button
        className="icon-button"
        aria-label={focus.deadline ? 'Pausar sesión activa' : 'Reanudar sesión activa'}
        disabled={pending > 0}
        onClick={() => void save((s) => pauseOrResumeFocus(s, focus.id))}
      >
        {focus.deadline ? <Pause size={19} /> : <Play size={19} />}
      </button>
    </aside>
  );
}
