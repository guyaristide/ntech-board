import { targetLabel, type Story } from '@board/shared';

export const FILTER_KEYS = [
  'epic',
  'platform',
  'module',
  'actor',
  'version',
  'workshop',
  'status',
  'priority',
  'scenario',
] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];
export const FILTER_LABEL: Record<FilterKey, string> = {
  epic: 'Épique',
  platform: 'Plateforme',
  module: 'Module',
  actor: 'Acteur',
  version: 'Version',
  workshop: 'Atelier',
  status: 'Statut',
  priority: 'Priorité',
  scenario: 'Scénario',
};

export type Filters = Record<FilterKey, string[]>;

export const readFilters = (params: URLSearchParams): Filters =>
  Object.fromEntries(FILTER_KEYS.map(k => [k, params.getAll(k)])) as Filters;

/**
 * Valeurs d'une US pour un filtre : une seule le plus souvent, plusieurs pour les plateformes.
 * Une US sans plateforme vaut « » (Vide), comme une propriété non renseignée.
 */
export const valuesOf = (s: Story, key: FilterKey): string[] => {
  if (key !== 'platform' && key !== 'module') return [String(s[key] ?? '')];
  const values =
    key === 'platform'
      ? [...new Set(s.targets.map(t => t.platform))]
      : s.targets.filter(t => t.module).map(targetLabel);
  return values.length ? values : [''];
};

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function applyFilters(stories: Story[], filters: Filters, query: string) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  return stories.filter(
    s =>
      FILTER_KEYS.every(k => !filters[k].length || valuesOf(s, k).some(v => filters[k].includes(v))) &&
      (!words.length ||
        words.every(w =>
          norm(
            `${s.id} ${s.title} ${s.description} ${s.asA} ${s.iWant} ${s.soThat} ${s.source} ${s.acceptance.map(c => c.text).join(' ')}`,
          ).includes(w),
        )),
  );
}

export type SortKey =
  'id' | 'title' | 'actor' | 'epic' | 'version' | 'workshop' | 'priority' | 'status' | 'updatedAt';
const ORDER: Record<string, string[]> = {
  priority: ['Must', 'Should', 'Could'],
  version: ['MVP', 'V1', 'V2', 'Hors périmètre'],
  status: ['À cadrer', 'En atelier', 'À revoir', 'Validée', 'Écartée'],
};
const workshopRank = (w: string) => (w ? (w[0] === 'C' ? 100 : 0) + (parseInt(w.slice(1), 10) || 0) : 999);
// Cas d'usage du CDC d'abord (UC), puis périmètres hors cas d'usage (EX).
const idRank = (id: string) =>
  id
    .replace('-UC', '-0UC')
    .replace('-EX', '-1EX')
    .replace(/\d+/g, d => d.padStart(4, '0'));

export function sortStories(stories: Story[], key: SortKey, dir: 1 | -1) {
  const value = (s: Story): string | number => {
    if (key === 'id') return idRank(s.id);
    if (key === 'workshop') return workshopRank(s.workshop);
    if (ORDER[key]) return ORDER[key].indexOf(s[key as 'priority']);
    return String(s[key] ?? '').toLowerCase();
  };
  return [...stories].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    return (x < y ? -1 : x > y ? 1 : 0) * dir;
  });
}
