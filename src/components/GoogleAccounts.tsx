import { useEffect, useState } from 'react';
import { CalendarDays, CloudOff, Link2, RefreshCw, ShieldCheck, Unplug } from 'lucide-react';
import {
  calendarSchema,
  snapshotSchema,
  type GoogleCalendar,
  type GooglePreferences,
  type GoogleSnapshot,
} from '../../shared/google';
import { googleApi } from '../lib/googleApi';
import { applyGoogleSnapshot, auditGoogle, previewGoogleSync } from '../lib/googleEvents';
import type { GoogleEvent } from '../../shared/google';
import { useDayflow } from '../state/DayflowContext';
import { useGoogle } from '../state/GoogleContext';
import { Modal, PanelHeading } from './ui';
import { GoogleWriteDialog } from './GoogleEvents';
import type { GooglePending } from '../../shared/google';

export function GoogleAccounts() {
  const { state, save, pending } = useDayflow();
  const { status, statusError, refreshStatus, connect } = useGoogle();
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
  const [preferences, setPreferences] = useState<GooglePreferences>({ selected: [], writable: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ snapshot: GoogleSnapshot; base: GoogleEvent[] } | null>(
    null,
  );
  const [disconnect, setDisconnect] = useState(false);
  const [setup, setSetup] = useState(false);
  const [writeConfirm, setWriteConfirm] = useState(false);
  const [recovery, setRecovery] = useState<GooglePending | null>(null);
  const [callback] = useState(() => new URLSearchParams(location.search).get('google'));
  useEffect(() => {
    if (new URLSearchParams(location.search).has('google')) {
      const url = new URL(location.href);
      url.searchParams.delete('google');
      history.replaceState(null, '', url);
    }
  }, []);
  useEffect(() => {
    if (!status?.connected) return;
    setPreferences(status.preferences ?? { selected: [], writable: [] });
    let cancelled = false;
    void googleApi<{ calendars: GoogleCalendar[] }>('calendars')
      .then((data) => {
        if (!cancelled) setCalendars(calendarSchema.array().parse(data.calendars));
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'No se pudieron cargar los calendarios.');
      });
    return () => {
      cancelled = true;
    };
  }, [status]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la operación.');
    } finally {
      setBusy(false);
    }
  };
  const summary = preview && previewGoogleSync({ googleEvents: preview.base }, preview.snapshot);
  return (
    <section className="panel google-panel">
      <PanelHeading title="Cuentas conectadas">
        <Link2 size={18} />
      </PanelHeading>
      <div className="google-account-heading">
        <span className="google-mark" aria-hidden="true">
          G
        </span>
        <div>
          <h3>Google Calendar</h3>
          <span className="muted small">
            {status?.connected ? 'Conectado · lectura protegida' : 'Tus planes, en un mismo lugar'}
          </span>
        </div>
      </div>
      <p className="helper">
        Elige qué calendarios consultar en Mi día y en el calendario. La copia sincronizada también
        estará disponible sin conexión.
      </p>
      {callback === 'connected' && (
        <p className="google-notice" role="status">
          Cuenta autorizada. Selecciona tus calendarios y revisa la primera sincronización.
        </p>
      )}
      {callback === 'error' && (
        <p className="form-error" role="alert">
          Google no completó la autorización. Puede haberse cancelado o caducado. Comprueba la
          configuración y vuelve a conectar.
        </p>
      )}
      {(error || statusError) && (
        <p className="form-error" role="alert">
          {error || statusError}
        </p>
      )}
      {!status?.connected ? (
        <>
          {status?.configured === false && (
            <p className="google-notice">
              <ShieldCheck size={16} />
              Pendiente de configuración del servidor. Todavía no hay ninguna cuenta conectada.
            </p>
          )}
          <button
            className="primary-button full-width"
            disabled={busy || pending > 0 || !status}
            onClick={() => (status?.configured ? void run(() => connect()) : setSetup(true))}
          >
            <Link2 size={17} />
            Conectar Google Calendar
          </button>
          {statusError && (
            <button className="text-button" onClick={() => void refreshStatus()}>
              Reintentar conexión con el servidor
            </button>
          )}
        </>
      ) : (
        <>
          <div className="google-calendar-list">
            {calendars.map((calendar) => (
              <div className="google-calendar-choice" key={calendar.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={preferences.selected.includes(calendar.id)}
                    onChange={(e) =>
                      setPreferences((p) => ({
                        selected: e.target.checked
                          ? [...p.selected, calendar.id]
                          : p.selected.filter((id) => id !== calendar.id),
                        writable: e.target.checked
                          ? p.writable
                          : p.writable.filter((id) => id !== calendar.id),
                      }))
                    }
                  />
                  <i style={{ background: calendar.color }} />
                  <span>
                    {calendar.summary}
                    <small>
                      {calendar.primary ? 'Principal · ' : ''}
                      {calendar.timeZone}
                      {['reader', 'freeBusyReader'].includes(calendar.accessRole)
                        ? ' · Solo lectura'
                        : ''}
                    </small>
                  </span>
                </label>
                {status.writeGranted &&
                  ['writer', 'owner'].includes(calendar.accessRole) &&
                  preferences.selected.includes(calendar.id) && (
                    <label className="google-write-choice">
                      <input
                        type="checkbox"
                        checked={preferences.writable.includes(calendar.id)}
                        onChange={(e) =>
                          setPreferences((p) => ({
                            ...p,
                            writable: e.target.checked
                              ? [...p.writable, calendar.id]
                              : p.writable.filter((id) => id !== calendar.id),
                          }))
                        }
                      />
                      Permitir cambios en Google
                    </label>
                  )}
              </div>
            ))}
          </div>
          <button
            className="primary-button full-width"
            disabled={busy || pending > 0 || !calendars.length}
            onClick={() =>
              void run(async () => {
                await googleApi('preferences', preferences);
                await refreshStatus();
                const snapshot = snapshotSchema.parse(await googleApi('sync', {}));
                setPreview({ snapshot, base: structuredClone(state.googleEvents) });
              })
            }
          >
            <RefreshCw size={16} className={busy ? 'spin' : ''} />
            {busy ? 'Consultando Google…' : 'Revisar sincronización'}
          </button>
          <p className="helper">
            Lectura completa desde hace 6 meses hasta dentro de 18 meses. Las retiradas de la copia
            local requieren confirmación.
          </p>
          {!status.writeGranted && (
            <button
              className="secondary-button full-width"
              disabled={busy || pending > 0}
              onClick={() => setWriteConfirm(true)}
            >
              Activar escritura bidireccional
            </button>
          )}
          <button className="text-button" disabled={busy} onClick={() => setDisconnect(true)}>
            <Unplug size={15} />
            Desconectar Google
          </button>
        </>
      )}
      {state.google.lastSync && (
        <p className="helper">
          <CloudOff size={14} /> Copia local:{' '}
          {new Date(state.google.lastSync).toLocaleString('es-ES')}
        </p>
      )}
      {!!state.google.outbox.length && (
        <div className="google-notice">
          <div>
            <strong>Operaciones pendientes de comprobar</strong>
            <p className="helper">
              Una solicitud puede haber llegado a Google aunque no se recibiera la respuesta.
              Reinténtala para recuperar el resultado con el mismo identificador.
            </p>
            {state.google.outbox.map((item) => (
              <button className="text-button" key={item.id} onClick={() => setRecovery(item)}>
                Revisar: {item.mutation.draft?.title ?? 'Eliminación de evento'}
              </button>
            ))}
          </div>
        </div>
      )}
      {!!state.google.audit.length && (
        <details className="google-audit">
          <summary>Actividad de sincronización</summary>
          {state.google.audit
            .slice(-8)
            .reverse()
            .map((record) => (
              <p key={record.id}>
                <strong>{record.action}</strong>
                <small>
                  {new Date(record.at).toLocaleString('es-ES')} · {record.detail}
                </small>
              </p>
            ))}
        </details>
      )}
      {setup && (
        <Modal
          title="Preparar Google Calendar"
          eyebrow="CONFIGURACIÓN NECESARIA"
          onClose={() => setSetup(false)}
        >
          <div className="detail-body">
            <p>
              El código de conexión está preparado, pero necesita credenciales reales en el
              servidor. No se puede iniciar sesión todavía.
            </p>
            <p>
              Configura OAuth de Google, un almacén privado de tokens y las variables de entorno
              siguiendo la guía incluida en el proyecto.
            </p>
            <p className="helper">Variables pendientes: {status?.missing?.join(', ')}</p>
            <p className="helper">
              Las instrucciones completas están en la documentación de integración de Google
              Calendar del proyecto.
            </p>
            <button className="primary-button" onClick={() => setSetup(false)}>
              Entendido
            </button>
          </div>
        </Modal>
      )}
      {preview && summary && (
        <Modal
          title="Revisa tus eventos"
          eyebrow="SINCRONIZACIÓN DE GOOGLE"
          onClose={() => !busy && setPreview(null)}
        >
          <div className="detail-body">
            <div className="google-sync-counts">
              <span>
                <b>{summary.added.length}</b>Nuevos
              </span>
              <span>
                <b>{summary.changed.length}</b>Actualizados
              </span>
              <span>
                <b>{summary.removed.length}</b>Retirados
              </span>
            </div>
            <p>
              Se actualizará exclusivamente la copia de Google. Tus actividades, tareas y hábitos de
              DAYFLOW se conservan. Los calendarios desmarcados se ocultarán, conservando su copia.
            </p>
            <p className="helper">
              {preview.snapshot.from.slice(0, 10)} — {preview.snapshot.to.slice(0, 10)} ·{' '}
              {preview.snapshot.events.length} eventos leídos. Fuera de este período se conserva lo
              guardado anteriormente.
            </p>
            <div className="google-review-list">
              {[
                ...summary.added.map((e) => ({ e, label: 'Nuevo' })),
                ...summary.changed.map((e) => ({ e, label: 'Actualizar' })),
                ...summary.removed.map((e) => ({ e, label: 'Retirar copia' })),
              ].map(({ e, label }) => (
                <p key={e.id}>
                  <CalendarDays size={16} />
                  <span>
                    <strong>{e.title}</strong>
                    <small>
                      {label} · {e.calendarName} ·{' '}
                      {(e.start.date ?? e.start.dateTime)?.slice(0, 10)}
                    </small>
                  </span>
                </p>
              ))}
            </div>
            <p className="helper">
              Los cambios de Google no se aplicarán hasta que confirmes. Las instancias recurrentes
              conservan sus identificadores originales.
            </p>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="form-footer">
              <button className="secondary-button" disabled={busy} onClick={() => setPreview(null)}>
                Cancelar
              </button>
              <button
                className="primary-button"
                disabled={busy || pending > 0}
                onClick={() =>
                  void run(async () => {
                    if (
                      await save(
                        (s) => applyGoogleSnapshot(s, preview.snapshot, preview.base),
                        'Copia de Google guardada',
                      )
                    )
                      setPreview(null);
                    else
                      throw new Error(
                        'No se ha podido guardar la copia local. No se han confirmado los cambios. Mantén esta vista y vuelve a intentarlo.',
                      );
                  })
                }
              >
                Confirmar sincronización
              </button>
            </div>
          </div>
        </Modal>
      )}
      {writeConfirm && (
        <Modal
          title="Autorizar cambios en Google"
          eyebrow="OPCIONAL"
          onClose={() => !busy && setWriteConfirm(false)}
        >
          <div className="detail-body">
            <p>
              Google solicitará permiso para crear, editar y eliminar eventos. Después tendrás que
              habilitar la escritura en cada calendario que elijas.
            </p>
            <p>
              Cada cambio desde DAYFLOW mostrará una confirmación. Tus actividades locales seguirán
              siendo locales hasta que las envíes expresamente.
            </p>
            <div className="form-footer">
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => setWriteConfirm(false)}
              >
                Cancelar
              </button>
              <button
                className="primary-button"
                disabled={busy || pending > 0}
                onClick={() => void run(() => connect(true))}
              >
                Continuar con Google
              </button>
            </div>
          </div>
        </Modal>
      )}
      {disconnect && (
        <Modal
          title="Desconectar Google Calendar"
          eyebrow="TÚ TIENES EL CONTROL"
          onClose={() => !busy && setDisconnect(false)}
        >
          <div className="detail-body">
            <p>
              Se revocará el acceso de DAYFLOW a Google y se eliminarán los tokens del servidor. Tu
              copia local de eventos seguirá disponible; tus datos personales de DAYFLOW se
              conservan.
            </p>
            <p className="helper">No se eliminará ningún evento en Google Calendar.</p>
            <div className="form-footer">
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => setDisconnect(false)}
              >
                Cancelar
              </button>
              <button
                className="primary-button"
                disabled={busy || pending > 0}
                onClick={() =>
                  void run(async () => {
                    await googleApi('disconnect', { confirmed: true });
                    await save(
                      (s) =>
                        auditGoogle(
                          s,
                          'Cuenta desconectada',
                          'Acceso revocado. Copia local conservada.',
                        ),
                      'Google desconectado',
                    );
                    await refreshStatus();
                    setDisconnect(false);
                  })
                }
              >
                Confirmar desconexión
              </button>
            </div>
          </div>
        </Modal>
      )}
      {recovery && (
        <GoogleWriteDialog
          recovery={recovery}
          operation={recovery.mutation.operation}
          onClose={() => setRecovery(null)}
        />
      )}
    </section>
  );
}
