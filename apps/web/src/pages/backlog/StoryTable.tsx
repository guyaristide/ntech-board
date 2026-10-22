import { Link } from 'react-router-dom';
import { PRIORITIES, STATUSES, targetLabel, versionsOf } from '@board/shared';
import { useDrawer } from '../../model/drawer';
import { useSeesDelivery, useWorkspace } from '../../model/store';
import type { Story } from '@board/shared';
import { PropertySelect } from '../../ui/PropertySelect';
import { Tag } from '../../ui/Tag';
import type { SortKey } from './filters';
import styles from './Backlog.module.css';

const COLUMNS: { key: SortKey; label: string; width?: string }[] = [
  { key: 'id', label: 'ID', width: '112px' },
  { key: 'title', label: 'Titre' },
  { key: 'actor', label: 'Acteur', width: '150px' },
  { key: 'epic', label: 'Épique', width: '70px' },
  { key: 'version', label: 'Version', width: '86px' },
  { key: 'workshop', label: 'Atelier', width: '68px' },
  { key: 'priority', label: 'Priorité', width: '88px' },
  { key: 'status', label: 'Statut', width: '112px' },
];

/**
 * Vue tableau du backlog : tri par colonne, propriétés modifiables sur place. Avec `selected` et
 * `onSelect`, une case par ligne (et une pour toutes les lignes affichées) pour les actions groupées.
 */
export function StoryTable({
  stories,
  sort,
  onSort,
  compact,
  selected,
  onSelect,
}: {
  stories: Story[];
  sort: { key: SortKey; dir: 1 | -1 };
  onSort: (key: SortKey) => void;
  compact?: boolean;
  selected?: Set<string>;
  onSelect?: (ids: string[], on: boolean) => void;
}) {
  const update = useWorkspace(s => s.updateStory);
  const openDrawer = useDrawer(s => s.open);
  const settings = useWorkspace(s => s.settings);
  const workshops = useWorkspace(s => s.workshops).map(w => w.id);
  const columns = compact ? COLUMNS.filter(c => c.key !== 'epic') : COLUMNS;
  // Ticket de réalisation de chaque US, pour qui voit la Réalisation.
  const sees = useSeesDelivery();
  const tickets = useWorkspace(s => s.tickets);
  const ticketOf = new Map(sees ? tickets.filter(t => t.story).map(t => [t.story, t.id]) : []);
  const selectable = !!selected && !!onSelect;
  const allOn = selectable && stories.length > 0 && stories.every(s => selected.has(s.id));
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <colgroup>
          {selectable ? <col style={{ width: '36px' }} /> : null}
          {columns.map(c => (
            <col key={c.key} style={c.width ? { width: c.width } : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {selectable ? (
              <th className={styles.check}>
                <input
                  type="checkbox"
                  aria-label="Sélectionner toutes les US affichées"
                  checked={allOn}
                  onChange={e =>
                    onSelect(
                      stories.map(s => s.id),
                      e.target.checked,
                    )
                  }
                />
              </th>
            ) : null}
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
            <tr key={s.id} data-selected={selected?.has(s.id) || undefined}>
              {selectable ? (
                <td className={styles.check}>
                  <input
                    type="checkbox"
                    aria-label={`Sélectionner ${s.id}`}
                    checked={selected.has(s.id)}
                    onChange={e => onSelect([s.id], e.target.checked)}
                  />
                </td>
              ) : null}
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
                {s.links.length ? (
                  <button
                    type="button"
                    className={`${styles.badge} ${styles.badgeButton}`}
                    title={`Voir les US liées : ${s.links.map(l => l.story).join(', ')}`}
                    onClick={() => openDrawer(s.id, s.links[0].story)}
                  >
                    ⛓ {s.links.length}
                  </button>
                ) : null}
                {ticketOf.has(s.id) ? (
                  <Link
                    to={`/realisation/ticket/${ticketOf.get(s.id)}`}
                    className={`${styles.badge} ${styles.ticket}`}
                    title="En réalisation : ouvrir son ticket"
                  >
                    ⇢ {ticketOf.get(s.id)}
                  </Link>
                ) : null}
                {s.targets.length ? (
                  <span className={styles.targets}>{s.targets.map(targetLabel).join(' · ')}</span>
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
                  options={versionsOf(settings)}
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
              <td colSpan={columns.length + (selectable ? 1 : 0)} className={styles.empty}>
                Aucune US ne correspond.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
