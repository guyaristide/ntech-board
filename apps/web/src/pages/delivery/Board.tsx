import { useState, type DragEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  amount,
  byRank,
  isBlocked,
  load,
  rankAt,
  stepOf,
  type Ticket,
  type WorkflowStep,
} from '@board/shared';
import { delivery, useDelivery } from '../../model/delivery';
import { useCanEdit, useWorkspace } from '../../model/store';
import { Tag } from '../../ui/Tag';
import page from '../Page.module.css';
import { assigneeName, useMyParties } from './fields';
import { DeliveryGate, period, sprintOrder, SprintTag } from './parts';
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
      </span>
      {ticket.assignee ? <span className={k.assignee}>{assigneeName(parties, ticket.assignee)}</span> : null}
    </div>
  );
}

/** Colonne d'une étape : déposer une carte change son étape (et son rang si déposée sur une carte). */
function Column({ step, tickets }: { step: WorkflowStep; tickets: Ticket[] }) {
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
  const { settings, sprints, tickets } = useDelivery();
  const mine = useMyParties();
  const [params, setParams] = useSearchParams();
  const ordered = sprints.filter(s => s.status !== 'closed').sort(sprintOrder);
  const sprintId = params.get('sprint') ?? ordered[0]?.id ?? '';
  const sprint = sprints.find(s => s.id === sprintId);
  const who = params.get('responsable') ?? '';
  const type = params.get('type') ?? '';
  const blockedOnly = params.has('bloques');
  const put = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };
  const inSprint = tickets.filter(t => t.sprint === sprintId);
  const shown = inSprint.filter(
    t =>
      (!who ||
        (who === 'moi' ? mine.includes(t.assignee) : who === 'aucun' ? !t.assignee : t.assignee === who)) &&
      (!type || t.type === type) &&
      (!blockedOnly || isBlocked(settings, tickets, t)),
  );
  const assignees = [...new Set(inSprint.map(t => t.assignee).filter(Boolean))];

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
          <label className={styles.inline}>
            <input
              type="checkbox"
              checked={blockedOnly}
              onChange={e => put('bloques', e.target.checked ? '1' : null)}
            />
            Bloqués seulement
          </label>
          <span className={page.faint}>
            {shown.length} ticket{shown.length > 1 ? 's' : ''}
          </span>
        </div>
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
