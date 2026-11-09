import { useSearchParams } from 'react-router-dom';
import { labelTone, matchesWords, targetLabel, type Ticket } from '@board/shared';
import { useWorkspace } from '../../model/store';
import page from '../Page.module.css';
import backlog from '../backlog/Backlog.module.css';
import { FilterButton } from '../backlog/FilterButton';
import { FILTER_LABEL, valuesOf } from '../backlog/filters';
import { ManageLabels } from './Labels';

/** Les étiquettes du ticket, puis les axes du cadrage qu'il hérite de son US. */
const KEYS = ['etiquette', 'epic', 'platform', 'module', 'actor', 'priority', 'workshop'] as const;
type Key = (typeof KEYS)[number];
const LABEL: Record<Key, string> = {
  etiquette: 'Étiquette',
  epic: FILTER_LABEL.epic,
  platform: FILTER_LABEL.platform,
  module: FILTER_LABEL.module,
  actor: FILTER_LABEL.actor,
  priority: FILTER_LABEL.priority,
  workshop: FILTER_LABEL.workshop,
};

/** Filtres des tickets par leur US, conservés dans l'adresse comme ceux du backlog du cadrage. */
export function useTicketFilters() {
  const stories = useWorkspace(s => s.stories);
  const [params, setParams] = useSearchParams();
  const byId = new Map(stories.map(s => [s.id, s]));
  const chosen = (k: Key) => params.getAll(k);
  const valuesFor = (t: Ticket, k: Key) => {
    if (k === 'etiquette') return t.labels.length ? t.labels : [''];
    const story = byId.get(t.story);
    return story ? valuesOf(story, k) : [''];
  };
  const matches = (t: Ticket, except?: Key) =>
    KEYS.every(k => k === except || !chosen(k).length || valuesFor(t, k).some(v => chosen(k).includes(v)));
  /** La recherche voit aussi le contenu de l'US liée : son récit, ses critères, ses modules. */
  const search = (t: Ticket, q: string) => {
    if (!q.trim()) return true;
    const s = byId.get(t.story);
    const story = s
      ? `${s.title} ${s.description} ${s.asA} ${s.iWant} ${s.soThat} ${s.source} ${s.acceptance
          .map(c => c.text)
          .join(' ')} ${s.targets.map(targetLabel).join(' ')}`
      : '';
    return matchesWords(`${t.id} ${t.title} ${t.labels.join(' ')} ${t.story} ${story}`, q);
  };
  const update = (mutate: (p: URLSearchParams) => void) => {
    const next = new URLSearchParams(params);
    mutate(next);
    setParams(next, { replace: true });
  };
  return {
    chosen,
    valuesFor,
    matches,
    search,
    update,
    has: (k: string) => params.has(k),
    active: KEYS.some(k => chosen(k).length),
  };
}

type Filters = ReturnType<typeof useTicketFilters>;

/**
 * Une puce par axe : les valeurs sont celles du projet, rien n'est propre à l'un d'eux. `tickets` : ceux que laissent la version et la recherche. Un axe que le projet
 * ne renseigne pas n'apparaît pas, sauf s'il est déjà filtré par l'adresse.
 */
export function TicketFilters({
  filters,
  tickets,
  others = [],
}: {
  filters: Filters;
  tickets: Ticket[];
  /** Filtres propres à l'écran : « Réinitialiser » les efface aussi. */
  others?: string[];
}) {
  const epics = useWorkspace(s => s.epics);
  const settings = useWorkspace(s => s.settings);
  const optionsOf = (k: Key) => {
    const counts = new Map<string, number>();
    // Les compteurs tiennent compte des autres filtres, comme dans le cadrage.
    tickets
      .filter(t => filters.matches(t, k))
      .forEach(t => filters.valuesFor(t, k).forEach(v => counts.set(v, (counts.get(v) ?? 0) + 1)));
    const order = k === 'epic' ? epics.map(e => e.id) : [];
    return [...counts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => (order.length ? order.indexOf(a.value) - order.indexOf(b.value) : b.count - a.count));
  };
  const usable = KEYS.filter(k => filters.chosen(k).length || optionsOf(k).some(o => o.value));
  // Après un renommage, un filtre posé sur l'ancien nom suit le nouveau.
  const renamed = (from: string, to: string) =>
    filters.update(p => {
      const kept = p.getAll('etiquette');
      if (!kept.includes(from)) return;
      p.delete('etiquette');
      [...new Set(kept.map(v => (v === from ? to : v)))].forEach(v => p.append('etiquette', v));
    });
  const othersOn = others.some(k => filters.has(k));
  if (!usable.length && !othersOn) return null;
  return (
    <div className={backlog.filters}>
      {usable.map(k => (
        <FilterButton
          key={k}
          label={LABEL[k]}
          options={optionsOf(k)}
          selected={filters.chosen(k)}
          onChange={values =>
            filters.update(p => {
              p.delete(k);
              values.forEach(v => p.append(k, v));
            })
          }
          render={k === 'epic' ? v => `${v} ${epics.find(e => e.id === v)?.title ?? ''}`.trim() : undefined}
          tone={k === 'etiquette' ? v => labelTone(settings, v) : undefined}
        />
      ))}
      {filters.active || othersOn ? (
        <button
          type="button"
          className={page.ghost}
          onClick={() => filters.update(p => [...KEYS, ...others].forEach(k => p.delete(k)))}
        >
          Réinitialiser les filtres
        </button>
      ) : null}
      <ManageLabels onRenamed={renamed} />
    </div>
  );
}
