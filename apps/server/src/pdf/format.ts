import type { AgendaItem, Session, Workshop } from '@board/shared';

/** Outils communs aux documents PDF : dates en français, semaines du programme, ordre du jour. */

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const at = (iso: string) => new Date(`${iso}T12:00:00Z`);
const fr = (iso: string, o: Intl.DateTimeFormatOptions) =>
  at(iso).toLocaleDateString('fr-FR', { timeZone: 'UTC', ...o });

/** « mardi 13 octobre » */
export const dayLabel = (iso: string | null) =>
  iso ? fr(iso, { weekday: 'long', day: 'numeric', month: 'long' }) : 'Date à fixer';

/** « mer. 14/10 » */
export const shortDate = (iso: string | null) =>
  iso ? `${fr(iso, { weekday: 'short' })} ${fr(iso, { day: '2-digit', month: '2-digit' })}` : '—';

/** « 12 octobre 2026 » */
export const today = () =>
  new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

/** « 09:30 » devient « 9 h 30 ». */
export const hour = (t: string | null) => (t ? t.replace(/^0/, '').replace(':', ' h ') : '');

export const slot = (x: { start: string | null; end: string | null; allDay?: boolean }) =>
  x.allDay ? 'Journée' : [hour(x.start), hour(x.end)].filter(Boolean).join(' – ');

/** Semaines du programme : les ateliers regroupés par libellé de période, dans l'ordre du planning. */
export const weeksOf = (workshops: Workshop[]) => [...new Set(workshops.map(w => w.phase))];

/**
 * Libellé de période du planning (« SEMAINE 1 · du mardi 13 au vendredi 16 octobre · avec le
 * Ministère, en salle de réunion d'hôtel ») : titre, dates (complétées de l'année) et modalités.
 */
export function describeWeek(phase: string, workshops: Workshop[]) {
  const [name = phase, dates = '', ...rest] = phase.split(' · ');
  const year = workshops.find(w => w.date)?.date?.slice(0, 4);
  const title = capitalize(name.toLowerCase());
  const period = dates && year && !/\d{4}/.test(dates) ? `${dates} ${year}` : dates;
  return { title, period, details: rest.join(' · '), label: [title, period].filter(Boolean).join(' · ') };
}

/** Ordre du jour d'une journée : séquences et pauses, dans l'ordre de l'agenda. */
export type Slot = { kind: 'session'; s: Session } | Extract<AgendaItem, { kind: 'break' }>;
export function agendaOf(w: Workshop): Slot[] {
  const by = new Map(w.sessions.map(s => [s.code, s]));
  const items: AgendaItem[] = w.agenda.length
    ? w.agenda
    : w.sessions.map(s => ({ kind: 'session', code: s.code }));
  return items.flatMap((it): Slot[] => {
    if (it.kind === 'break') return [it];
    const s = by.get(it.code);
    return s ? [{ kind: 'session', s }] : [];
  });
}

/** Amplitude horaire des journées de la semaine (« 9 h 00 à 17 h 00 »). */
export function hours(workshops: Workshop[]) {
  const times = workshops.flatMap(w => w.sessions.filter(s => !s.allDay));
  const starts = times
    .map(s => s.start)
    .filter((t): t is string => !!t)
    .sort();
  const ends = times
    .map(s => s.end)
    .filter((t): t is string => !!t)
    .sort();
  return starts.length && ends.length ? `${hour(starts[0])} à ${hour(ends.at(-1)!)}` : '';
}

/** Nom de fichier sans accents ni espaces : « Planning_ateliers_semaine-1.pdf ». */
export const fileName = (...parts: string[]) =>
  parts
    .join('_')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-') + '.pdf';
