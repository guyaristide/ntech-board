import { useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { isReady, load, type Sprint, type Ticket } from '@board/shared';
import { byRank, delivery, rankAt, useDelivery } from '../../model/delivery';
import { useCanEdit } from '../../model/store';
import { ExportButton } from '../../ui/ExportButton';
import page from '../Page.module.css';
import backlog from '../backlog/Backlog.module.css';
import { useTicketColumns } from './exports';
import { ImportStories } from './ImportStories';
import { TicketBulkBar } from './TicketBulkBar';
import { DeliveryGate, LoadBar, period, sprintOrder, SprintTag, TicketRow } from './parts';
import styles from './Delivery.module.css';

const DRAG = 'application/x-ticket';

type Select = (ids: string[], on: boolean) => void;

/** Sprints et backlog repliés, mémorisés dans ce navigateur (« backlog » pour le backlog). */
const FOLDED = 'realisation.replies';
const readFolded = () => {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(FOLDED) ?? '[]'));
  } catch {
    return new Set<string>();
  }
};
const saveFolded = (ids: Set<string>) => {
  try {
    localStorage.setItem(FOLDED, JSON.stringify([...ids]));
  } catch {
    /* stockage indisponible : le pliage vaut pour cette visite */
  }
};

/** Une colonne de planification : un sprint, ou le backlog (sprint vide). */
function Lane({
  sprint,
  tickets,
  selected,
  onSelect,
  folded,
  onFold,
}: {
  sprint: Sprint | null;
  tickets: Ticket[];
  selected: Set<string>;
  onSelect?: Select;
  folded: boolean;
  onFold: () => void;
}) {
  const canEdit = useCanEdit();
  const { settings } = useDelivery();
  const [over, setOver] = useState(false);
  const list = [...tickets].sort(byRank);
  const sprintId = sprint?.id ?? '';
  const drop = (e: DragEvent, before: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    setOver(false);
    const id = e.dataTransfer.getData(DRAG);
    if (id) delivery.updateTicket(id, { sprint: sprintId, rank: rankAt(list, before, id) });
  };
  const { total, unestimated } = load(list);
  const ready = list.filter(t => isReady(settings, t)).length;
  const picked = list.filter(t => selected.has(t.id)).length;
  return (
    <section
      className={styles.lane}
      data-folded={folded || undefined}
      data-over={over || undefined}
      onDragOver={e => {
        if (!canEdit) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={e => drop(e, null)}
    >
      <header className={styles.laneHead}>
        <button
          type="button"
          className={styles.fold}
          aria-expanded={!folded}
          aria-label={`${folded ? 'Déplier' : 'Replier'} ${sprint?.name ?? 'le backlog'}`}
          title={folded ? 'Déplier' : 'Replier'}
          onClick={onFold}
        >
          {folded ? '▸' : '▾'}
        </button>
        {onSelect && list.length ? (
          <input
            type="checkbox"
            className={styles.pick}
            checked={list.every(t => selected.has(t.id))}
            aria-label={`Sélectionner tous les tickets de ${sprint?.name ?? 'Backlog'}`}
            onChange={e =>
              onSelect(
                list.map(t => t.id),
                e.target.checked,
              )
            }
          />
        ) : null}
        {sprint ? (
          <>
            <Link to={`/realisation/sprint/${sprint.id}`} className={styles.laneTitle}>
              {sprint.name}
            </Link>
            <SprintTag sprint={sprint} />
            <span className={page.faint}>
              {period(sprint)} · {list.length} ticket{list.length > 1 ? 's' : ''}
            </span>
            {sprint.goal ? <span className={styles.goal}>{sprint.goal}</span> : null}
          </>
        ) : (
          <>
            <span className={styles.laneTitle}>Backlog</span>
            <span className={page.faint}>
              {list.length} ticket{list.length > 1 ? 's' : ''} · {ready} prêt{ready > 1 ? 's' : ''}
            </span>
          </>
        )}
        {folded && picked ? (
          <span className={page.faint}>
            {picked} sélectionné{picked > 1 ? 's' : ''}
          </span>
        ) : null}
        <span className={styles.laneLoad}>
          <LoadBar value={total} max={sprint?.capacity ?? null} label="Charge et capacité" />
          {unestimated ? (
            <span className={styles.missing}>
              {unestimated} non estimé{unestimated > 1 ? 's' : ''}
            </span>
          ) : null}
        </span>
      </header>
      {folded
        ? null
        : list.map(t => (
            <TicketRow
              key={t.id}
              ticket={t}
              onDragStart={e => {
                e.dataTransfer.setData(DRAG, t.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDrop={e => drop(e, t.id)}
              selected={selected.has(t.id)}
              onSelect={onSelect && (on => onSelect([t.id], on))}
            />
          ))}
      {!list.length && !folded ? (
        <p className={styles.emptyLane}>
          {sprint
            ? 'Glissez ici des tickets du backlog, ou choisissez ce sprint dans la colonne Sprint.'
            : 'Le backlog est vide.'}
        </p>
      ) : null}
    </section>
  );
}

/**
 * Backlog de réalisation : les sprints ouverts puis le backlog, classés par priorité. Un ticket se
 * déplace par glisser-déposer (rang et sprint) ou par la colonne Sprint.
 */
export function DeliveryBacklog() {
  const { releases, sprints, tickets } = useDelivery();
  const canEdit = useCanEdit();
  const [importing, setImporting] = useState(false);
  const [release, setRelease] = useState('');
  const [q, setQ] = useState('');
  const [title, setTitle] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [folded, setFolded] = useState(readFolded);
  const fold = (ids: string[], on: boolean) =>
    setFolded(prev => {
      const next = new Set(prev);
      ids.forEach(id => (on ? next.add(id) : next.delete(id)));
      saveFolded(next);
      return next;
    });
  const select: Select = (ids, on) =>
    setSelected(prev => {
      const next = new Set(prev);
      ids.forEach(id => (on ? next.add(id) : next.delete(id)));
      return next;
    });
  // Les sous-tâches vivent avec leur ticket parent (fiche ticket, tableau du sprint).
  const shown = tickets.filter(
    t =>
      !(t.parent && tickets.some(p => p.id === t.parent)) &&
      (!release || t.release === release) &&
      (!q || `${t.id} ${t.title} ${t.story}`.toLowerCase().includes(q.toLowerCase())),
  );
  const open = sprints.filter(s => s.status !== 'closed').sort(sprintOrder);
  const inClosed = new Set(sprints.filter(s => s.status === 'closed').map(s => s.id));
  const unplanned = shown.filter(
    t => !t.sprint || (!inClosed.has(t.sprint) && !sprints.some(s => s.id === t.sprint)),
  );
  // Export : ce que montrent les colonnes, dans leur ordre (sprints ouverts, puis backlog).
  const exported = [...open.map(s => shown.filter(t => t.sprint === s.id)), unplanned].flatMap(l =>
    [...l].sort(byRank),
  );
  const columns = useTicketColumns();
  // Seuls les tickets affichés comptent : un filtre peut en masquer.
  const chosen = exported.filter(t => selected.has(t.id));
  const lane = { selected, onSelect: canEdit ? select : undefined };
  const laneIds = [...open.map(s => s.id), 'backlog'];
  const laneProps = (id: string) => ({
    ...lane,
    folded: folded.has(id),
    onFold: () => fold([id], !folded.has(id)),
  });

  return (
    <DeliveryGate>
      <div className={`${page.page} ${page.wide}`}>
        <span className={page.icon} aria-hidden="true">
          🗂️
        </span>
        <h1 className={page.h1}>Backlog de réalisation</h1>
        <p className={page.lead}>
          Les US passées en réalisation et les autres tickets, par ordre de priorité. Glissez un ticket pour
          le reclasser ou le planifier dans un sprint.
        </p>
        <div className={backlog.toolbar}>
          <select
            className={styles.filter}
            value={release}
            onChange={e => setRelease(e.target.value)}
            aria-label="Version"
          >
            <option value="">Toutes les versions</option>
            {releases.map(r => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <input
            className={backlog.search}
            style={{ marginLeft: 0 }}
            type="search"
            placeholder="Rechercher un ticket"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          <span className={backlog.total}>{shown.length} tickets</span>
          <span className={page.actions}>
            <ExportButton
              name="backlog-realisation"
              rows={exported}
              columns={columns}
              filtered={!!(release || q)}
              noun="tickets"
            />
            {canEdit ? (
              <>
                <button type="button" className={page.ghost} onClick={() => void delivery.createSprint()}>
                  + Sprint
                </button>
                <button type="button" className={page.primary} onClick={() => setImporting(true)}>
                  + US validées
                </button>
              </>
            ) : null}
          </span>
        </div>
        {canEdit ? (
          <form
            className={styles.quickAdd}
            onSubmit={e => {
              e.preventDefault();
              if (!title.trim()) return;
              void delivery.createTicket({ title: title.trim(), release });
              setTitle('');
            }}
          >
            <input
              value={title}
              placeholder="Nouveau ticket : intitulé, puis Entrée"
              aria-label="Nouveau ticket"
              onChange={e => setTitle(e.target.value)}
            />
          </form>
        ) : null}
        {importing ? <ImportStories onClose={() => setImporting(false)} /> : null}
        {chosen.length ? (
          <TicketBulkBar tickets={chosen} columns={columns} onClear={() => setSelected(new Set())} />
        ) : null}
        <p className={styles.foldAll}>
          <button
            type="button"
            className={page.ghost}
            disabled={laneIds.every(id => folded.has(id))}
            onClick={() => fold(laneIds, true)}
          >
            ▸ Tout replier
          </button>
          <button
            type="button"
            className={page.ghost}
            disabled={!laneIds.some(id => folded.has(id))}
            onClick={() => fold(laneIds, false)}
          >
            ▾ Tout déplier
          </button>
        </p>
        {open.map(s => (
          <Lane key={s.id} sprint={s} tickets={shown.filter(t => t.sprint === s.id)} {...laneProps(s.id)} />
        ))}
        <Lane sprint={null} tickets={unplanned} {...laneProps('backlog')} />
        {sprints.some(s => s.status === 'closed') ? (
          <p className={page.faint}>
            Les sprints clos et leurs tickets sont dans <Link to="/realisation/sprints">Sprints</Link>.
          </p>
        ) : null}
      </div>
    </DeliveryGate>
  );
}
