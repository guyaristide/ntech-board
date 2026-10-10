import { Link } from 'react-router-dom';
import { PRIORITIES, STATUSES, VERSIONS } from '../../model/options';
import { useWorkspace } from '../../model/store';
import type { Story } from '../../model/types';
import { PropertySelect } from '../../ui/PropertySelect';
import { Tag } from '../../ui/Tag';
import type { SortKey } from './filters';
import styles from './Backlog.module.css';

const COLUMNS: { key: SortKey; label: string; width?: string }[] = [
  { key: 'id', label: 'ID', width: '120px' },
  { key: 'title', label: 'Titre' },
  { key: 'actor', label: 'Acteur', width: '170px' },
  { key: 'epic', label: 'Épique', width: '90px' },
  { key: 'version', label: 'Version', width: '120px' },
  { key: 'workshop', label: 'Atelier', width: '90px' },
  { key: 'priority', label: 'Priorité', width: '100px' },
  { key: 'status', label: 'Statut', width: '130px' },
];

/** Vue tableau du backlog : tri par colonne, propriétés modifiables sur place. */
export function StoryTable({
  stories,
  sort,
  onSort,
  compact,
}: {
  stories: Story[];
  sort: { key: SortKey; dir: 1 | -1 };
  onSort: (key: SortKey) => void;
  compact?: boolean;
}) {
  const update = useWorkspace(s => s.updateStory);
  const workshops = useWorkspace(s => s.workshops).map(w => w.id);
  const columns = compact ? COLUMNS.filter(c => c.key !== 'epic') : COLUMNS;
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <colgroup>
          {columns.map(c => (
            <col key={c.key} style={c.width ? { width: c.width } : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map(c => (
              <th
                key={c.key}
                aria-sort={sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}
              >
                <button type="button" onClick={() => onSort(c.key)}>
                  {c.label}
                  {sort.key === c.key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {stories.map(s => (
            <tr key={s.id}>
              <td className={styles.mono}>{s.id}</td>
              <td>
                <Link to={`/us/${s.id}`} className={styles.titleLink}>
                  {s.title || 'Sans titre'}
                </Link>
                {s.comments.length || s.body.length ? (
                  <span className={styles.badge} title="Enrichie : notes ou commentaires">
                    ✎ {s.comments.length || ''}
                  </span>
                ) : null}
              </td>
              <td>
                <Tag value={s.actor} />
              </td>
              {compact ? null : (
                <td>
                  <Link to={`/epic/${s.epic}`} className={styles.mono}>
                    {s.epic}
                  </Link>
                </td>
              )}
              <td>
                <PropertySelect
                  label="Version"
                  value={s.version}
                  options={VERSIONS}
                  onChange={v => update(s.id, { version: v as Story['version'] })}
                />
              </td>
              <td>
                <PropertySelect
                  label="Atelier"
                  value={s.workshop}
                  options={workshops}
                  onChange={v => update(s.id, { workshop: v })}
                />
              </td>
              <td>
                <PropertySelect
                  label="Priorité"
                  value={s.priority}
                  options={PRIORITIES}
                  onChange={v => update(s.id, { priority: v as Story['priority'] })}
                />
              </td>
              <td>
                <PropertySelect
                  label="Statut"
                  value={s.status}
                  options={STATUSES}
                  onChange={v => update(s.id, { status: v as Story['status'] })}
                />
              </td>
            </tr>
          ))}
          {!stories.length ? (
            <tr>
              <td colSpan={columns.length} className={styles.empty}>
                Aucune US ne correspond.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
