import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  byRank,
  stepOf,
  TICKET_LINK_LABEL,
  TICKET_LINK_TYPES,
  type Ticket,
  type TicketLinkType,
} from '@board/shared';
import { delivery, useDelivery } from '../../model/delivery';
import { useCanEdit } from '../../model/store';
import { Tag } from '../../ui/Tag';
import page from '../Page.module.css';
import { AssigneeSelect } from './fields';
import styles from './Delivery.module.css';
import k from './Tickets.module.css';

/** Ligne courte d'un ticket lié : clé, intitulé, étape. */
function Mini({
  ticket,
  after,
  step: showStep = true,
}: {
  ticket: Ticket;
  after?: ReactNode;
  step?: boolean;
}) {
  const { settings } = useDelivery();
  const step = stepOf(settings, ticket.status);
  return (
    <li className={k.mini}>
      <Link to={`/realisation/ticket/${ticket.id}`} className={styles.key}>
        {ticket.id}
      </Link>
      <span className={k.miniTitle}>{ticket.title || 'Sans titre'}</span>
      {showStep ? (
        <Tag
          value={step?.name ?? ticket.status}
          tone={step?.category === 'done' ? 'green' : step?.category === 'doing' ? 'blue' : 'gray'}
        />
      ) : null}
      {after}
    </li>
  );
}

/** Sous-tâches d'un ticket : création rapide, étape et responsable modifiables sur place. */
export function Subtasks({ ticket }: { ticket: Ticket }) {
  const { settings, tickets } = useDelivery();
  const canEdit = useCanEdit();
  const [title, setTitle] = useState('');
  const children = tickets.filter(t => t.parent === ticket.id).sort(byRank);
  const type =
    settings.delivery.ticketTypes.find(t => t.id === 'subtask')?.id ?? settings.delivery.ticketTypes[0].id;
  return (
    <>
      <h2 className={page.h2}>Sous-tâches ({children.length})</h2>
      <ul className={k.miniList}>
        {children.map(t => (
          <Mini
            key={t.id}
            ticket={t}
            step={false}
            after={
              <>
                <select
                  className={styles.select}
                  value={stepOf(settings, t.status)?.id}
                  disabled={!canEdit}
                  aria-label={`Étape de ${t.id}`}
                  onChange={e => delivery.updateTicket(t.id, { status: e.target.value })}
                >
                  {settings.delivery.workflow.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <AssigneeSelect ticket={t} />
              </>
            }
          />
        ))}
      </ul>
      {canEdit ? (
        <form
          className={styles.quickAdd}
          onSubmit={e => {
            e.preventDefault();
            if (!title.trim()) return;
            void delivery.createTicket({ title: title.trim(), parent: ticket.id, type });
            setTitle('');
          }}
        >
          <input
            value={title}
            placeholder="Nouvelle sous-tâche : intitulé, puis Entrée"
            aria-label="Nouvelle sous-tâche"
            onChange={e => setTitle(e.target.value)}
          />
        </form>
      ) : null}
    </>
  );
}

/** Liaisons avec d'autres tickets (bloque, bloqué par, voir aussi, doublon), posées des deux côtés. */
export function TicketLinks({ ticket }: { ticket: Ticket }) {
  const { tickets } = useDelivery();
  const canEdit = useCanEdit();
  const [type, setType] = useState<TicketLinkType>('blockedBy');
  const [query, setQuery] = useState('');
  const byId = new Map(tickets.map(t => [t.id, t]));
  const candidates = tickets.filter(t => t.id !== ticket.id && !ticket.links.some(l => l.ticket === t.id));
  const add = () => {
    const id = query.split(' ')[0].trim().toUpperCase();
    if (!byId.has(id) || id === ticket.id) return;
    void delivery.linkTickets(ticket.id, id, type);
    setQuery('');
  };
  return (
    <>
      <h2 className={page.h2}>Liaisons ({ticket.links.length})</h2>
      {TICKET_LINK_TYPES.map(kind => {
        const items = ticket.links.filter(l => l.type === kind);
        if (!items.length) return null;
        return (
          <div key={kind}>
            <p className={k.linkKind}>{TICKET_LINK_LABEL[kind]}</p>
            <ul className={k.miniList}>
              {items.map(l => {
                const other = byId.get(l.ticket);
                return other ? (
                  <Mini
                    key={l.ticket}
                    ticket={other}
                    after={
                      canEdit ? (
                        <button
                          type="button"
                          className={page.ghost}
                          aria-label={`Retirer la liaison avec ${l.ticket}`}
                          onClick={() => void delivery.unlinkTickets(ticket.id, l.ticket)}
                        >
                          ✕
                        </button>
                      ) : null
                    }
                  />
                ) : null;
              })}
            </ul>
          </div>
        );
      })}
      {canEdit ? (
        <form
          className={k.linkForm}
          onSubmit={e => {
            e.preventDefault();
            add();
          }}
        >
          <select
            className={styles.select}
            value={type}
            aria-label="Nature de la liaison"
            onChange={e => setType(e.target.value as TicketLinkType)}
          >
            {TICKET_LINK_TYPES.map(k => (
              <option key={k} value={k}>
                {TICKET_LINK_LABEL[k]}
              </option>
            ))}
          </select>
          <input
            list="ticket-candidates"
            value={query}
            placeholder="Clé ou intitulé du ticket"
            aria-label="Ticket à lier"
            onChange={e => setQuery(e.target.value)}
          />
          <datalist id="ticket-candidates">
            {candidates.map(t => (
              <option key={t.id} value={`${t.id} · ${t.title}`} />
            ))}
          </datalist>
          <button type="submit" className={page.outline}>
            + Lier
          </button>
        </form>
      ) : null}
    </>
  );
}
