import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  Check,
  ChevronRight,
  Database,
  Download,
  HardDrive,
  Heart,
  Plus,
  ShieldCheck,
  Smartphone,
  Upload,
} from 'lucide-react';
import { settingsSchema, uid, type Settings, type State } from '../lib/model';
import { exportBackup, mergeBackup, parseBackup, repository } from '../lib/storage';
import { useDayflow } from '../state/DayflowContext';
import { Modal, PanelHeading, SectionHeading } from '../components/ui';
import { GoogleAccounts } from '../components/GoogleAccounts';

export function SettingsPage({ install }: { install: () => void }) {
  const { state, save, pending, notify } = useDayflow();
  const [form, setForm] = useState<Settings>(() => structuredClone(state.settings));
  const [error, setError] = useState('');
  const [persistent, setPersistent] = useState<boolean | null>(null);
  const [estimate, setEstimate] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const [backup, setBackup] = useState<ReturnType<typeof parseBackup> | null>(null);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [permission, setPermission] = useState(() =>
    'Notification' in window ? Notification.permission : 'unsupported',
  );
  const [newCategory, setNewCategory] = useState('');
  const [categoryColor, setCategoryColor] = useState('#b6a0f7');
  useEffect(() => {
    void navigator.storage
      ?.persisted?.()
      .then(setPersistent)
      .catch(() => {});
    void navigator.storage
      ?.estimate?.()
      .then((e) =>
        setEstimate(
          e.usage
            ? `${(e.usage / 1024 / 1024).toFixed(1)} MB utilizados`
            : 'Almacenamiento local activo',
        ),
      )
      .catch(() => {});
  }, []);
  const field = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const download = () => {
    const url = URL.createObjectURL(new Blob([exportBackup(state)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `DAYFLOW-${new Date().toISOString().replaceAll(':', '-').slice(0, 19)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
    notify('Copia preparada. Comprueba que el archivo está en Descargas o Archivos.');
  };
  return (
    <div className="page-enter">
      <SectionHeading
        eyebrow="UN ESPACIO MUY TUYO"
        title="A tu manera"
        description="Tu ritmo, tus preferencias y el control de tus datos."
      />
      <div className="settings-layout">
        <form
          className="settings-main"
          onSubmit={async (e) => {
            e.preventDefault();
            const parsed = settingsSchema.safeParse(form);
            if (!parsed.success) {
              setError(parsed.error.issues[0].message);
              return;
            }
            if (
              await save((s) => {
                s.settings = {
                  ...parsed.data,
                  dashboard: s.settings.dashboard,
                  focusSound: s.settings.focusSound,
                };
              }, 'Preferencias guardadas')
            )
              setError('');
          }}
        >
          <section className="panel settings-panel">
            <PanelHeading title="Tu perfil" />
            <div className="settings-avatar">
              {form.name ? form.name.charAt(0).toUpperCase() : <Heart size={24} />}
            </div>
            <label>
              Cómo te llamas
              <input
                maxLength={60}
                placeholder="Tu nombre"
                value={form.name}
                onChange={(e) => field('name', e.target.value)}
              />
            </label>
            <label>
              Tu intención personal
              <textarea
                maxLength={250}
                rows={2}
                placeholder="¿A qué quieres hacerle espacio?"
                value={form.goal}
                onChange={(e) => field('goal', e.target.value)}
              />
            </label>
            <p className="helper">
              Tu intención aparecerá en Mi día, para recordar lo que de verdad importa.
            </p>
          </section>
          <section className="panel settings-panel">
            <PanelHeading title="El ritmo de tus días" />
            <div className="form-grid">
              <label>
                Hora de despertar
                <input
                  type="time"
                  required
                  value={form.wake}
                  onChange={(e) => field('wake', e.target.value)}
                />
              </label>
              <label>
                Hora de dormir
                <input
                  type="time"
                  required
                  value={form.sleep}
                  onChange={(e) => field('sleep', e.target.value)}
                />
              </label>
            </div>
            <div className="form-grid">
              <label>
                La semana empieza
                <select
                  value={form.weekStart}
                  onChange={(e) => field('weekStart', Number(e.target.value) as 0 | 1)}
                >
                  <option value="1">Lunes</option>
                  <option value="0">Domingo</option>
                </select>
              </label>
              <label>
                Duración de actividades
                <select
                  value={form.defaultDuration}
                  onChange={(e) => field('defaultDuration', Number(e.target.value))}
                >
                  {[15, 30, 45, 60, 90, 120].map((n) => (
                    <option key={n} value={n}>
                      {n} minutos
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="helper">
              El asistente utiliza este intervalo diario para encontrar huecos. Puedes crear
              horarios habituales con actividades recurrentes desde el planificador.
            </p>
          </section>
          <section className="panel settings-panel">
            <PanelHeading title="Un toque personal" />
            <span className="field-label">Color de acento</span>
            <div className="accent-picker">
              {(['violet', 'blue'] as const).map((c, i) => (
                <button
                  type="button"
                  key={c}
                  aria-pressed={form.accent === c}
                  className={form.accent === c ? 'selected' : ''}
                  onClick={() => field('accent', c)}
                >
                  <i style={{ background: i ? '#8eafff' : '#b6a0f7' }} />
                  {i ? 'Azul sereno' : 'Violeta suave'}
                  {form.accent === c && <Check size={15} />}
                </button>
              ))}
            </div>
            <label className="toggle-label">
              <span>
                Vista compacta<small>Un poco más de información en el mismo espacio.</small>
              </span>
              <input
                type="checkbox"
                checked={form.compact}
                onChange={(e) => field('compact', e.target.checked)}
              />
            </label>
          </section>
          <section className="panel settings-panel">
            <PanelHeading title="Categorías y colores" />
            <div className="category-edit-list">
              {form.categories.map((c) => (
                <div key={c.id}>
                  <input
                    type="color"
                    aria-label={`Color de ${c.name}`}
                    value={c.color}
                    onChange={(e) =>
                      field(
                        'categories',
                        form.categories.map((x) =>
                          x.id === c.id ? { ...x, color: e.target.value } : x,
                        ),
                      )
                    }
                  />
                  <input
                    aria-label={`Nombre de categoría ${c.name}`}
                    required
                    maxLength={40}
                    value={c.name}
                    onChange={(e) =>
                      field(
                        'categories',
                        form.categories.map((x) =>
                          x.id === c.id ? { ...x, name: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </div>
              ))}
            </div>
            <div className="inline-input category-create">
              <input
                type="color"
                aria-label="Color de nueva categoría"
                value={categoryColor}
                onChange={(e) => setCategoryColor(e.target.value)}
              />
              <input
                aria-label="Nueva categoría"
                placeholder="Nueva categoría"
                maxLength={40}
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
              />
              <button
                type="button"
                className="icon-button"
                aria-label="Añadir categoría"
                onClick={() => {
                  if (newCategory.trim() && form.categories.length < 30) {
                    field('categories', [
                      ...form.categories,
                      { id: uid(), name: newCategory.trim(), color: categoryColor },
                    ]);
                    setNewCategory('');
                  }
                }}
              >
                <Plus size={18} />
              </button>
            </div>
            <p className="helper">
              Se conservan los identificadores de las categorías al cambiar nombres o colores.
            </p>
          </section>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="settings-save">
            <span>Los cambios se aplican al guardar.</span>
            <button className="primary-button" disabled={pending > 0}>
              Guardar preferencias
            </button>
          </div>
        </form>
        <aside className="settings-aside">
          <GoogleAccounts />
          <section className="panel storage-panel">
            <span className="storage-symbol">
              <ShieldCheck size={26} />
            </span>
            <h2>Tus datos, contigo.</h2>
            <p>
              Tus registros se guardan en IndexedDB, en este dispositivo y navegador. Si conectas
              Google, solo se intercambian los datos de los calendarios que autorices. Las tareas y
              hábitos permanecen locales.
            </p>
            <div className="storage-status">
              <span className="status-dot" />
              <div>
                <strong>Almacenamiento local</strong>
                <span>{estimate || 'IndexedDB conectado'}</span>
              </div>
              <Database size={18} />
            </div>
            <button
              className="secondary-button full-width"
              onClick={download}
              disabled={pending > 0}
            >
              <Download size={17} />
              Exportar copia JSON
            </button>
            <button
              className="secondary-button full-width"
              onClick={() => fileInput.current?.click()}
            >
              <Upload size={17} />
              Importar copia JSON
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              hidden
              aria-label="Archivo de copia de seguridad"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  if (file.size > 25 * 1024 * 1024)
                    throw new Error('La copia supera el límite de 25 MB.');
                  setBackup(parseBackup(await file.text()));
                  setImportMode('merge');
                } catch (e) {
                  notify(e instanceof Error ? e.message : 'No se ha podido leer la copia.');
                }
                if (fileInput.current) fileInput.current.value = '';
              }}
            />
            <p className="storage-warning">
              iOS puede eliminar el almacenamiento local por falta de espacio o inactividad.
              Instalar la PWA no garantiza conservarlo para siempre. Guarda copias periódicas fuera
              de este dispositivo.
            </p>
            <button
              className="text-button"
              onClick={async () => {
                if (!navigator.storage?.persist) {
                  notify(
                    'Este navegador no permite solicitar almacenamiento persistente. Conserva copias de seguridad.',
                  );
                  return;
                }
                const granted = await navigator.storage.persist();
                setPersistent(granted);
                notify(
                  granted
                    ? 'El navegador ha concedido almacenamiento persistente. Sigue conservando copias.'
                    : 'El navegador no ha concedido la solicitud. Las copias siguen siendo importantes.',
                );
              }}
            >
              <HardDrive size={15} />
              {persistent
                ? 'Protección concedida por el navegador'
                : 'Solicitar protección del almacenamiento'}
            </button>
          </section>
          <section className="panel settings-panel">
            <PanelHeading title="Tus recordatorios" />
            <Bell className="muted" size={23} />
            <p className="helper">
              Las comprobaciones locales funcionan con la aplicación abierta. No hay notificaciones
              push ni alarmas garantizadas al cerrar la PWA. En iPhone, las notificaciones requieren
              una PWA instalada y una versión compatible de iOS.
            </p>
            <button
              className="secondary-button full-width"
              disabled={permission === 'granted'}
              onClick={async () => {
                if (!('Notification' in window)) {
                  notify(
                    'Las notificaciones no están disponibles aquí. Instala DAYFLOW en la pantalla de inicio de iPhone.',
                  );
                  return;
                }
                try {
                  const p = await Notification.requestPermission();
                  setPermission(p);
                  notify(
                    p === 'granted'
                      ? 'Notificaciones activadas para los avisos compatibles.'
                      : 'Permiso no concedido. Puedes cambiarlo en los ajustes del sistema.',
                  );
                } catch {
                  notify('No se pudo solicitar el permiso en este navegador.');
                }
              }}
            >
              {permission === 'granted' ? 'Notificaciones permitidas' : 'Activar notificaciones'}
            </button>
          </section>
          <button className="install-card" onClick={install}>
            <Smartphone size={25} />
            <div>
              <strong>DAYFLOW, siempre a mano</strong>
              <span>Añadir a la pantalla de inicio</span>
            </div>
            <ChevronRight size={17} />
          </button>
          <p className="settings-version">
            DAYFLOW 1.0 · Hecha para tu día a día
            <br />
            Zona horaria: {Intl.DateTimeFormat().resolvedOptions().timeZone}
          </p>
        </aside>
      </div>
      {backup && (
        <Modal
          title="Recupera tu espacio"
          eyebrow="IMPORTAR COPIA DE SEGURIDAD"
          onClose={() => setBackup(null)}
        >
          <div className="plan-body">
            <p>Copia del {new Date(backup.exportedAt).toLocaleString('es-ES')}.</p>
            <div className="backup-summary">
              <span>
                <b>{backup.state.events.length}</b> actividades
              </span>
              <span>
                <b>{backup.state.tasks.length}</b> tareas
              </span>
              <span>
                <b>{backup.state.habits.length}</b> hábitos
              </span>
              <span>
                <b>{backup.state.sessions.length}</b> sesiones
              </span>
            </div>
            <label className="radio-choice">
              <input
                type="radio"
                name="importMode"
                checked={importMode === 'merge'}
                onChange={() => setImportMode('merge')}
              />
              <span>
                <strong>Combinar con mis datos</strong>
                <small>
                  Conserva tus preferencias. Para el mismo identificador se queda el registro
                  actualizado más recientemente. Puede recuperar registros eliminados desde la
                  copia.
                </small>
              </span>
            </label>
            <label className="radio-choice">
              <input
                type="radio"
                name="importMode"
                checked={importMode === 'replace'}
                onChange={() => setImportMode('replace')}
              />
              <span>
                <strong>Restaurar esta copia completa</strong>
                <small>
                  Reemplaza los registros y preferencias actuales. Exporta primero una copia de tus
                  datos actuales.
                </small>
              </span>
            </label>
            {importMode === 'replace' && (
              <button className="secondary-button" onClick={download}>
                <Download size={16} />
                Exportar datos actuales
              </button>
            )}
            <button
              className="primary-button full-width"
              disabled={pending > 0}
              onClick={async () => {
                const ok = await save((s) => {
                  if (importMode === 'merge') mergeBackup(s, backup.state);
                  else {
                    const revision = s.revision;
                    Object.assign(s, structuredClone(backup.state), {
                      revision,
                      focus: null,
                    } satisfies Partial<State>);
                  }
                }, 'Copia importada y guardada');
                if (ok) {
                  setBackup(null);
                  try {
                    setForm(structuredClone((await repository.read()).settings));
                  } catch {
                    notify('La importación se guardó. Recarga para ver las preferencias.');
                  }
                }
              }}
            >
              {pending
                ? 'Importando…'
                : importMode === 'merge'
                  ? 'Combinar y guardar'
                  : 'Confirmar restauración completa'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
