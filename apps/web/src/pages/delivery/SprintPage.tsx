import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { amount, isDone, progress, workdaysLeft, STEP_CATEGORY_LABEL } from '@board/shared';
import { ApiError } from '../../model/api';
import { byRank, delivery, useDelivery } from '../../model/delivery';
import { useCanEdit } from '../../model/store';
import { BlockEditor } from '../../ui/BlockEditor';
import { EditableText } from '../../ui/EditableText';
import { ExportButton, type Column } from '../../ui/ExportButton';
import page from '../Page.module.css';
import { useTicketColumns } from './exports';
import { DeliveryGate, LoadBar, period, sprintOrder, SprintTag, TicketRow } from './parts';
import styles from './Delivery.module.css';

/** Fiche d'un sprint : objectif, dates, capacité, tickets par étape, revue et rétrospective, clôture. */
export function SprintPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { settings, sprints, tickets, releases } = useDelivery();
  const canEdit = useCanEdit();
  const [closing, setClosing] = useState(false);
  const [moveTo, setMoveTo] = useState('');
  const [error, setError] = useState('');
  const sprint = sprints.find(s => s.id === id);
  const ticketColumns = useTicketColumns();
  if (!sprint)
    return (
      <DeliveryGate>
        <div className={page.page}>
          Sprint introuvable. <Link to="/realisation/sprints">Retour aux sprints</Link>
        </div>
      </DeliveryGate>
    );
  const set = (patch: Parameters<typeof delivery.updateSprint>[1]) => delivery.updateSprint(sprint.id, patch);
  const items = tickets.filter(t => t.sprint === sprint.id).sort(byRank);
  const carried = tickets.filter(t => sprint.carried.includes(t.id));
  const p = progress(settings, items);
  const open = items.filter(t => !isDone(settings, t));
  const next = sprints.filter(s => s.status === 'planned' && s.id !== sprint.id).sort(sprintOrder);
  const categoryOf = (t: (typeof items)[number]) =>
    settings.delivery.workflow.find(s => s.id === t.status)?.category ?? 'todo';
  // Export : les sections de la fiche dans leur ordre (à faire, en cours, terminé), puis les reportés.
  const exported = [
    ...(['todo', 'doing', 'done'] as const).flatMap(cat =>
      items.filter(t => categoryOf(t) === cat).map(t => ({ t, group: STEP_CATEGORY_LABEL[cat] })),
    ),
    ...carried.map(t => ({ t, group: 'Reporté à la clôture' })),
  ];
  type Row = (typeof exported)[number];
  const columns: Column<Row>[] = [
    ['Section', r => r.group],
    ...ticketColumns.map(([h, get]): Column<Row> => [h, r => get(r.t)]),
  ];
  const run = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? (e.message ?? e.code) : 'Erreur réseau, réessayez.');
    }
  };
  const field = (label: string, node: ReactNode) => (
    <div style={{ display: 'contents' }}>
      <span className={page.propLabel}>{label}</span>
      <div className={page.propValue}>{node}</div>
    </div>
  );

  return (
    <DeliveryGate>
      <div className={`${page.page} ${page.wide}`}>
        <nav className={page.crumbs} aria-label="Fil d’Ariane">
          <Link to="/realisation/sprints">Sprints</Link> / <span>{sprint.name}</span>
          <span className={page.actions}>
            <ExportButton
              name={sprint.name.toLowerCase().replace(/\s+/g, '-')}
              rows={exported}
              columns={columns}
              noun="tickets"
            />
            {canEdit ? (
              <>
                {sprint.status === 'planned' ? (
                  <button
                    type="button"
                    className={page.primary}
                    onClick={() => void run(() => delivery.startSprint(sprint.id))}
                  >
                    Démarrer le sprint
                  </button>
                ) : null}
                {sprint.status === 'active' ? (
                  <button type="button" className={page.primary} onClick={() => setClosing(true)}>
                    Clôturer le sprint
                  </button>
                ) : null}
                <button
                  type="button"
                  className={`${page.ghost} ${page.danger}`}
                  onClick={async () => {
                    if (!confirm(`Supprimer ${sprint.name} ? Ses tickets retournent au backlog.`)) return;
                    await delivery.deleteSprint(sprint.id);
                    navigate('/realisation/sprints');
                  }}
                >
                  Supprimer
                </button>
              </>
            ) : null}
          </span>
        </nav>
        {error ? <p className={styles.missing}>{error}</p> : null}

        {closing ? (
          <div className={styles.import}>
            <p>
              <strong>Clôturer {sprint.name}</strong> : {p.doneCount} ticket{p.doneCount > 1 ? 's' : ''}{' '}
              terminé
              {p.doneCount > 1 ? 's' : ''} ({amount(p.done, settings)}), {open.length} non terminé
              {open.length > 1 ? 's' : ''}.
            </p>
            {open.length ? (
              <label className={styles.inline}>
                Les tickets non terminés vont dans
                <select className={styles.filter} value={moveTo} onChange={e => setMoveTo(e.target.value)}>
                  <option value="">le backlog</option>
                  {next.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <p className={page.actions}>
              <button type="button" className={page.ghost} onClick={() => setClosing(false)}>
                Annuler
              </button>
              <button
                type="button"
                className={page.primary}
                onClick={() =>
                  void run(async () => {
                    await delivery.closeSprint(sprint.id, moveTo);
                    setClosing(false);
                  })
                }
              >
                Clôturer
              </button>
            </p>
          </div>
        ) : null}

        <p className={page.kicker}>
          {sprint.id} · <SprintTag sprint={sprint} />
        </p>
        <EditableText
          variant="title"
          value={sprint.name}
          label="Nom du sprint"
          multiline={false}
          onChange={name => set({ name })}
        />
        <div className={page.props}>
          {field(
            'Objectif',
            <EditableText
              variant="inline"
              value={sprint.goal}
              label="Objectif du sprint"
              placeholder="Ce que le sprint doit permettre"
              onChange={goal => set({ goal })}
            />,
          )}
          {field(
            'Dates',
            <span className={styles.dates}>
              <input
                type="date"
                value={sprint.start ?? ''}
                disabled={!canEdit}
                aria-label="Début"
                onChange={e => set({ start: e.target.value || null })}
              />
              →
              <input
                type="date"
                value={sprint.end ?? ''}
                disabled={!canEdit}
                aria-label="Fin"
                onChange={e => set({ end: e.target.value || null })}
              />
              {sprint.status === 'active' ? (
                <span className={page.faint}>
                  {workdaysLeft(sprint.end, undefined, sprint.start)} jours ouvrés restants
                </span>
              ) : null}
            </span>,
          )}
          {settings.delivery.estimation !== 'none'
            ? field(
                'Capacité',
                <span className={styles.dates}>
                  <input
                    className={styles.estimate}
                    style={{ width: 90 }}
                    type="number"
                    min={0}
                    disabled={!canEdit}
                    value={sprint.capacity ?? ''}
                    placeholder="?"
                    aria-label="Capacité"
                    onChange={e => set({ capacity: e.target.value === '' ? null : Number(e.target.value) })}
                  />
                  <LoadBar value={p.total} max={sprint.capacity} label="Charge et capacité" />
                </span>,
              )
            : null}
          {field(
            'Version',
            <select
              className={styles.filter}
              value={sprint.release}
              disabled={!canEdit}
              onChange={e => set({ release: e.target.value })}
            >
              <option value="">Aucune</option>
              {releases.map(r => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>,
          )}
          {field('Période', <span>{period(sprint)}</span>)}
          {sprint.status === 'closed'
            ? field('Vélocité', <span>{amount(sprint.velocity ?? 0, settings)}</span>)
            : field(
                'Avancement',
                <span>
                  {p.doneCount}/{p.count} tickets · {amount(p.done, settings)} sur {amount(p.total, settings)}
                </span>,
              )}
        </div>

        {(['todo', 'doing', 'done'] as const).map(cat => {
          const list = items.filter(
            t =>
              settings.delivery.workflow.find(s => s.id === t.status)?.category === cat ||
              (cat === 'todo' && !settings.delivery.workflow.some(s => s.id === t.status)),
          );
          return (
            <section key={cat}>
              <h2 className={page.h2}>
                {STEP_CATEGORY_LABEL[cat]} ({list.length})
              </h2>
              <div className={styles.rows}>
                {list.map(t => (
                  <TicketRow key={t.id} ticket={t} />
                ))}
              </div>
            </section>
          );
        })}
        {carried.length ? (
          <section>
            <h2 className={page.h2}>Reportés à la clôture ({carried.length})</h2>
            <div className={styles.rows}>
              {carried.map(t => (
                <TicketRow key={t.id} ticket={t} />
              ))}
            </div>
          </section>
        ) : null}

        <h2 className={page.h2}>Revue de sprint</h2>
        <BlockEditor
          blocks={sprint.review}
          onChange={review => set({ review })}
          placeholder="Ce qui a été montré, retours des parties prenantes"
        />
        <h2 className={page.h2}>Rétrospective</h2>
        <BlockEditor
          blocks={sprint.retro}
          onChange={retro => set({ retro })}
          placeholder="Ce qui a bien marché, ce qui est à améliorer, actions"
        />
      </div>
    </DeliveryGate>
  );
}
