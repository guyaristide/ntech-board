import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  DILIGENCE_KIND_HINT,
  DILIGENCE_KINDS,
  DILIGENCE_STATUSES,
  diligenceOpen,
  partyNames,
  type Diligence,
  type Party,
} from '@board/shared';
import { dueLabel, overdue } from '../../model/due';
import { useCanEdit, useWorkspace } from '../../model/store';
import { ExportButton, type Column } from '../../ui/ExportButton';
import { PropertySelect } from '../../ui/PropertySelect';
import { Tag } from '../../ui/Tag';
import backlog from '../backlog/Backlog.module.css';
import { frDate } from '../exportFormat';
import page from '../Page.module.css';
import styles from './Diligences.module.css';

type View = 'registre' | 'responsables';
const VIEWS: [View, string][] = [
  ['registre', '☰ Registre'],
  ['responsables', '◫ Par responsable'],
];

const COLUMNS: Column<Diligence>[] = [
  ['ID', d => d.id],
  ['Diligence', d => d.title],
  ['Détail', d => d.detail],
  ['Type', d => d.kind],
  ['Responsable', d => d.owner],
  ['Avec', d => d.partners],
  ['Dépend de', d => d.dependency],
  ['Échéance', d => frDate(d.due)],
  ['Statut', d => d.status],
  ['Résultat', d => d.outcome],
  ['Ateliers', d => d.workshops.join(', ')],
  ['US', d => d.stories.join(', ')],
  ['Risques', d => d.risks.join(', ')],
  ['Source', d => d.source],
];

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Référentiel des parties prenantes, puis les autres parties citées, pour les listes de choix. */
export const partiesOf = (diligences: Diligence[], parties: Party[]) =>
  partyNames(
    parties,
    diligences.flatMap(d => [d.owner, ...d.partners.split(/\s*[,+]\s*/)]),
  );

