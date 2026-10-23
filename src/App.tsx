import {
  Component,
  Suspense,
  lazy,
  useEffect,
  useState,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import {
  ArrowRight,
  BarChart3,
  Bell,
  CalendarDays,
  CalendarRange,
  Check,
  CheckSquare,
  ChevronRight,
  CircleHelp,
  Ellipsis,
  Headphones,
  LayoutDashboard,
  Leaf,
  Loader2,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import { dateKey, eventsOn, formatDate, repeatsOn, taskDone } from './lib/dates';
import { type Occurrence, type View } from './lib/model';
import { DayflowProvider, useDayflow } from './state/DayflowContext';
import { GoogleProvider } from './state/GoogleContext';
import { searchableEvents } from './lib/googleEvents';
import { ActivityDetail, Editor, QuickCreate, type EditorState } from './components/Editors';
import { EmptyState, IconButton, Modal } from './components/ui';
import { Today, type PageProps } from './pages/Today';
import { Calendar } from './pages/Calendar';
import { Tasks } from './pages/Tasks';
import { SmartCapture } from './components/SmartCapture';
import { FocusDock } from './components/FocusDock';
const Planner = lazy(() => import('./pages/Planner').then((m) => ({ default: m.Planner })));
const Habits = lazy(() => import('./pages/Habits').then((m) => ({ default: m.Habits })));
const FocusPage = lazy(() => import('./pages/Focus').then((m) => ({ default: m.FocusPage })));
const Stats = lazy(() => import('./pages/Stats').then((m) => ({ default: m.Stats })));
const SettingsPage = lazy(() =>
  import('./pages/Settings').then((m) => ({ default: m.SettingsPage })),
);

const navigation: { id: View; label: string; icon: LucideIcon }[] = [
  { id: 'today', label: 'Mi día', icon: LayoutDashboard },
  { id: 'calendar', label: 'Calendario', icon: CalendarDays },
  { id: 'tasks', label: 'Tareas', icon: CheckSquare },
  { id: 'planner', label: 'Mi semana', icon: CalendarRange },
  { id: 'habits', label: 'Hábitos', icon: Leaf },
  { id: 'focus', label: 'Concentración', icon: Headphones },
  { id: 'stats', label: 'Estadísticas', icon: BarChart3 },
];
const allViews = [...navigation.map((n) => n.id), 'settings'];
const viewFromHash = () =>
  allViews.includes(location.hash.slice(1)) ? (location.hash.slice(1) as View) : 'today';
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

function Dayflow() {
  const { state, ready, pending, error, toast, reload } = useDayflow();
  const [view, setView] = useState<View>(viewFromHash);
  const [date, setDate] = useState(dateKey);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [detail, setDetail] = useState<Occurrence | null>(null);
  const [quickCreate, setQuickCreate] = useState(false);
  const [captureDraft, setCaptureDraft] = useState<{ text: string; onSaved?: () => void } | null>(
    null,
  );
  const [more, setMore] = useState(false);
  const [searchModal, setSearchModal] = useState(false);
  const [query, setQuery] = useState('');
  const [reminders, setReminders] = useState(false);
  const [install, setInstall] = useState(false);
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  const navigate = (v: View) => {
    location.hash = v;
    setView(v);
    setMore(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  useEffect(() => {
    const hash = () => {
      setView(viewFromHash());
      setMore(false);
    };
    const connectivity = () => setOnline(navigator.onLine);
    const prompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallEvent);
    };
    window.addEventListener('hashchange', hash);
    window.addEventListener('online', connectivity);
    window.addEventListener('offline', connectivity);
    window.addEventListener('beforeinstallprompt', prompt);
    return () => {
      window.removeEventListener('hashchange', hash);
      window.removeEventListener('online', connectivity);
      window.removeEventListener('offline', connectivity);
      window.removeEventListener('beforeinstallprompt', prompt);
    };
  }, []);
  useEffect(() => {
    document.title = `${navigation.find((n) => n.id === view)?.label ?? 'Ajustes'} · DAYFLOW`;
    document.documentElement.dataset.accent = state.settings.accent;
    document.documentElement.dataset.compact = String(state.settings.compact);
  }, [view, state.settings.accent, state.settings.compact]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (document.querySelector('dialog[open]')) return;
        setSearchModal((s) => !s);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const props: PageProps = {
    date,
    setDate,
    edit: setEditor,
    inspect: setDetail,
    navigate,
    capture: (text = '', onSaved) => setCaptureDraft({ text, onSaved }),
  };
  const taskResults = query.trim()
    ? state.tasks
        .filter((t) => t.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
        .slice(0, 8)
    : [];
  const eventResults = query.trim()
    ? searchableEvents(state)
        .filter((e) => e.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
        .slice(0, 8)
    : [];
  const reminderTasks = state.tasks.filter(
    (t) => t.reminder !== null && t.date && t.time && !taskDone(t, dateKey()),
  );
  const mobile = ['today', 'calendar', 'tasks', 'habits'];
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Saltar al contenido
      </a>
      <aside className="sidebar">
        <button
          className="brand"
          aria-label="DAYFLOW — Ir a Mi día"
          onClick={() => navigate('today')}
        >
          <img src="/icon.svg" width="35" height="35" alt="" />
          <span>
            DAYFLOW<span className="brand-dot">.</span>
          </span>
        </button>
        <span className="sidebar-caption">TU VIDA, EN EQUILIBRIO</span>
        <div className="workspace-chip">
          <span>{state.settings.name ? state.settings.name.charAt(0).toUpperCase() : 'D'}</span>
          <div>
            <strong>Mi espacio personal</strong>
            <small>Un día a la vez</small>
          </div>
          <ShieldCheck size={14} />
        </div>
        <nav aria-label="Navegación principal">
          <span className="nav-group-label">ORGANIZA TU DÍA</span>
          {navigation.slice(0, 4).map((n) => (
            <button
              aria-current={view === n.id ? 'page' : undefined}
              className={`nav-item ${view === n.id ? 'active' : ''}`}
              key={n.id}
              onClick={() => navigate(n.id)}
            >
              <n.icon size={19} strokeWidth={1.6} />
              <span>{n.label}</span>
              {n.id === 'tasks' &&
                state.tasks.filter((t) => !taskDone(t, dateKey())).length > 0 && (
                  <small>{state.tasks.filter((t) => !taskDone(t, dateKey())).length}</small>
                )}
              {view === n.id && <i />}
            </button>
          ))}
          <span className="nav-group-label second-group">CULTIVA TU BIENESTAR</span>
          {navigation.slice(4).map((n) => (
            <button
              aria-current={view === n.id ? 'page' : undefined}
              className={`nav-item ${view === n.id ? 'active' : ''}`}
              key={n.id}
              onClick={() => navigate(n.id)}
            >
              <n.icon size={19} strokeWidth={1.6} />
              <span>{n.label}</span>
              {view === n.id && <i />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-thought">
            <Sparkles size={19} />
            <p>
              Un buen día empieza
              <br />
              con un poco de claridad.
            </p>
            <span>HAZ QUE CUENTE</span>
          </div>
          <button
            className={`nav-item ${view === 'settings' ? 'active' : ''}`}
            onClick={() => navigate('settings')}
          >
            <Settings size={19} strokeWidth={1.6} />
            Ajustes
            <ChevronRight size={14} />
          </button>
          <div className="local-indicator">
            <span className="status-dot" />
            Guardado en tu dispositivo<span>v1.0</span>
          </div>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div className="breadcrumb">
            <span className="desktop-breadcrumb">
              Mi espacio personal <ChevronRight size={12} />
            </span>
            <span>{navigation.find((n) => n.id === view)?.label ?? 'Ajustes'}</span>
            <span className="mobile-wordmark">
              DAYFLOW<span>.</span>
            </span>
          </div>
          <div className="topbar-actions">
            <button
              className="search-trigger"
              aria-label="Buscar en DAYFLOW"
              onClick={() => setSearchModal(true)}
            >
              <Search size={17} />
              <span>Encuentra tu próximo paso</span>
              <kbd>⌘ K</kbd>
            </button>
            <span
              className={`save-status ${pending ? 'saving' : ''}`}
              title={
                error
                  ? 'El último cambio no se ha confirmado'
                  : pending
                    ? 'Esperando a que termine la transacción'
                    : ready
                      ? 'Cambios confirmados en IndexedDB'
                      : 'Conectando con IndexedDB'
              }
            >
              {error ? (
                <CircleHelp size={13} />
              ) : pending || !ready ? (
                <Loader2 size={13} className="spin" />
              ) : (
                <Check size={13} />
              )}
              <span>
                {error ? 'Sin confirmar' : pending ? 'Guardando' : ready ? 'Guardado' : 'Cargando'}
              </span>
            </span>
            <IconButton icon={Bell} label="Ver recordatorios" onClick={() => setReminders(true)} />
            <button
              className="profile-button"
              aria-label="Abrir ajustes de perfil"
              onClick={() => navigate('settings')}
            >
              {state.settings.name ? state.settings.name.charAt(0).toUpperCase() : 'D'}
            </button>
          </div>
        </header>
        <main id="main-content" className="main-content">
          {error && (
            <div className="error-banner" role="alert">
              <CircleHelp size={19} />
              <span>{error}</span>
              <button className="small-button" onClick={() => void reload()}>
                Volver a cargar
              </button>
            </div>
          )}
          {!online && (
            <div className="notice offline-notice">
              <WifiOff size={16} />
              Estás sin conexión. Tus funciones locales siguen disponibles.
            </div>
          )}
          {needRefresh && (
            <div className="notice update-notice">
              <Sparkles size={16} />
              <span>Hay una nueva versión de DAYFLOW. Los datos locales se conservan.</span>
              <button
                className="small-button"
                disabled={pending > 0 || !!editor}
                onClick={() => void updateServiceWorker(true)}
              >
                Actualizar
              </button>
            </div>
          )}
          {ready ? (
            <Suspense
              fallback={
                <div className="page-loader">
                  <Loader2 className="spin" />
                  <p>Un momento para encontrar tu ritmo…</p>
                </div>
              }
            >
              {view === 'today' ? (
                <Today {...props} />
              ) : view === 'calendar' ? (
                <Calendar {...props} />
              ) : view === 'tasks' ? (
                <Tasks {...props} />
              ) : view === 'planner' ? (
                <Planner {...props} />
              ) : view === 'habits' ? (
                <Habits {...props} />
              ) : view === 'focus' ? (
                <FocusPage />
              ) : view === 'stats' ? (
                <Stats />
              ) : (
                <SettingsPage install={() => setInstall(true)} />
              )}
            </Suspense>
          ) : (
            <div className="page-loader">
              <Loader2 className="spin" />
              <h2>{error ? 'Tus datos no se han podido cargar' : 'Preparando tu espacio…'}</h2>
              <p>
                {error
                  ? 'Vuelve a intentarlo para continuar. Tus registros existentes no se sobrescribirán.'
                  : 'Conectando con el almacenamiento de este dispositivo.'}
              </p>
              {error && (
                <button className="primary-button" onClick={() => void reload()}>
                  Reintentar
                </button>
              )}
            </div>
          )}
          <footer className="app-footer">
            <span>
              DAYFLOW<span> · </span>Tu día, con intención.
            </span>
            <button onClick={() => setInstall(true)}>
              <Smartphone size={13} />
              Llévalo contigo
              <ArrowRight size={13} />
            </button>
          </footer>
        </main>
      </div>
      <button
        className="floating-add"
        disabled={!ready}
        aria-label="Crear en DAYFLOW"
        onClick={() => setQuickCreate(true)}
      >
        <Plus size={25} />
      </button>
      <nav className="bottom-nav" aria-label="Navegación móvil">
        {mobile.map((id) => {
          const n = navigation.find((n) => n.id === id)!;
          return (
            <button
              aria-current={view === id ? 'page' : undefined}
              key={id}
              className={view === id ? 'active' : ''}
              onClick={() => navigate(id as View)}
            >
              <n.icon size={21} strokeWidth={1.7} />
              <span>{n.label}</span>
            </button>
          );
        })}
        <button
          className={!mobile.includes(view) ? 'active' : ''}
          onClick={() => setMore(true)}
          aria-label="Más secciones"
        >
          <Ellipsis size={23} />
          <span>Más</span>
        </button>
      </nav>
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          <span>{toast}</span>
        </div>
      )}
      {editor && <Editor editor={editor} onClose={() => setEditor(null)} />}
      {detail && (
        <ActivityDetail
          item={detail}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setEditor({ kind: 'event', item: detail });
            setDetail(null);
          }}
        />
      )}
      {view !== 'focus' && <FocusDock onOpen={() => navigate('focus')} />}
      {captureDraft && (
        <SmartCapture
          initialText={captureDraft.text}
          onClose={() => setCaptureDraft(null)}
          onSaved={() => {
            captureDraft.onSaved?.();
            setCaptureDraft(null);
          }}
        />
      )}
      {quickCreate && (
        <QuickCreate
          date={date}
          onCapture={() => {
            setQuickCreate(false);
            setCaptureDraft({ text: '' });
          }}
          onClose={() => setQuickCreate(false)}
          onSelect={(e) => {
            setQuickCreate(false);
            setEditor(e);
          }}
        />
      )}
      {more && (
        <Modal
          title="Tu espacio personal"
          eyebrow="ENCUENTRA TU EQUILIBRIO"
          onClose={() => setMore(false)}
        >
          <div className="more-navigation">
            {[
              ...navigation.filter((n) => !mobile.includes(n.id)),
              { id: 'settings' as View, label: 'Ajustes', icon: Settings },
            ].map((n) => (
              <button key={n.id} onClick={() => navigate(n.id)}>
                <n.icon size={22} />
                <span>{n.label}</span>
                <ChevronRight size={17} />
              </button>
            ))}
          </div>
        </Modal>
      )}
      {searchModal && (
        <Modal
          title="Encuentra lo que necesitas"
          eyebrow="BUSCAR EN TU ESPACIO"
          onClose={() => {
            setSearchModal(false);
            setQuery('');
          }}
        >
          <div className="global-search">
            <div className="search-field">
              <Search size={18} />
              <input
                autoFocus
                aria-label="Búsqueda global"
                placeholder="Una actividad, una tarea…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {eventResults.map((e) => (
              <button
                className="search-result"
                key={e.id}
                onClick={() => {
                  const day =
                    repeatsOn(e, dateKey()) && !e.exceptions.includes(dateKey())
                      ? dateKey()
                      : e.date;
                  setDetail(
                    eventsOn(state, day).find((x) => x.id === e.id) ?? {
                      ...e,
                      occurrenceDate: e.date,
                    },
                  );
                  setSearchModal(false);
                  setQuery('');
                }}
              >
                <CalendarDays size={18} />
                <div>
                  <strong>{e.title}</strong>
                  <span>
                    Actividad · {formatDate(e.date)}
                    {e.recurrence !== 'none' ? ' · Se repite' : ''}
                  </span>
                </div>
              </button>
            ))}
            {taskResults.map((t) => (
              <button
                className="search-result"
                key={t.id}
                onClick={() => {
                  setEditor({ kind: 'task', item: t });
                  setSearchModal(false);
                  setQuery('');
                }}
              >
                <CheckSquare size={18} />
                <div>
                  <strong>{t.title}</strong>
                  <span>Tarea · {t.date ? formatDate(t.date) : 'Sin fecha'}</span>
                </div>
              </button>
            ))}
            {!eventResults.length && !taskResults.length && (
              <EmptyState
                compact
                icon={Search}
                title={query ? 'No hay coincidencias' : 'Todo está un poco más cerca'}
                description={
                  query
                    ? 'Prueba con otro nombre.'
                    : 'Empieza a escribir para buscar entre tus actividades y tareas.'
                }
              />
            )}
          </div>
        </Modal>
      )}
      {reminders && (
        <Modal
          title="Lo importante, a tiempo"
          eyebrow="TUS RECORDATORIOS"
          onClose={() => setReminders(false)}
        >
          <div className="plan-body">
            <p className="helper">
              Los avisos locales se comprueban mientras DAYFLOW está abierta. Al cerrar la
              aplicación, iOS puede suspenderlos.
            </p>
            {reminderTasks.length ? (
              reminderTasks.map((t) => (
                <button
                  key={t.id}
                  className="search-result"
                  onClick={() => {
                    setReminders(false);
                    setEditor({ kind: 'task', item: t });
                  }}
                >
                  <Bell size={18} />
                  <div>
                    <strong>{t.title}</strong>
                    <span>
                      {t.date && formatDate(t.date)} · {t.time} ·{' '}
                      {t.reminder ? `${t.reminder} min antes` : 'A la hora'}
                    </span>
                  </div>
                </button>
              ))
            ) : (
              <EmptyState
                compact
                icon={Bell}
                title="Todo en su momento"
                description="Añade fecha, hora y un recordatorio a una tarea para verla aquí."
              />
            )}
          </div>
        </Modal>
      )}
      {install && (
        <Modal
          title="Llévalo contigo"
          eyebrow="DAYFLOW EN TU IPHONE"
          onClose={() => setInstall(false)}
        >
          <div className="install-body">
            <span className="install-app-icon">
              <img src="/icon.svg" alt="DAYFLOW" width="72" height="72" />
            </span>
            <h3>Tu espacio, a un toque.</h3>
            <p>
              Instala DAYFLOW para abrirla como una app y usar sus funciones locales sin conexión
              tras la primera carga completa.
            </p>
            {installEvent ? (
              <button
                className="primary-button"
                onClick={async () => {
                  await installEvent.prompt();
                  await installEvent.userChoice;
                  setInstallEvent(null);
                }}
              >
                Instalar DAYFLOW
              </button>
            ) : (
              <ol>
                <li>
                  Abre esta dirección en <strong>Safari</strong>.
                </li>
                <li>
                  Toca <strong>Compartir</strong> en la barra del navegador.
                </li>
                <li>
                  Elige <strong>Añadir a pantalla de inicio</strong> y confirma.
                </li>
              </ol>
            )}
            <p className="helper">
              Se necesita HTTPS en producción. El almacenamiento pertenece a este dispositivo y al
              origen web; usa una copia JSON para trasladarlo. Safari y la PWA pueden mantener
              espacios separados.
            </p>
            <button
              className="text-button"
              onClick={() => {
                setInstall(false);
                navigate('settings');
              }}
            >
              Gestionar mis copias
              <ArrowRight size={15} />
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('DAYFLOW no pudo mostrar esta pantalla', error, info.componentStack);
  }
  render() {
    return this.state.failed ? (
      <div className="fatal-error">
        <img src="/icon.svg" width="72" height="72" alt="DAYFLOW" />
        <h1>No se pudo abrir esta pantalla.</h1>
        <p>Tus datos guardados siguen en el dispositivo. Recarga para volver a intentarlo.</p>
        <button className="primary-button" onClick={() => location.reload()}>
          Recargar DAYFLOW
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
export default function App() {
  return (
    <AppErrorBoundary>
      <DayflowProvider>
        <GoogleProvider>
          <Dayflow />
        </GoogleProvider>
      </DayflowProvider>
    </AppErrorBoundary>
  );
}
