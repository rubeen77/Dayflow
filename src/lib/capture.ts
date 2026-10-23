import { addDays, dateKey, localDate, minutes, timeOf } from './dates';
import { dateSchema, timeSchema, type Activity, type Settings } from './model';

export interface CaptureDraft {
  title: string;
  date: string | null;
  time: string | null;
  duration: number;
  recurrence: Activity['recurrence'];
  weekdays?: number[];
  categoryId: string;
  kind: 'task' | 'event';
  warnings: string[];
}
const names = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
export function parseCapture(input: string, settings: Settings, now = new Date()): CaptureDraft {
  const source = input.normalize('NFC').trim();
  const normalized = normalize(source);
  const spans: [number, number][] = [];
  const result: CaptureDraft = {
    title: source,
    date: null,
    time: null,
    duration: 30,
    recurrence: 'none',
    categoryId: settings.categories[0].id,
    kind: /^(gimnasio|clase|reunion|cita|entrenamiento)\b/.test(normalized) ? 'event' : 'task',
    warnings: [],
  };
  const remove = (match: RegExpMatchArray) => {
    if (match.index !== undefined) spans.push([match.index, match.index + match[0].length]);
  };
  const relative = normalized.match(/\b(pasado manana|manana|hoy)\b/);
  if (relative) {
    result.date = addDays(
      dateKey(now),
      relative[1] === 'hoy' ? 0 : relative[1] === 'manana' ? 1 : 2,
    );
    remove(relative);
  }
  const iso = normalized.match(/\b\d{4}-\d{2}-\d{2}\b/);
  const numeric = normalized.match(/\b(?:el\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/);
  if (iso || numeric) {
    const match = (iso ?? numeric)!;
    const date = iso
      ? iso[0]
      : `${numeric![3] ?? now.getFullYear()}-${numeric![2].padStart(2, '0')}-${numeric![1].padStart(2, '0')}`;
    if (dateSchema.safeParse(date).success) {
      if (result.date && result.date !== date)
        result.warnings.push('Has indicado más de una fecha. Revisa la fecha elegida.');
      result.date = date;
      remove(match);
    } else result.warnings.push('La fecha escrita no es válida. Corrígela antes de guardar.');
  }
  const weekdays = normalized.match(
    /\b(?:(?:el|los|cada)\s+)?(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)(?:\s*(?:,|y)\s*(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo))*/,
  );
  if (weekdays) {
    const days = [
      ...new Set(
        (weekdays[0].match(/lunes|martes|miercoles|jueves|viernes|sabado|domingo/g) ?? []).map(
          (n) => names.indexOf(n),
        ),
      ),
    ];
    if (!result.date) {
      const offset = Math.min(...days.map((d) => (d - now.getDay() + 7) % 7));
      result.date = addDays(dateKey(now), offset);
    }
    const recurring =
      days.length > 1 || /\b(cada|los|semanal|todas las semanas)\b/.test(normalized);
    if (recurring) {
      result.recurrence = days.length > 1 ? 'custom' : 'weekly';
      result.weekdays = days;
    }
    remove(weekdays);
  }
  const daily = normalized.match(/\b(cada dia|todos los dias|diariamente|de lunes a viernes)\b/);
  if (daily) {
    result.recurrence = daily[1] === 'de lunes a viernes' ? 'weekdays' : 'daily';
    result.date ??= dateKey(now);
    remove(daily);
  }
  const time = normalized.match(
    /\b(?:a\s+las?\s+)?(\d{1,2}):(\d{2})\b|\ba\s+las?\s+(\d{1,2})(?:\s*h)?\b/,
  );
  if (time) {
    const value = `${(time[1] ?? time[3]).padStart(2, '0')}:${time[2] ?? '00'}`;
    if (timeSchema.safeParse(value).success) {
      result.time = value;
      result.date ??= dateKey(now);
      remove(time);
    } else
      result.warnings.push('La hora escrita no es válida. Elige una hora entre 00:00 y 23:59.');
  }
  const duration = normalized.match(/\b(?:durante\s+|por\s+)(\d{1,3})\s*(minutos?|min|horas?|h)\b/);
  if (duration) {
    const value = Number(duration[1]) * (/^(h|hora)/.test(duration[2]) ? 60 : 1);
    if (value >= 5 && value <= 720) {
      result.duration = value;
      remove(duration);
    } else result.warnings.push('La duración debe estar entre 5 y 720 minutos.');
  }
  if (result.kind === 'event' && !duration) result.duration = settings.defaultDuration;
  if (/\b(estudiar|estudio|programacion|examen|practica|clase)\b/.test(normalized))
    result.categoryId = settings.categories.find((c) => c.id === 'study')?.id ?? result.categoryId;
  if (/\b(gimnasio|entrenamiento|correr|yoga)\b/.test(normalized))
    result.categoryId = settings.categories.find((c) => c.id === 'health')?.id ?? result.categoryId;
  let title = source;
  const merged: [number, number][] = [];
  for (const span of spans.sort((a, b) => a[0] - b[0])) {
    const last = merged.at(-1);
    if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
    else merged.push([...span]);
  }
  for (const [from, to] of merged.reverse()) title = title.slice(0, from) + title.slice(to);
  result.title = title
    .replace(/\s+/g, ' ')
    .replace(/\b(cada|el|los)\s*$/i, '')
    .trim()
    .replace(/[,.]$/, '')
    .trim();
  if (!result.title) result.warnings.push('Añade un nombre para tu actividad o tarea.');
  if (!result.date)
    result.warnings.push('No he identificado una fecha: quedará en la bandeja de entrada.');
  if (result.time && minutes(result.time) + result.duration > 1439)
    result.warnings.push(
      `La duración termina fuera del día (${timeOf(minutes(result.time) + result.duration)}). Ajusta la hora o la duración.`,
    );
  if (result.date && result.date < dateKey(now))
    result.warnings.push('La fecha está en el pasado. Revisa si es la que querías.');
  return result;
}
export const captureDays = (date: string | null, weekdays?: number[]) =>
  weekdays ?? [localDate(date ?? dateKey()).getDay()];
