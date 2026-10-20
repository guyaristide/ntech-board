import type { AgendaItem, Epic, Session, Workshop } from './types';

/**
 * Programme construit dans l'outil : ateliers, séquences, ordre du jour, épiques. Les identifiants
 * sont attribués automatiquement (J10, J10.1, UC16) et ne changent plus ensuite.
 */

/** Ordre du programme : semaines dans l'ordre de leur première date, ateliers par date ; sans date à la fin. */
export function programmeOrder<T extends Pick<Workshop, 'phase' | 'date'>>(workshops: T[]): T[] {
  const first = new Map<string, string>();
  for (const w of workshops) {
    const d = w.date ?? '9999';
    if (!first.has(w.phase) || d < first.get(w.phase)!) first.set(w.phase, d);
  }
  const phaseIndex = new Map([...new Set(workshops.map(w => w.phase))].map((p, i) => [p, i]));
  return workshops
    .map((w, i) => ({ w, i }))
    .sort(
      (a, b) =>
        first.get(a.w.phase)!.localeCompare(first.get(b.w.phase)!) ||
        phaseIndex.get(a.w.phase)! - phaseIndex.get(b.w.phase)! ||
        (a.w.date ?? '9999').localeCompare(b.w.date ?? '9999') ||
        a.i - b.i,
    )
    .map(x => x.w);
}

/** Semaines (ou périodes) du programme, dans l'ordre. */
export const programmeWeeks = (workshops: Pick<Workshop, 'phase' | 'date'>[]) => [
  ...new Set(programmeOrder(workshops).map(w => w.phase)),
];

/** Prochain identifiant libre : préfixe et numéro (« J » → J10 ; « UC » sur deux chiffres → UC16). */
export function nextCode(ids: string[], prefix: string, width = 1) {
  const used = ids
    .map(id => id.match(new RegExp(`^${prefix}(\\d+)$`))?.[1])
    .filter((n): n is string => !!n)
    .map(Number);
  return `${prefix}${String((used.length ? Math.max(...used) : 0) + 1).padStart(width, '0')}`;
}

/** Code d'une nouvelle séquence : atelier, point, numéro (J10.3). */
export const nextSessionCode = (w: Pick<Workshop, 'id' | 'sessions'>) =>
  `${w.id}.${Math.max(0, ...w.sessions.map(s => Number(s.code.split('.').at(-1)) || 0)) + 1}`;

export const newWorkshop = (id: string, patch: Partial<Workshop> = {}): Workshop => ({
  id,
  title: '',
  phase: '',
  date: null,
  objectives: [],
  questionnaire: '',
  raci: [],
  risks: [],
  deliverable: '',
  pv: '',
  pvDue: null,
  deliverableDue: null,
  validationDue: null,
  pvStatus: 'À faire',
  prep: [],
  sessions: [],
  agenda: [],
  notes: [],
  comments: [],
  custom: true,
  ...patch,
});

export const newSession = (code: string, patch: Partial<Session> = {}): Session => ({
  code,
  atelier: '',
  start: null,
  end: null,
  allDay: false,
  title: '',
  content: '',
  owner: '',
  outcome: '',
  added: false,
  cdc: '',
  refs: [],
  steps: [],
  questions: [],
  notes: [],
  ...patch,
});

/** Ordre du jour affiché : celui de l'atelier, ou ses séquences dans l'ordre s'il n'en a pas. */
export const agendaItems = (w: Pick<Workshop, 'agenda' | 'sessions'>): AgendaItem[] =>
  w.agenda.length ? w.agenda : w.sessions.map(s => ({ kind: 'session', code: s.code }));

/** Forme compacte d'un identifiant d'épique (sans tiret ni casse) : celle des identifiants d'US. */
export const epicKey = (id: string) => id.replace(/-/g, '').toUpperCase();

export const newEpic = (id: string, patch: Partial<Epic> = {}): Epic => ({
  id,
  title: '',
  summary: '',
  workshops: [],
  version: 'MVP',
  source: '',
  toFrame: [],
  body: [],
  ...patch,
});

/** Préfixe des épiques, tiret compris : celui qui domine dans le projet (« EX- », « UC »), sinon « EP ». */
export function epicPrefix(epics: Pick<Epic, 'id'>[]) {
  const counts = new Map<string, number>();
  for (const e of epics) {
    const p = e.id.match(/^([A-Z]+-?)\d+$/)?.[1];
    if (p) counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'EP';
}
