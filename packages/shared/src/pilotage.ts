import { isDone, load, type Release, type Sprint, type Ticket } from './delivery';
import { diligenceOpen, riskLevel, riskScore } from './options';
import { partyIndex, splitMention, type Party, type ProjectSettings } from './parties';
import type { Diligence, Risk, Story } from './types';

/**
 * Pilotage : burndown, vélocité, prévisions et avancement par version, UC et plateforme. Mêmes
 * calculs pour l'écran et le rapport COPIL.
 */

/** Relevé quotidien d'un sprint : estimation et nombre de tickets, au total et terminés. */
export interface SprintDay {
  day: string;
  total: number;
  done: number;
  count: number;
  doneCount: number;
}

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const at = (s: string) => new Date(`${s}T12:00:00Z`);
const today = () => iso(new Date());

/** Jours ouvrés (lundi à vendredi) d'une période, bornes comprises. */
export function workdays(start: string, end: string) {
  const out: string[] = [];
  for (let d = at(start); iso(d) <= end; d = new Date(d.getTime() + DAY))
    if (d.getUTCDay() % 6) out.push(iso(d));
  return out;
}

/** Sans estimation au projet, l'avancement se compte en tickets. */
export const byCount = (settings: ProjectSettings) => settings.delivery.estimation === 'none';

export interface BurndownPoint {
  day: string;
  /** Reste à faire ce jour-là (null : jour à venir, ou avant le premier relevé). */
  remaining: number | null;
  /** Périmètre du sprint ce jour-là : monte quand un ticket est ajouté en cours de sprint. */
  scope: number | null;
  /** Droite idéale : du périmètre de départ à zéro le dernier jour. */
  ideal: number;
}

/**
 * Burndown d'un sprint, un point par jour ouvré. Un jour sans relevé reprend le dernier relevé
 * connu (rien n'a bougé ce jour-là) ; un jour à venir reste vide.
 */
export function burndown(settings: ProjectSettings, sprint: Sprint, days: SprintDay[], now = today()) {
  if (!sprint.start || !sprint.end || sprint.end < sprint.start) return null;
  const count = byCount(settings);
  const sorted = [...days].sort((a, b) => a.day.localeCompare(b.day));
  const value = (d: SprintDay) => ({
    scope: count ? d.count : d.total,
    remaining: count ? d.count - d.doneCount : d.total - d.done,
  });
  const axis = workdays(sprint.start, sprint.end);
  if (!axis.length) return null;
  // Un relevé du week-end ou d'avant le début compte pour le jour ouvré suivant.
  const first = sorted.find(d => d.day <= axis[0])
    ? [...sorted].reverse().find(d => d.day <= axis[0])
    : sorted[0];
  const start = first ? value(first).scope : 0;
  let i = 0;
  let last: SprintDay | undefined;
  const points: BurndownPoint[] = axis.map((day, n) => {
    while (i < sorted.length && sorted[i].day <= day) last = sorted[i++];
    const known = day <= now && last;
    return {
      day,
      remaining: known ? value(last!).remaining : null,
      scope: known ? value(last!).scope : null,
      ideal: axis.length > 1 ? start * (1 - n / (axis.length - 1)) : 0,
    };
  });
  return { points, start, max: Math.max(start, ...points.map(p => p.scope ?? 0), 1) };
}

/** Livré par un sprint clos : estimation terminée, ou nombre de tickets terminés (`count`). */
export const delivered = (s: Sprint, count = false) => (count ? (s.delivered ?? null) : s.velocity);

/** Vélocité : livré par les sprints clos, et moyenne des trois derniers. */
export function velocity(sprints: Sprint[], count = false) {
  const closed = sprints
    .filter(s => s.status === 'closed' && delivered(s, count) !== null)
    .sort((a, b) => (a.end ?? a.closedAt ?? '').localeCompare(b.end ?? b.closedAt ?? ''));
  const recent = closed.slice(-3);
  const average = recent.length
    ? recent.reduce((n, s) => n + (delivered(s, count) ?? 0), 0) / recent.length
    : null;
  return { closed, average };
}

/** Tickets d'une version, et leur avancement en estimation et en nombre. */
export function releaseProgress(settings: ProjectSettings, release: Release, tickets: Ticket[]) {
  const list = tickets.filter(t => t.release === release.id);
  const done = list.filter(t => isDone(settings, t));
  return {
    tickets: list,
    count: list.length,
    doneCount: done.length,
    total: load(list).total,
    done: load(done).total,
    unestimated: list.filter(t => t.estimate === null && !isDone(settings, t)).length,
  };
}

/**
 * Prévision de fin d'une version : le reste à faire divisé par la vélocité moyenne donne un nombre
 * de sprints, comptés à partir de la fin du sprint en cours (ou d'aujourd'hui).
 */
