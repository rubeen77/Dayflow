import { stamp, uid, type Focus, type State } from './model';

export const focusRemaining = (focus: Focus, now = Date.now()) =>
  focus.deadline === null ? focus.remaining : Math.max(0, (focus.deadline - now) / 1000);
export function pauseOrResumeFocus(state: State, expectedId: string, now = Date.now()) {
  if (!state.focus || state.focus.id !== expectedId)
    throw new Error('La sesión ha cambiado en otra ventana. Vuelve a abrir concentración.');
  if (state.focus.deadline !== null) {
    state.focus.remaining = focusRemaining(state.focus, now);
    state.focus.deadline = null;
  } else state.focus.deadline = now + state.focus.remaining * 1000;
}
export function settleFocus(
  state: State,
  expectedId: string,
  now = Date.now(),
  finishEarly = false,
) {
  const focus = state.focus;
  if (
    !focus ||
    focus.id !== expectedId ||
    (!finishEarly && (focus.deadline === null || now < focus.deadline))
  )
    return false;
  const elapsed = focus.duration - focusRemaining(focus, now);
  if (focus.phase === 'focus' && elapsed >= 60 && !state.sessions.some((s) => s.id === focus.id))
    state.sessions.push({
      id: focus.id,
      updatedAt: stamp(),
      startedAt: focus.startedAt,
      endedAt: new Date(finishEarly ? now : focus.deadline!).toISOString(),
      minutes: Math.floor(elapsed / 6) / 10,
      categoryId: focus.categoryId,
      taskId: focus.taskId,
    });
  if (focus.phase === 'focus' && !finishEarly)
    state.focus = {
      id: uid(),
      phase: 'break',
      duration: state.settings.breakMinutes * 60,
      remaining: state.settings.breakMinutes * 60,
      deadline: null,
      startedAt: stamp(),
      taskId: focus.taskId,
      categoryId: focus.categoryId,
    };
  else state.focus = null;
  return true;
}
