import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { versionsOf, SCENARIO_LABEL } from '@board/shared';
import { programme } from '../../model/programme';
import { useCanEdit, useWorkspace } from '../../model/store';
import type { Scenario } from '@board/shared';
import { Popover } from '../../ui/Popover';
import page from '../Page.module.css';
import { FilterButton } from './FilterButton';
import {
  applyFilters,
  FILTER_KEYS,
  FILTER_LABEL,
  readFilters,
  sortStories,
  valuesOf,
  type FilterKey,
  type SortKey,
} from './filters';
import { StoryBoard } from './StoryBoard';
import { StoryTable } from './StoryTable';
import styles from './Backlog.module.css';

type View = 'table' | 'board';

/** Base de données des user stories : vues tableau et Kanban, filtres, recherche, création. */
export function Backlog() {
  const ws = useWorkspace();
  const canEdit = useCanEdit();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view: View = params.get('vue') === 'kanban' ? 'board' : 'table';
  const query = params.get('q') ?? '';
  const filters = readFilters(params);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'id', dir: 1 });
  const [picking, setPicking] = useState(false);
  const rows = sortStories(
    applyFilters(ws.stories, filters, query),
    sort.key,
    sort.dir,
    versionsOf(ws.settings),
  );
  const active = FILTER_KEYS.filter(k => filters[k].length).length;

  const setParam = (mutate: (p: URLSearchParams) => void) => {
    const next = new URLSearchParams(params);
    mutate(next);
    setParams(next, { replace: true });
  };
  const setFilter = (key: FilterKey, values: string[]) =>
    setParam(p => {
      p.delete(key);
      values.forEach(v => p.append(key, v));
    });
  const optionsOf = (key: FilterKey) => {
    const counts = new Map<string, number>();
    // Les compteurs tiennent compte des autres filtres, comme dans Notion.
    applyFilters(ws.stories, { ...filters, [key]: [] }, query).forEach(s => {
      for (const v of valuesOf(s, key)) counts.set(v, (counts.get(v) ?? 0) + 1);
    });
    const order =
      key === 'epic' ? ws.epics.map(e => e.id) : key === 'workshop' ? ws.workshops.map(w => w.id) : [];
    return [...counts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => (order.length ? order.indexOf(a.value) - order.indexOf(b.value) : b.count - a.count));
  };
  const create = async (epic: string) => {
    setPicking(false);
    const id = await ws.createStory(
      epic,
      filters.workshop.length === 1 ? { workshop: filters.workshop[0] } : {},
    );
    navigate(`/us/${id}?nouvelle=1`);
  };
  const epicFilter = filters.epic.length === 1 ? filters.epic[0] : null;

  return (
    <div className={`${page.page} ${page.wide}`}>
      <span className={page.icon} aria-hidden="true">
        🗂️
      </span>
      <h1 className={page.h1}>Backlog des user stories</h1>
      <p className={page.lead}>
        {ws.stories.length} US réparties en {ws.epics.length} épique{ws.epics.length > 1 ? 's' : ''}. Ouvrez
        une US pour l’enrichir : critères, notes d’atelier, commentaires.
      </p>

      <div className={styles.toolbar}>
        <div className={styles.views} role="tablist" aria-label="Vue">
          {(['table', 'board'] as const).map(v => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              className={styles.view}
              onClick={() => setParam(p => (v === 'board' ? p.set('vue', 'kanban') : p.delete('vue')))}
            >
              {v === 'table' ? '☰ Tableau' : '▥ Kanban'}
            </button>
          ))}
        </div>
        <span className={styles.total}>{rows.length} US</span>
        <input
          type="search"
          className={styles.search}
          placeholder="Rechercher…"
          aria-label="Rechercher dans le backlog"
          value={query}
          onChange={e => setParam(p => (e.target.value ? p.set('q', e.target.value) : p.delete('q')))}
        />
        <div className={styles.filterRoot} hidden={!canEdit}>
          <button
            type="button"
            className={page.primary}
            onClick={() => (epicFilter ? void create(epicFilter) : setPicking(o => !o))}
          >
            Nouvelle US
          </button>
          <Popover open={picking} onClose={() => setPicking(false)} align="end" width={320}>
            <p className={styles.pickTitle}>Dans quelle épique ?</p>
            <ul className={styles.filterList}>
              {ws.epics.map(e => (
                <li key={e.id}>
                  <button type="button" className={styles.pick} onClick={() => void create(e.id)}>
                    <span className={styles.mono}>{e.id}</span> {e.title}
                  </button>
                </li>
              ))}
            </ul>
            {!ws.epics.length ? (
              <p className={page.faint}>Une US appartient à une épique : créez d’abord la première.</p>
            ) : null}
            <button
              type="button"
              className={styles.pick}
              onClick={async () => {
                setPicking(false);
                navigate(`/epic/${await programme.createEpic()}`);
              }}
            >
              + Nouvelle épique
            </button>
          </Popover>
        </div>
      </div>

      <div className={styles.filters}>
        {FILTER_KEYS.map(k => (
          <FilterButton
            key={k}
            label={FILTER_LABEL[k]}
            options={optionsOf(k)}
            selected={filters[k]}
            onChange={v => setFilter(k, v)}
            render={
              k === 'epic'
                ? v => `${v} ${ws.epics.find(e => e.id === v)?.title ?? ''}`.trim()
                : k === 'scenario'
                  ? v => SCENARIO_LABEL[v as Scenario] ?? v
                  : undefined
            }
          />
        ))}
        {active ? (
          <button
            type="button"
            className={page.ghost}
            onClick={() => setParam(p => FILTER_KEYS.forEach(k => p.delete(k)))}
          >
            Réinitialiser les filtres
          </button>
        ) : null}
      </div>

      {view === 'table' ? (
        <StoryTable
          stories={rows}
          sort={sort}
          onSort={key => setSort(s => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : 1 }))}
        />
      ) : (
        <StoryBoard stories={rows} />
      )}
    </div>
  );
}

/** Liste d'US triable, intégrée dans les pages d'épique et d'atelier. */
export function StoryList({ stories }: { stories: Parameters<typeof StoryTable>[0]['stories'] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'id', dir: 1 });
  return (
    <StoryTable
      compact
      stories={sortStories(stories, sort.key, sort.dir)}
      sort={sort}
      onSort={key => setSort(s => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : 1 }))}
    />
  );
}
