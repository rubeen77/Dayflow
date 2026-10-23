import type { GoogleDraft } from '../../shared/google.js';
import { HttpError } from './config.js';

function boundaryInstant(boundary: GoogleDraft['start']) {
  if (boundary.date) return Date.parse(`${boundary.date}T00:00:00Z`);
  const value = boundary.dateTime!;
  if (/(?:Z|[+-]\d\d:\d\d)$/.test(value)) return Date.parse(value);
  if (!boundary.timeZone)
    throw new HttpError(400, 'Una hora sin desplazamiento necesita una zona horaria.');
  const nominal = Date.parse(`${value}Z`);
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: boundary.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const wall = (instant: number) => formatter.format(new Date(instant)).replace(' ', 'T');
  const offsets = new Set<number>();
  for (const hours of [-36, -12, 0, 12, 36]) {
    const instant = nominal + hours * 3600000;
    offsets.add(Date.parse(`${wall(instant)}Z`) - instant);
  }
  const candidates = [...offsets]
    .map((offset) => nominal - offset)
    .filter((instant) => wall(instant) === value.slice(0, 19));
  if (candidates.length !== 1)
    throw new HttpError(
      400,
      candidates.length
        ? 'Esta hora se repite por el cambio de horario. Edita esa ocurrencia en Google Calendar para elegir el desplazamiento exacto.'
        : 'Esta hora no existe por el cambio de horario. Elige otra hora.',
    );
  return candidates[0];
}
export function validateGoogleInterval(draft: GoogleDraft) {
  const start = boundaryInstant(draft.start);
  const end = boundaryInstant(draft.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    throw new HttpError(400, 'El final del evento debe ser posterior al inicio.');
}
