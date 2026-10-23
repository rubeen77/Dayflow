import { useState } from 'react';
import { Cloud, ExternalLink, Pencil, Trash2 } from 'lucide-react';
import {
  draftSchema,
  type GoogleDraft,
  type GoogleEvent,
  type GooglePending,
} from '../../shared/google';
import type { Occurrence } from '../lib/model';
import { addDays, durationLabel } from '../lib/dates';
import { googleDuration, zonedParts } from '../lib/googleEvents';
import { executeGoogleMutation } from '../lib/googleMutations';
import { useDayflow } from '../state/DayflowContext';
import { useGoogle } from '../state/GoogleContext';
import { Modal } from './ui';

export function GoogleBadge({ name }: { name?: string }) {
  return (
    <span className="google-badge">
      <Cloud size={12} />
      Google{name ? ` · ${name}` : ''}
    </span>
  );
}
export function GoogleEventDetail({ event, onClose }: { event: GoogleEvent; onClose: () => void }) {
  const { status } = useGoogle();
  const [mode, setMode] = useState<'update' | 'delete' | null>(null);
  const canWrite =
    event.editable &&
    status?.connected &&
    status.accountId === event.accountId &&
    status.preferences?.writable.includes(event.calendarId);
  if (mode) return <GoogleWriteDialog event={event} operation={mode} onClose={onClose} />;
  const timeZone = event.start.timeZone ?? 'UTC';
  const start =
    event.start.date ??
    `${zonedParts(event.start.dateTime!).date} · ${zonedParts(event.start.dateTime!).time}`;
  const end =
    event.end.date ??
    `${zonedParts(event.end.dateTime!).date} · ${zonedParts(event.end.dateTime!).time}`;
  return (
    <Modal title={event.title} eyebrow="GOOGLE CALENDAR" onClose={onClose}>
      <div className="detail-body">
        <GoogleBadge name={event.calendarName} />
        <p>
          {start} → {end}
          {event.start.date ? ' · Fin exclusivo' : ''}
        </p>
        {!event.start.date && (
          <p className="helper">
            Duración real: {durationLabel(googleDuration(event))}. Inicio original:{' '}
            {event.start.dateTime}; fin original: {event.end.dateTime}.
          </p>
        )}
        <p className="helper">
          {event.start.date
            ? 'Evento de día completo'
            : `Horas mostradas en ${Intl.DateTimeFormat().resolvedOptions().timeZone}. Zona original: ${timeZone}.`}
        </p>
        {event.recurringEventId && (
          <p className="google-notice">
            Actividad recurrente. Los cambios afectarán únicamente a esta ocurrencia.
          </p>
        )}
        {event.location && <p>{event.location}</p>}
        {event.description && <p className="preserve-lines">{event.description}</p>}
        <p className="helper">
          {status?.connected
            ? 'Copia local sincronizada. Para actualizarla, revisa la sincronización en Ajustes.'
            : 'Copia local sin conexión a Google. Se conserva en este dispositivo.'}
        </p>
        {!canWrite && (
          <p className="helper">
            Solo lectura. Puedes autorizar la escritura y habilitar este calendario en Cuentas
            conectadas.
          </p>
        )}
        <div className="form-footer">
          {canWrite && (
            <>
              <button className="secondary-button" onClick={() => setMode('delete')}>
                <Trash2 size={16} />
                Eliminar en Google
              </button>
              <button className="primary-button" onClick={() => setMode('update')}>
                <Pencil size={16} />
                Editar en Google
              </button>
            </>
          )}
          {event.htmlLink?.startsWith('https://www.google.com/calendar/') ||
          event.htmlLink?.startsWith('https://calendar.google.com/') ? (
            <a className="text-button" href={event.htmlLink} target="_blank" rel="noreferrer">
              <ExternalLink size={15} />
              Abrir en Google
            </a>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
function originalDraft(event?: GoogleEvent, local?: Occurrence): GoogleDraft {
  if (event)
    return {
      title: event.title,
      description: event.description,
      location: event.location,
      start: event.start,
      end: event.end,
    };
  const timeZone = local?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  return {
    title: local!.title,
    description: local!.notes,
    location: local!.location,
    start: local!.allDay
      ? { date: local!.occurrenceDate }
      : { dateTime: `${local!.occurrenceDate}T${local!.start}:00`, timeZone },
    end: local!.allDay
      ? { date: addDays(local!.occurrenceDate, 1) }
      : { dateTime: `${local!.occurrenceDate}T${local!.end}:00`, timeZone },
  };
}
export function GoogleWriteDialog({
  event,
  local,
  operation,
  recovery: explicitRecovery,
  onClose,
}: {
  event?: GoogleEvent;
  local?: Occurrence;
  operation: 'create' | 'update' | 'delete';
  recovery?: GooglePending;
  onClose: () => void;
}) {
  const { state, save, pending: saving } = useDayflow();
  const recovery =
    explicitRecovery ??
    (local &&
      state.google.outbox.find(
        (p) => p.localEventId === local.id && p.date === local.occurrenceDate,
      ));
  const { status } = useGoogle();
  const choices = status?.preferences?.writable ?? [];
  const [calendarId, setCalendar] = useState(
    recovery?.mutation.calendarId ?? event?.calendarId ?? choices[0] ?? '',
  );
  const [draft, setDraft] = useState<GoogleDraft>(
    () =>
      recovery?.mutation.draft ??
      (operation === 'delete'
        ? {
            title: event?.title ?? 'Evento',
            description: '',
            location: '',
            start: event?.start ?? { date: '2000-01-01' },
            end: event?.end ?? { date: '2000-01-02' },
          }
        : originalDraft(event, local)),
  );
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [operationId] = useState(() => recovery?.id ?? crypto.randomUUID());
  const [locked, setLocked] = useState(!!recovery);
  const allDay = !!draft.start.date;
  const zone = draft.start.timeZone || 'UTC';
  const value = (boundary: GoogleDraft['start']) =>
    boundary.date ??
    (/[zZ]|[+-]\d\d:\d\d$/.test(boundary.dateTime!)
      ? `${zonedParts(boundary.dateTime!, zone).date}T${zonedParts(boundary.dateTime!, zone).time}`
      : boundary.dateTime!.slice(0, 16));
  const setBoundary = (key: 'start' | 'end', input: string) =>
    setDraft((d) => ({
      ...d,
      [key]: allDay ? { date: input } : { dateTime: `${input}:00`, timeZone: zone },
    }));
  const canWrite =
    status?.connected &&
    status.writeGranted &&
    choices.includes(calendarId) &&
    (!recovery || recovery.mutation.accountId === status.accountId);
  return (
    <Modal
      title={
        operation === 'delete'
          ? 'Eliminar evento en Google'
          : operation === 'create'
            ? 'Enviar a Google Calendar'
            : 'Editar evento de Google'
      }
      eyebrow={recovery ? 'RECUPERAR OPERACIÓN PENDIENTE' : 'REVISA ANTES DE CONFIRMAR'}
      onClose={() => !busy && onClose()}
    >
      <form
        className="editor-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            if (!confirmed || !canWrite)
              throw new Error('Confirma el cambio y habilita la escritura para este calendario.');
            let parsed = draft;
            if (operation !== 'delete') {
              const validation = draftSchema.safeParse(draft);
              if (!validation.success) throw new Error(validation.error.issues[0].message);
              parsed = validation.data;
              const from = value(parsed.start);
              const to = value(parsed.end);
              const hasOffset = (v?: string) => !!v && /(?:Z|[+-]\d\d:\d\d)$/.test(v);
              const validOrder =
                hasOffset(parsed.start.dateTime) && hasOffset(parsed.end.dateTime)
                  ? Date.parse(parsed.end.dateTime!) > Date.parse(parsed.start.dateTime!)
                  : to > from;
              if (!from || !to || !validOrder)
                throw new Error('El final debe ser posterior al inicio.');
            }
            const queued = recovery ??
              state.google.outbox.find((p) => p.id === operationId) ?? {
                id: operationId,
                localEventId: local?.id,
                date: local?.occurrenceDate,
                mutation: {
                  accountId: status!.accountId!,
                  operationId,
                  operation,
                  calendarId,
                  eventId: event?.eventId,
                  etag: event?.etag,
                  ...(operation === 'delete' ? {} : { draft: parsed }),
                  confirmed: true as const,
                },
              };
            setLocked(true);
            await executeGoogleMutation(queued, save);
            onClose();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'No se pudo guardar en Google.');
          } finally {
            setBusy(false);
          }
        }}
      >
        {operation === 'create' && (
          <>
            <label>
              Calendario de destino
              <select
                value={calendarId}
                disabled={locked}
                onChange={(e) => setCalendar(e.target.value)}
              >
                {choices.map((id) => (
                  <option key={id} value={id}>
                    {state.googleEvents.find((g) => g.calendarId === id)?.calendarName ?? id}
                  </option>
                ))}
              </select>
            </label>
            <p className="helper">
              Se enviará solo esta ocurrencia. El original se conserva en DAYFLOW como respaldo y no
              se mostrará por duplicado mientras esté vinculado a la copia de Google.
            </p>
          </>
        )}
        {operation !== 'delete' ? (
          <>
            <label>
              Título
              <input
                required
                maxLength={1024}
                disabled={locked}
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              />
            </label>
            <div className="form-row">
              <label>
                {allDay ? 'Primer día' : 'Inicio'}
                <input
                  type={allDay ? 'date' : 'datetime-local'}
                  required
                  disabled={locked}
                  value={value(draft.start)}
                  onChange={(e) => setBoundary('start', e.target.value)}
                />
              </label>
              <label>
                {allDay ? 'Fin (día excluido)' : 'Fin'}
                <input
                  type={allDay ? 'date' : 'datetime-local'}
                  required
                  disabled={locked}
                  value={value(draft.end)}
                  onChange={(e) => setBoundary('end', e.target.value)}
                />
              </label>
            </div>
            <p className="helper">
              {allDay
                ? 'La fecha de fin no forma parte del evento.'
                : `Horario del evento en ${zone}. Google conserva su zona horaria y aplica los cambios de horario.`}
            </p>
            <label>
              Lugar
              <input
                disabled={locked}
                maxLength={2000}
                value={draft.location}
                onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))}
              />
            </label>
            <label>
              Notas
              <textarea
                disabled={locked}
                maxLength={20000}
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              />
            </label>
          </>
        ) : (
          <p>
            Se eliminará «{draft.title}» de Google Calendar y de su copia sincronizada en DAYFLOW.{' '}
            {event?.recurringEventId
              ? 'Se elimina únicamente esta ocurrencia, conservando el resto de la serie.'
              : ''}
          </p>
        )}
        {event?.recurringEventId && operation !== 'delete' && (
          <p className="google-notice">Solo se modificará esta ocurrencia de la serie.</p>
        )}
        <label className="check-label">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          Confirmo {operation === 'delete' ? 'la eliminación' : 'estos cambios'} en Google. Si hay
          invitados, Google puede notificarles.
        </label>
        {!canWrite && (
          <p className="helper">
            Activa la escritura para este calendario en Ajustes. Necesitas conexión para aplicar
            cambios.
          </p>
        )}
        {locked && !busy && (
          <p className="helper">
            La solicitud conserva sus datos e identificador para poder reintentarse sin duplicados.
            Puedes revisar las operaciones pendientes en Ajustes.
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-footer">
          <button type="button" className="secondary-button" disabled={busy} onClick={onClose}>
            Cerrar
          </button>
          <button
            className="primary-button"
            disabled={busy || saving > 0 || !confirmed || !canWrite}
          >
            {busy
              ? 'Guardando…'
              : operation === 'delete'
                ? 'Confirmar eliminación'
                : 'Confirmar y guardar en Google'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
