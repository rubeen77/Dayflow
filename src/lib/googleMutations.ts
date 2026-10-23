import { googleEventSchema, type GoogleEvent, type GooglePending } from '../../shared/google';
import type { State } from './model';
import { GoogleApiError, googleApi } from './googleApi';
import { auditGoogle } from './googleEvents';

type Save = (change: (state: State) => void, message?: string) => Promise<boolean>;
export async function executeGoogleMutation(pending: GooglePending, save: Save) {
  // Commit a token-free recovery record BEFORE contacting Google.
  if (
    !(await save((s) => {
      if (
        pending.localEventId &&
        s.google.links.some(
          (l) => l.localEventId === pending.localEventId && l.date === pending.date,
        )
      )
        throw new Error(
          'Esta ocurrencia ya está vinculada a Google. Sincroniza para consultar su estado.',
        );
      if (
        pending.localEventId &&
        s.google.outbox.some(
          (p) =>
            p.id !== pending.id &&
            p.localEventId === pending.localEventId &&
            p.date === pending.date,
        )
      )
        throw new Error(
          'Ya existe una operación pendiente para esta actividad. Revísala en Ajustes.',
        );
      if (!s.google.outbox.some((p) => p.id === pending.id)) s.google.outbox.push(pending);
    }))
  )
    throw new Error('No se pudo guardar la operación pendiente. Google no ha sido modificado.');
  let response: { event?: GoogleEvent; deletedId?: string };
  try {
    response = await googleApi('events', pending.mutation);
  } catch (error) {
    if (error instanceof GoogleApiError && [400, 401, 403, 404, 410, 412].includes(error.status)) {
      // A known refusal has no remote write to recover. Unknown network outcomes stay pending.
      await save((s) => {
        s.google.outbox = s.google.outbox.filter((p) => p.id !== pending.id);
      });
    }
    throw error;
  }
  const event = response.event && googleEventSchema.parse(response.event);
  if (
    !(await save((s) => {
      if (event) {
        const index = s.googleEvents.findIndex((e) => e.id === event.id);
        if (index < 0) s.googleEvents.push(event);
        else if (s.googleEvents[index].updatedAt <= event.updatedAt) s.googleEvents[index] = event;
        if (
          pending.localEventId &&
          pending.date &&
          !s.google.links.some(
            (l) => l.localEventId === pending.localEventId && l.date === pending.date,
          )
        )
          s.google.links.push({
            localEventId: pending.localEventId,
            date: pending.date,
            googleId: event.id,
          });
      }
      if (response.deletedId) {
        s.googleEvents = s.googleEvents.filter((e) => e.id !== response.deletedId);
        // Keep personal originals, but suppress the transferred occurrence after an explicit deletion.
        for (const link of s.google.links.filter((l) => l.googleId === response.deletedId)) {
          const local = s.events.find((e) => e.id === link.localEventId);
          if (local && !local.exceptions.includes(link.date)) {
            local.exceptions.push(link.date);
            local.updatedAt = new Date().toISOString();
          }
        }
        s.google.links = s.google.links.filter((l) => l.googleId !== response.deletedId);
      }
      s.google.outbox = s.google.outbox.filter((p) => p.id !== pending.id);
      auditGoogle(
        s,
        pending.mutation.operation === 'delete' ? 'Eliminado en Google' : 'Guardado en Google',
        event?.title.slice(0, 200) ?? pending.mutation.eventId ?? 'Evento',
      );
    }, 'Cambio confirmado en Google y en la copia local'))
  )
    throw new Error(
      'Google ha confirmado el cambio, pero falló la copia local. Reintenta la operación pendiente en Ajustes para recuperar el resultado sin duplicarlo.',
    );
}
