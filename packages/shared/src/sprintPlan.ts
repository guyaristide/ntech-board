import { nextSprintDates, type Release, type Sprint } from './delivery';

/** Planification des sprints d'une version : création en série et recalage des dates. */

const DAY = 86_400_000;
const at = (s: string) => new Date(`${s}T12:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const add = (s: string, days: number) => iso(new Date(at(s).getTime() + days * DAY));
const dow = (s: string) => at(s).getUTCDay();

/** Nombre maximal de sprints créés ou recalés en une fois. */
export const MAX_PLANNED = 26;

/** Premier jour ouvré à partir de cette date (le samedi et le dimanche passent au lundi). */
export const workdayFrom = (s: string) => (dow(s) === 6 ? add(s, 2) : dow(s) === 0 ? add(s, 1) : s);
/** Dernier jour ouvré jusqu'à cette date (le week-end revient au vendredi). */
export const workdayUntil = (s: string) => (dow(s) === 6 ? add(s, -1) : dow(s) === 0 ? add(s, -2) : s);

export interface Period {
  start: string;
  end: string;
}

/**
 * Périodes successives de `weeks` semaines à partir de `start`, chacune enchaînée au jour ouvré
 * qui suit la précédente : jusqu'à `until` (la dernière est alors raccourcie) ou au nombre `count`.
 */
export function sprintPeriods(
  start: string,
  weeks: number,
  limit: { until?: string | null; count?: number | null },
) {
  const out: Period[] = [];
  const max = Math.min(limit.count ?? MAX_PLANNED, MAX_PLANNED);
  let s = workdayFrom(start);
  while (out.length < max) {
    if (limit.until && s > limit.until) break;
    let e = workdayUntil(add(s, weeks * 7 - 1));
    if (limit.until && e > limit.until) e = workdayUntil(limit.until);
    if (e < s) break;
    out.push({ start: s, end: e });
    s = workdayFrom(add(e, 1));
  }
  return out;
}

/** Sprints d'une version, dans l'ordre des dates (les sprints sans date en dernier). */
export const sprintsOf = (release: string, sprints: Sprint[]) =>
  sprints
    .filter(s => s.release === release)
    .sort((a, b) => (a.start ?? '9').localeCompare(b.start ?? '9') || a.id.localeCompare(b.id));

/**
 * Début proposé pour les prochains sprints d'une version : le jour ouvré qui suit son dernier
 * sprint, sinon le début de la version, sinon la suite du calendrier de tous les sprints.
 */
export function nextStartFor(release: Release, sprints: Sprint[], weeks: number) {
  const last = sprintsOf(release.id, sprints)
    .map(s => s.end)
    .filter((e): e is string => !!e)
    .sort()
    .at(-1);
  if (last) return workdayFrom(add(last, 1));
  if (release.start) return workdayFrom(release.start);
  return nextSprintDates(sprints, weeks).start;
}

/** Sprints d'une version qu'un recalage peut déplacer : ceux qui n'ont pas encore commencé. */
export const replannable = (release: string, sprints: Sprint[]) =>
  sprintsOf(release, sprints).filter(s => s.status === 'planned');
