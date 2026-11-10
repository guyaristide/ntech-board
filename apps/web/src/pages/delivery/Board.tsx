import { useState, type DragEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  amount,
  byRank,
  isBlocked,
  isReady,
  load,
  rankAt,
  stepOf,
  type Ticket,
  type WorkflowStep,
} from '@board/shared';
import { delivery, useDelivery } from '../../model/delivery';
import { useCanEdit, useWorkspace } from '../../model/store';
import { ExportButton } from '../../ui/ExportButton';
import { Tag } from '../../ui/Tag';
import page from '../Page.module.css';
import backlog from '../backlog/Backlog.module.css';
import { useTicketColumns } from './exports';
import { assigneeName, useMyParties } from './fields';
import { LabelTag } from './Labels';
import { DeliveryGate, period, sprintOrder, SprintTag } from './parts';
import { TicketFilters, useTicketFilters } from './TicketFilters';
import styles from './Delivery.module.css';
import k from './Tickets.module.css';

const DRAG = 'application/x-ticket';

/** Carte d'un ticket sur le tableau. */
function Card({ ticket, onDrop }: { ticket: Ticket; onDrop: (e: DragEvent) => void }) {
  const parties = useWorkspace(s => s.parties);
  const { settings, tickets } = useDelivery();
  const canEdit = useCanEdit();
  const [over, setOver] = useState(false);
  const type = settings.delivery.ticketTypes.find(t => t.id === ticket.type);
  const blocked = isBlocked(settings, tickets, ticket);
  return (
    <div
      className={k.card}
      data-over={over || undefined}
      draggable={canEdit}
      onDragStart={e => {
        e.dataTransfer.setData(DRAG, ticket.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={e => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={e => {
        setOver(false);
        onDrop(e);
      }}
    >
      <Link to={`/realisation/ticket/${ticket.id}`} className={k.title}>
        {ticket.title || 'Sans titre'}
      </Link>
      <span className={k.meta}>
        <span className={styles.key}>{ticket.id}</span>
        <span>{type?.name ?? ticket.type}</span>
        {ticket.parent ? <span title="Sous-tâche de">↳ {ticket.parent}</span> : null}
        {ticket.estimate !== null && settings.delivery.estimation !== 'none' ? (
          <span>{amount(ticket.estimate, settings)}</span>
        ) : null}
        {blocked ? <Tag value="Bloqué" tone="red" /> : null}
        {ticket.labels.map(l => (
          <LabelTag key={l} label={l} />
        ))}
      </span>
      {ticket.assignee ? <span className={k.assignee}>{assigneeName(parties, ticket.assignee)}</span> : null}
    </div>
  );
}

/** Colonne d'une étape : déposer une carte change son étape (et son rang si déposée sur une carte). */
export function Column({ step, tickets }: { step: WorkflowStep; tickets: Ticket[] }) {
  const { settings } = useDelivery();
  const canEdit = useCanEdit();
  const [over, setOver] = useState(false);
  const list = [...tickets].sort(byRank);
  const drop = (e: DragEvent, before: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    setOver(false);
    const id = e.dataTransfer.getData(DRAG);
    if (id) delivery.updateTicket(id, { status: step.id, rank: rankAt(list, before, id) });
  };
  const total = load(list).total;
  return (
    <section
      className={k.column}
      data-over={over || undefined}
      data-category={step.category}
      onDragOver={e => {
        if (!canEdit) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={e => drop(e, null)}
    >
      <header className={k.head}>
        <strong>{step.name}</strong>
        <span className={page.faint}>
          {list.length}
          {total && settings.delivery.estimation !== 'none' ? ` · ${amount(total, settings)}` : ''}
        </span>
      </header>
      {list.map(t => (
        <Card key={t.id} ticket={t} onDrop={e => drop(e, t.id)} />
      ))}
      {!list.length ? <p className={k.columnEmpty}>Aucun ticket</p> : null}
    </section>
  );
}

/**
 * Tableau du sprint : une colonne par étape des réglages ; on fait avancer un ticket en le glissant.
 * Filtres : sprint, responsable (dont « mes tickets »), type, bloqués.
 */
export function Board() {
  const parties = useWorkspace(s => s.parties);
  const { settings, sprints, tickets, releases } = useDelivery();
  const mine = useMyParties();
  const [params, setParams] = useSearchParams();
  const ordered = sprints.filter(s => s.status !== 'closed').sort(sprintOrder);
  const sprintId = params.get('sprint') ?? ordered[0]?.id ?? '';
  const sprint = sprints.find(s => s.id === sprintId);
  const who = params.get('responsable') ?? '';
  const type = params.get('type') ?? '';
  const blockedOnly = params.has('bloques');
  const q = params.get('q') ?? '';
  const version = params.get('version') ?? '';
  const ready = params.get('pret') ?? '';
  const unestimatedOnly = params.has('non_estimes');
  const estimated = settings.delivery.estimation !== 'none';
  const put = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };
  const filters = useTicketFilters();
  const inSprint = tickets.filter(t => t.sprint === sprintId);
  const shown = inSprint.filter(
    t =>
      (!who ||
        (who === 'moi' ? mine.includes(t.assignee) : who === 'aucun' ? !t.assignee : t.assignee === who)) &&
      (!type || t.type === type) &&
      (!blockedOnly || isBlocked(settings, tickets, t)) &&
      (!version || (version === 'aucune' ? !t.release : t.release === version)) &&
      (!ready || isReady(settings, t) === (ready === 'oui')) &&
      (!unestimatedOnly || t.estimate === null) &&
      filters.search(t, q) &&
      filters.matches(t),
  );
  const assignees = [...new Set(inSprint.map(t => t.assignee).filter(Boolean))];
  const versions = releases.filter(r => inSprint.some(t => t.release === r.id));
  const narrowed = !!(
    who ||
    type ||
    blockedOnly ||
    q ||
    version ||
    ready ||
    unestimatedOnly ||
    filters.active
  );
  const columns = useTicketColumns();
  // Export : colonne par colonne, dans l'ordre du tableau.
  const exported = sprint
    ? settings.delivery.workflow.flatMap(step =>
        shown.filter(t => stepOf(settings, t.status)?.id === step.id).sort(byRank),
      )
    : [];

  return (
    <DeliveryGate>
      <div className={`${page.page} ${page.wide}`}>
        <span className={page.icon} aria-hidden="true">
          📋
        </span>
        <h1 className={page.h1}>Tableau du sprint</h1>
        {sprint ? (
          <p className={page.lead}>
            <Link to={`/realisation/sprint/${sprint.id}`}>{sprint.name}</Link> <SprintTag sprint={sprint} /> ·{' '}
            {period(sprint)}
            {sprint.goal ? ` · ${sprint.goal}` : ''}
          </p>
        ) : (
          <p className={page.lead}>
            Aucun sprint ouvert. Créez-en un dans <Link to="/realisation">Backlog de réalisation</Link>.
          </p>
        )}
        <div className={k.filters}>
          <input
            className={backlog.search}
            style={{ marginLeft: 0 }}
            type="search"
            placeholder="Rechercher un ticket"
            aria-label="Rechercher dans le tableau"
            value={q}
            onChange={e => filters.update(p => (e.target.value ? p.set('q', e.target.value) : p.delete('q')))}
          />
          <select
            className={styles.filter}
            value={sprintId}
            aria-label="Sprint"
            onChange={e => put('sprint', e.target.value)}
          >
            {ordered.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            {sprint && sprint.status === 'closed' ? (
              <option value={sprint.id}>{sprint.name} (clos)</option>
            ) : null}
          </select>
          <select
            className={styles.filter}
            value={who}
            aria-label="Responsable"
            onChange={e => put('responsable', e.target.value)}
          >
            <option value="">Tous les responsables</option>
            <option value="moi" disabled={!mine.length}>
              Mes tickets
            </option>
            <option value="aucun">Non attribués</option>
            {assignees.map(a => (
              <option key={a} value={a}>
                {assigneeName(parties, a)}
              </option>
            ))}
          </select>
          <select
            className={styles.filter}
            value={type}
            aria-label="Type"
            onChange={e => put('type', e.target.value)}
          >
            <option value="">Tous les types</option>
            {settings.delivery.ticketTypes.map(t => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            className={styles.filter}
            value={version}
            aria-label="Version"
            onChange={e => put('version', e.target.value)}
          >
            <option value="">Toutes les versions</option>
            <option value="aucune">Sans version</option>
            {versions.map(r => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <select
            className={styles.filter}
            value={ready}
            aria-label="Prêt"
            onChange={e => put('pret', e.target.value)}
          >
            <option value="">Prêts ou non</option>
            <option value="oui">Prêts</option>
            <option value="non">Pas prêts</option>
          </select>
          {estimated ? (
            <label className={styles.inline}>
              <input
                type="checkbox"
                checked={unestimatedOnly}
                onChange={e => put('non_estimes', e.target.checked ? '1' : null)}
              />
              Non estimés
            </label>
          ) : null}
          <label className={styles.inline}>
            <input
              type="checkbox"
              checked={blockedOnly}
              onChange={e => put('bloques', e.target.checked ? '1' : null)}
            />
            Bloqués seulement
          </label>
          <span className={page.faint}>
            {narrowed ? `${shown.length} sur ${inSprint.length} tickets` : `${inSprint.length} tickets`}
          </span>
          <ExportButton
            name={sprint ? `tableau-${sprint.name.toLowerCase().replace(/\s+/g, '-')}` : 'tableau'}
            rows={exported}
            columns={columns}
            filtered={narrowed}
            noun="tickets"
          />
        </div>
        <TicketFilters
          filters={filters}
          tickets={inSprint}
          others={['q', 'responsable', 'type', 'bloques', 'version', 'pret', 'non_estimes']}
        />
        {sprint ? (
          <div className={k.board}>
            {settings.delivery.workflow.map(step => (
              <Column
                key={step.id}
                step={step}
                tickets={shown.filter(t => stepOf(settings, t.status)?.id === step.id)}
              />
            ))}
          </div>
        ) : null}
      </div>
    </DeliveryGate>
  );
}