/** Tableau des diligences : une ligne par diligence, statut et responsable modifiables sur place. */
function DiligenceTable({ items }: { items: Diligence[] }) {
  const ws = useWorkspace();
  const owners = partiesOf(ws.diligences, ws.parties);
  return (
    <div className={backlog.tableWrap}>
      <table className={backlog.table}>
        <colgroup>
          <col style={{ width: 56 }} />
          <col />
          <col style={{ width: 104 }} />
          <col style={{ width: 150 }} />
          <col style={{ width: 170 }} />
          <col style={{ width: 120 }} />
          <col style={{ width: 120 }} />
        </colgroup>
        <thead>
          <tr>
            <th>ID</th>
            <th>Diligence</th>
            <th>Type</th>
            <th>Responsable</th>
            <th>Dépend de</th>
            <th>Échéance</th>
            <th>Statut</th>
          </tr>
        </thead>
        <tbody>
          {items.map(d => (
            <tr key={d.id}>
              <td>
                <Link to={`/diligence/${d.id}`} className={backlog.mono}>
                  {d.id}
                </Link>
              </td>
              <td>
                <Link to={`/diligence/${d.id}`} className={backlog.titleLink} title={d.detail || d.title}>
                  {d.title || 'Sans titre'}
                </Link>
                {d.stories.length ? (
                  <span className={backlog.badge} title={d.stories.join(', ')}>
                    {d.stories.length} US
                  </span>
                ) : null}
                {d.partners ? <span className={backlog.targets}>avec {d.partners}</span> : null}
              </td>
              <td>
                <Tag value={d.kind} />
              </td>
              <td>
                <PropertySelect
                  label="Responsable"
                  value={d.owner}
                  options={owners}
                  creatable
                  onChange={owner => ws.updateDiligence(d.id, { owner })}
                />
              </td>
              <td className={styles.dependency} title={d.dependency}>
                {d.dependency}
              </td>
              <td className={overdue(d.due) && diligenceOpen(d.status) ? styles.late : undefined}>
                {dueLabel(d.due)}
              </td>
              <td>
                <PropertySelect
                  label="Statut de la diligence"
                  value={d.status}
                  options={DILIGENCE_STATUSES}
                  onChange={v => v && ws.updateDiligence(d.id, { status: v as Diligence['status'] })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Diligences issues des ateliers : ce que chaque partie doit produire, étudier, trancher ou
 * fournir, et ce dont cela dépend. Vue en registre ou regroupée par responsable.
 */
export function Diligences() {
  const ws = useWorkspace();
  const canEdit = useCanEdit();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = (VIEWS.find(([v]) => v === params.get('vue'))?.[0] ?? 'registre') as View;
  const kind = params.get('type') ?? '';
  const status = params.get('statut') ?? '';
  const owner = params.get('responsable') ?? '';
  const q = norm(params.get('q') ?? '');
  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next, { replace: true });
  };

  const open = ws.diligences.filter(d => diligenceOpen(d.status));
  const late = open.filter(d => overdue(d.due));
  const shown = ws.diligences.filter(
    d =>
      (!kind || d.kind === kind) &&
      (!status ? true : status === 'ouvertes' ? diligenceOpen(d.status) : d.status === status) &&
      (!owner || d.owner === owner || d.partners.includes(owner)) &&
      (!q ||
        norm(
          `${d.id} ${d.title} ${d.detail} ${d.owner} ${d.partners} ${d.dependency} ${d.stories.join(' ')}`,
        ).includes(q)),
  );
  // Vue par responsable : les parties qui ont le plus à mener d'abord.
  const ownerOf = (d: Diligence) => d.owner || 'À désigner';
  const pending = (o: string) => open.filter(d => ownerOf(d) === o).length;
  const owners = [...new Set(ws.diligences.map(ownerOf))].sort(
    (a, b) => pending(b) - pending(a) || a.localeCompare(b, 'fr'),
  );
  const create = async () =>
    navigate(`/diligence/${await ws.createDiligence(owner ? { owner } : undefined)}?nouvelle=1`);

  return (
    <div className={`${page.page} ${page.wide}`}>
      <span className={page.icon} aria-hidden="true">
        📌
      </span>
      <h1 className={page.h1}>Diligences</h1>
      <p className={page.lead}>
        {ws.diligences.length
          ? `${ws.diligences.length} diligence${ws.diligences.length > 1 ? 's' : ''} issue${ws.diligences.length > 1 ? 's' : ''} des ateliers, dont ${open.length} à mener${late.length ? ` et ${late.length} en retard` : ''}. `
          : ''}
        Chaque diligence a un responsable, ce dont elle dépend et les US qu’elle conditionne.
      </p>

      {!ws.diligences.length ? (
        <div className={page.emptyState}>
          <strong>Aucune diligence pour l’instant</strong>
          <p>
            Les diligences naissent des ateliers : ce qu’une partie s’engage à produire, étudier, trancher ou
            fournir.
          </p>
          {canEdit ? (
            <button type="button" className={page.primary} onClick={() => void create()}>
              Nouvelle diligence
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div className={backlog.toolbar}>
            <div className={backlog.views} role="tablist" aria-label="Vue">
              {VIEWS.map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={view === v}
                  className={backlog.view}
                  onClick={() => update({ vue: v === 'registre' ? '' : v })}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className={backlog.total}>{shown.length} diligences</span>
            <ExportButton
              name="diligences"
              rows={view === 'registre' ? shown : owners.flatMap(o => shown.filter(d => ownerOf(d) === o))}
              columns={COLUMNS}
              filtered={shown.length !== ws.diligences.length}
              noun="diligences"
            />
            <input
              type="search"
              className={backlog.search}
              placeholder="Rechercher…"
              aria-label="Rechercher une diligence"
              value={params.get('q') ?? ''}
              onChange={e => update({ q: e.target.value })}
            />
            {canEdit ? (
              <button type="button" className={page.primary} onClick={() => void create()}>
                Nouvelle diligence
              </button>
            ) : null}
          </div>

          <div className={backlog.filters}>
            {['', ...DILIGENCE_KINDS].map(k => (
              <button
                key={k || 'all'}
                type="button"
                className={backlog.filter}
                data-on={kind === k || undefined}
                title={k ? DILIGENCE_KIND_HINT[k as Diligence['kind']] : undefined}
                onClick={() => update({ type: k })}
              >
                {k || 'Tous types'} · {ws.diligences.filter(d => !k || d.kind === k).length}
              </button>
            ))}
            <select
              className={styles.select}
              aria-label="Statut"
              value={status}
              onChange={e => update({ statut: e.target.value })}
            >
              <option value="">Tous statuts</option>
              <option value="ouvertes" title="Ni réalisées ni abandonnées">
                À mener
              </option>
              {DILIGENCE_STATUSES.map(s => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select
              className={styles.select}
              aria-label="Responsable"
              value={owner}
              onChange={e => update({ responsable: e.target.value })}
            >
              <option value="">Tous responsables</option>
              {partiesOf(ws.diligences, ws.parties).map(p => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>

          {!shown.length ? (
            <p className={page.emptyState}>Aucune diligence ne correspond à ces filtres.</p>
          ) : view === 'registre' ? (
            <DiligenceTable items={shown} />
          ) : (
            owners.map(o => {
              const items = shown.filter(d => ownerOf(d) === o);
              return items.length ? (
                <section key={o} aria-label={o}>
                  <h2 className={page.h2}>
                    {o}{' '}
                    <span className={page.faint}>
                      {items.filter(d => diligenceOpen(d.status)).length} à mener sur {items.length}
                    </span>
                  </h2>
                  <DiligenceTable items={items} />
                </section>
              ) : null;
            })
          )}
        </>
      )}
    </div>
  );
}

/** Diligences d'une liste, en lignes compactes (fiche d'atelier, de risque). */
export function DiligenceRefs({ items }: { items: Diligence[] }) {
  return (
    <ul className={page.refList}>
      {items.map(d => (
        <li key={d.id} className={page.refRow}>
          <Link to={`/diligence/${d.id}`}>
            <span className={page.kickerInline}>{d.id}</span> {d.title || 'Sans titre'}
          </Link>
          <span className={page.faint}>{d.owner}</span>
          <Tag value={d.status} />
        </li>
      ))}
    </ul>
  );
}
