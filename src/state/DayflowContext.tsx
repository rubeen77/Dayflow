import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { dateKey, repeatsOn, taskDone } from '../lib/dates';
import { defaults, type State } from '../lib/model';
import { settleFocus } from '../lib/focus';
import { playFocusSound } from '../lib/sound';
import { repository } from '../lib/storage';

interface ContextValue {
  state: State;
  ready: boolean;
  pending: number;
  error: string | null;
  toast: string;
  notify: (message: string) => void;
  clearError: () => void;
  save: (change: (current: State) => void, message?: string) => Promise<boolean>;
  reload: () => Promise<void>;
}
const Context = createContext<ContextValue | null>(null);
export function DayflowProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(defaults);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 4200);
  }, []);
  const accept = useCallback(
    (s: State) => setState((current) => (s.revision >= current.revision ? s : current)),
    [],
  );
  const reload = useCallback(async () => {
    try {
      accept(await repository.read());
      setReady(true);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se ha podido leer el almacenamiento.');
    }
  }, [accept]);
  const save = useCallback(
    async (change: (current: State) => void, message?: string) => {
      if (!ready) {
        setError('El almacenamiento aún no está disponible. Vuelve a intentar cargar tus datos.');
        return false;
      }
      setPending((n) => n + 1);
      try {
        const result = await repository.transact(change);
        accept(result);
        setError(null);
        channel.current?.postMessage(result.revision);
        if (message) notify(message);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se ha podido guardar. Vuelve a intentarlo.');
        return false;
      } finally {
        setPending((n) => n - 1);
      }
    },
    [ready, accept, notify],
  );
  useEffect(() => {
    void reload();
    if ('BroadcastChannel' in globalThis) {
      channel.current = new BroadcastChannel('dayflow-changes');
      channel.current.onmessage = () => void reload();
    }
    const visibility = () => {
      if (document.visibilityState === 'visible') void reload();
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      channel.current?.close();
      document.removeEventListener('visibilitychange', visibility);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [reload]);
  useEffect(() => {
    const focus = state.focus;
    if (!focus?.deadline) return;
    let completing = false;
    const tick = () => {
      if (Date.now() < focus.deadline! || completing) return;
      completing = true;
      let committed = false;
      void save((s) => {
        committed = settleFocus(s, focus.id);
      }).then((ok) => {
        if (!ok) completing = false;
        else if (committed) {
          notify(
            focus.phase === 'focus'
              ? 'Sesión guardada. Te has ganado un descanso.'
              : 'Descanso terminado.',
          );
          if (state.settings.focusSound) playFocusSound();
        }
      });
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [state.focus, state.settings.focusSound, save, notify]);
  const reminded = useRef(new Set<string>());
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      for (const task of state.tasks) {
        if (task.reminder === null || !task.date || !task.time || task.completedAt) continue;
        const day = task.recurrence === 'none' ? task.date : dateKey();
        if (!repeatsOn({ ...task, date: task.date }, day) || taskDone(task, day)) continue;
        const scheduled = new Date(`${day}T${task.time}:00`).getTime();
        const at = scheduled - task.reminder * 60000;
        const key = `${task.id}-${day}-${task.time}`;
        if (now >= at && now <= scheduled + 60000 && !reminded.current.has(key)) {
          reminded.current.add(key);
          notify(`Recordatorio: ${task.title} · ${task.time}`);
          if (
            'Notification' in window &&
            Notification.permission === 'granted' &&
            'serviceWorker' in navigator
          ) {
            void navigator.serviceWorker
              .getRegistration()
              .then((reg) =>
                reg?.showNotification('DAYFLOW · Recordatorio', {
                  body: `${task.title} · ${task.time}`,
                  icon: '/icon-192.png',
                  tag: key,
                }),
              )
              .catch(() => {});
          }
        }
      }
    };
    tick();
    const timer = setInterval(tick, 30000);
    return () => clearInterval(timer);
  }, [state.tasks, notify]);
  return (
    <Context.Provider
      value={{
        state,
        ready,
        pending,
        error,
        toast,
        save,
        notify,
        clearError: () => setError(null),
        reload,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useDayflow() {
  const context = useContext(Context);
  if (!context) throw new Error('Falta DayflowProvider');
  return context;
}

export function useNow(interval = 30000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const timer = setInterval(tick, interval);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [interval]);
  return now;
}