export function forecast(
  settings: ProjectSettings,
  release: Release,
  tickets: Ticket[],
  sprints: Sprint[],
  now = today(),
) {
  const p = releaseProgress(settings, release, tickets);
  const count = byCount(settings);
  const remaining = count ? p.count - p.doneCount : p.total - p.done;
  if (!remaining) return { remaining, sprints: 0, date: null as string | null, late: false };
  const average = velocity(sprints, count).average;
  if (!average)
    return { remaining, sprints: null as number | null, date: null as string | null, late: false };
  const needed = Math.ceil(remaining / average);
  const active = sprints.find(s => s.status === 'active');
  const from = active?.end && active.end > now ? active.end : now;
  const date = iso(new Date(at(from).getTime() + needed * settings.delivery.sprintWeeks * 7 * DAY));
  return { remaining, sprints: needed, date, late: !!release.end && date > release.end };
}

/** Tickets d'une US : ceux qui la réalisent, et leurs sous-tâches. */
export function ticketsOfStory(tickets: Ticket[], story: string) {
  const direct = tickets.filter(t => t.story === story);
  const ids = new Set(direct.map(t => t.id));
  return [...direct, ...tickets.filter(t => !ids.has(t.id) && ids.has(t.parent))];
}

export interface GroupProgress {
  key: string;
  label: string;
  /** US du cadrage, US validées, US passées en réalisation (au moins un ticket), US terminées. */
  stories: number;
  validated: number;
  started: number;
  finished: number;
  tickets: number;
  ticketsDone: number;
  total: number;
  done: number;
}

/**
 * Avancement par regroupement d'US (épique, plateforme) : une US terminée a tous ses tickets
 * terminés. Une US qui vise plusieurs plateformes compte dans chacune.
 */
export function progressBy(
  settings: ProjectSettings,
  stories: Story[],
  tickets: Ticket[],
  groups: { key: string; label: string }[],
  keysOf: (s: Story) => string[],
): GroupProgress[] {
  return groups.map(({ key, label }) => {
    const list = stories.filter(s => s.status !== 'Écartée' && keysOf(s).includes(key));
    const own = list.map(s => ticketsOfStory(tickets, s.id));
    const all = [...new Map(own.flat().map(t => [t.id, t])).values()];
    const done = all.filter(t => isDone(settings, t));
    return {
      key,
      label,
      stories: list.length,
      validated: list.filter(s => s.status === 'Validée').length,
      started: own.filter(t => t.length).length,
      finished: own.filter(t => t.length && t.every(x => isDone(settings, x))).length,
      tickets: all.length,
      ticketsDone: done.length,
      total: load(all).total,
      done: load(done).total,
    };
  });
}

/** Plateformes visées par une US (les US importées avant les plateformes n'en ont pas). */
export const platformKeys = (s: Story) => (s.targets ?? []).map(t => t.platform);

/** Plateformes visées par les US, triées. */
export const platformsOf = (stories: Story[]) =>
  [...new Set(stories.flatMap(s => (s.targets ?? []).map(t => t.platform)).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'fr'),
  );

// --- Filtre par organisation ---------------------------------------------------------------

/** L'organisation, ses personnes et ses rôles (rattachés, ou tenus par une de ses personnes). */
export function partiesOfOrganization(parties: Party[], org: string) {
  const persons = parties.filter(p => p.type === 'person' && p.organization === org).map(p => p.id);
  const roles = parties
    .filter(p => p.type === 'role' && (p.organization === org || persons.includes(p.holder)))
    .map(p => p.id);
  return new Set([org, ...persons, ...roles]);
}

/**
 * Une mention en texte libre (« NTECH SARL, agrégateur ») désigne-t-elle l'organisation ou l'une
 * de ses parties ? Cherchée entière, puis morceau par morceau, comme le référentiel.
 */
export function mentionsOrganization(parties: Party[], org: string, text: string) {
  const find = partyIndex(parties);
  const members = partiesOfOrganization(parties, org);
  const pieces = find(text) ? [text] : splitMention(text);
  return pieces.some(piece => {
    const p = find(piece);
    return !!p && (members.has(p.id) || p.organization === org);
  });
}

/** Points d'attention : risques ouverts élevés ou critiques, diligences ouvertes en retard. */
export function attention(data: { risks: Risk[]; diligences: Diligence[] }, now = today()) {
  const risks = data.risks.filter(r => {
    const level = riskLevel(riskScore(r.residual) ?? riskScore(r.initial));
    return r.status !== 'Clos' && r.status !== 'Proposé' && (level === 'Élevé' || level === 'Critique');
  });
  const late = data.diligences.filter(
    d => diligenceOpen(d.status) && /^\d{4}-\d{2}-\d{2}$/.test(d.due) && d.due < now,
  );
  return { risks, late };
}
