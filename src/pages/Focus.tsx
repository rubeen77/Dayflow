import { useState } from 'react';
import { Clock3, Coffee, Headphones, Pause, Play, RotateCcw, Square, Target } from 'lucide-react';
import { dateKey, durationLabel, formatDate, taskDone } from '../lib/dates';
import { stamp, uid } from '../lib/model';
import { useDayflow, useNow } from '../state/DayflowContext';
import { CategoryBadge, EmptyState, PanelHeading, SectionHeading } from '../components/ui';
import { focusRemaining, pauseOrResumeFocus, settleFocus } from '../lib/focus';
import { prepareFocusSound } from '../lib/sound';

export function FocusPage() {
  const { state, save, pending } = useDayflow();
  const now = useNow(500);
  const [focusMinutes, setFocusMinutes] = useState(state.settings.focusMinutes);
  const [breakMinutes, setBreakMinutes] = useState(state.settings.breakMinutes);
  const [taskId, setTaskId] = useState('');
  const [categoryId, setCategoryId] = useState(
    state.settings.categories.find((c) => c.id === 'study')?.id ?? state.settings.categories[0].id,
  );
  const [confirmReset, setConfirmReset] = useState(false);
  const focus = state.focus;
  const remaining = focus ? Math.ceil(focusRemaining(focus, now.getTime())) : focusMinutes * 60;
  const progress = focus ? (1 - remaining / focus.duration) * 100 : 0;
  const todaySessions = state.sessions.filter((s) => dateKey(new Date(s.startedAt)) === dateKey());
  const start = () => {
    if (state.settings.focusSound) void prepareFocusSound();
    void save((s) => {
      if (s.focus) {
        if (!focus || focus.id !== s.focus.id)
          throw new Error('La sesión ha cambiado. Vuelve a abrir concentración.');
        pauseOrResumeFocus(s, focus.id);
      } else {
        s.settings.focusMinutes = focusMinutes;
        s.settings.breakMinutes = breakMinutes;
        s.focus = {
          id: uid(),
          phase: 'focus',
          duration: focusMinutes * 60,
          remaining: focusMinutes * 60,
          deadline: Date.now() + focusMinutes * 60000,
          startedAt: stamp(),
          taskId: taskId || null,
          categoryId,
        };
      }
    });
  };
  const finish = () =>
    void save((s) => {
      if (focus) settleFocus(s, focus.id, Date.now(), true);
    }, 'Temporizador terminado. Las sesiones de al menos un minuto quedan en tu historial.');
  return (
    <div className="page-enter">
      <SectionHeading
        eyebrow="AQUÍ Y AHORA"
        title="Encuentra tu foco"
        description="El mundo puede esperar un momento. Este tiempo es tuyo."
      />
      <div className="focus-layout">
        <section className="panel focus-main">
          <div className="focus-mode">
            <span className={focus?.phase !== 'break' ? 'active' : ''}>
              <Headphones size={16} />
              Concentración
            </span>
            <span className={focus?.phase === 'break' ? 'active' : ''}>
              <Coffee size={16} />
              Descanso
            </span>
          </div>
          <div className={`focus-orbit ${focus?.deadline ? 'running' : ''}`}>
            <div className="focus-orbit-track" />
            <svg viewBox="0 0 320 320" aria-hidden="true">
              <circle
                cx="160"
                cy="160"
                r="145"
                strokeDasharray={911}
                strokeDashoffset={911 * (1 - progress / 100)}
              />
            </svg>
            <div className="focus-time">
              <span className="eyebrow">
                {focus?.phase === 'break'
                  ? 'RESPIRA UN MOMENTO'
                  : focus?.deadline
                    ? 'ESTÁS AQUÍ. ESO CUENTA.'
                    : focus
                      ? 'UNA PAUSA ESTÁ BIEN'
                      : 'UNA COSA A LA VEZ'}
              </span>
              <strong>
                {String(Math.floor(remaining / 60)).padStart(2, '0')}
                <b>:</b>
                {String(remaining % 60).padStart(2, '0')}
              </strong>
              <span>
                {focus?.phase === 'break'
                  ? 'Recarga, estira, vuelve a ti.'
                  : focus?.taskId
                    ? (state.tasks.find((t) => t.id === focus.taskId)?.title ??
                      'Sesión de concentración')
                    : 'Dale toda tu atención al presente.'}
              </span>
            </div>
          </div>
          <div className="focus-controls">
            <button
              className="secondary-button icon-only"
              aria-label="Reiniciar temporizador"
              disabled={!focus || pending > 0}
              onClick={() => {
                if (!confirmReset) {
                  setConfirmReset(true);
                  return;
                }
                void save((s) => {
                  s.focus = null;
                }, 'Temporizador reiniciado sin registrar la sesión');
                setConfirmReset(false);
              }}
            >
              <RotateCcw size={19} />
            </button>
            <button
              className="primary-button focus-start"
              disabled={
                pending > 0 ||
                !Number.isFinite(focusMinutes) ||
                focusMinutes < 1 ||
                focusMinutes > 180 ||
                !Number.isFinite(breakMinutes) ||
                breakMinutes < 1 ||
                breakMinutes > 60
              }
              onClick={start}
            >
              {focus?.deadline ? <Pause size={19} /> : <Play size={19} fill="currentColor" />}
              {focus?.deadline ? 'Pausar' : focus ? 'Continuar' : 'Empezar sesión'}
            </button>
            <button
              className="secondary-button icon-only"
              aria-label="Terminar y guardar sesión"
              disabled={!focus || pending > 0}
              onClick={finish}
            >
              <Square size={17} />
            </button>
          </div>
          {confirmReset && (
            <p className="helper">
              Pulsa de nuevo reiniciar para descartar esta sesión, o continúa el temporizador.
            </p>
          )}
          <div className="focus-settings">
            <label className="toggle-label">
              <span>
                Sonido al terminar
                <small>Suena con la app abierta y el audio permitido por el dispositivo.</small>
              </span>
              <input
                type="checkbox"
                checked={state.settings.focusSound ?? false}
                onChange={(e) => {
                  const checked = e.target.checked;
                  if (checked) void prepareFocusSound();
                  void save((s) => {
                    s.settings.focusSound = checked;
                  });
                }}
              />
            </label>
            <div className="form-grid">
              <label>
                Concentración (min)
                <input
                  type="number"
                  min={1}
                  max={180}
                  disabled={!!focus}
                  value={focusMinutes}
                  onChange={(e) => setFocusMinutes(Number(e.target.value))}
                />
              </label>
              <label>
                Descanso (min)
                <input
                  type="number"
                  min={1}
                  max={60}
                  disabled={!!focus}
                  value={breakMinutes}
                  onChange={(e) => setBreakMinutes(Number(e.target.value))}
                />
              </label>
            </div>
            <label>
              Asociar a una tarea
              <select
                disabled={!!focus}
                value={taskId}
                onChange={(e) => {
                  setTaskId(e.target.value);
                  const t = state.tasks.find((t) => t.id === e.target.value);
                  if (t) setCategoryId(t.categoryId);
                }}
              >
                <option value="">Concentración libre</option>
                {state.tasks
                  .filter((t) => !taskDone(t, dateKey()))
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Categoría
              <select
                disabled={!!focus}
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                {state.settings.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="helper focus-helper">
            El reloj conserva su estado al cerrar la app. Una sesión en marcha sigue contando hasta
            su final previsto; puedes pausarla antes de salir. Se registran sesiones de al menos un
            minuto.
          </p>
        </section>
        <aside className="focus-aside">
          <section className="focus-thought">
            <span>MENOS, PERO MEJOR</span>
            <h2>
              La atención es
              <br />
              tu mejor recurso<span>.</span>
            </h2>
            <p>Protege un pequeño espacio para hacer algo que importe.</p>
            <div className="focus-lines" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
          </section>
          <section className="panel">
            <PanelHeading title="Tu concentración de hoy" />
            <div className="focus-today-stats">
              <div>
                <Clock3 size={18} />
                <strong>{durationLabel(todaySessions.reduce((n, s) => n + s.minutes, 0))}</strong>
                <span>tiempo de foco</span>
              </div>
              <div>
                <Target size={18} />
                <strong>{todaySessions.length}</strong>
                <span>sesiones</span>
              </div>
            </div>
          </section>
          <section className="panel">
            <PanelHeading title="Sesiones recientes" aside={`${state.sessions.length} en total`} />
            {state.sessions.length ? (
              <div className="session-list">
                {[...state.sessions]
                  .sort((a, b) => b.endedAt.localeCompare(a.endedAt))
                  .slice(0, 8)
                  .map((s) => (
                    <div key={s.id}>
                      <span className="session-icon">
                        <Headphones size={17} />
                      </span>
                      <div>
                        <strong>
                          {s.taskId
                            ? (state.tasks.find((t) => t.id === s.taskId)?.title ??
                              'Tarea eliminada')
                            : 'Concentración libre'}
                        </strong>
                        <span>
                          {formatDate(dateKey(new Date(s.startedAt)))} ·{' '}
                          {new Date(s.startedAt).toLocaleTimeString('es-ES', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <CategoryBadge id={s.categoryId} />
                      </div>
                      <b>{durationLabel(s.minutes)}</b>
                    </div>
                  ))}
              </div>
            ) : (
              <EmptyState
                compact
                icon={Headphones}
                title="Tu primer momento de foco"
                description="Al terminar una sesión, su duración aparecerá aquí."
              />
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
