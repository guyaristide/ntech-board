import { type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { isBlocked, stepOf } from '@board/shared';
import { delivery, useDelivery } from '../../model/delivery';
import { useCanEdit, useWorkspace } from '../../model/store';
import { BlockEditor } from '../../ui/BlockEditor';
import { Comments } from '../../ui/Comments';
import { EditableText } from '../../ui/EditableText';
import { History } from '../../ui/History';
import { Tag } from '../../ui/Tag';
import page from '../Page.module.css';
import { AssigneeSelect, useMyParties } from './fields';
import { DeliveryGate, Estimate, Ready, sprintOrder } from './parts';
import { Subtasks, TicketLinks } from './TicketRelations';
import styles from './Delivery.module.css';

/** Fiche d'un ticket : propriétés, description, sous-tâches, liaisons, commentaires, historique. */
export function TicketPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const ws = useWorkspace();
  const { settings, tickets, sprints, releases } = useDelivery();
  const canEdit = useCanEdit();
  const mine = useMyParties();
  const ticket = tickets.find(t => t.id === id);
  if (!ticket)
    return (
      <DeliveryGate>
        <div className={page.page}>
          Ticket introuvable. <Link to="/realisation">Retour au backlog de réalisation</Link>
        </div>
      </DeliveryGate>
    );
  const set = (patch: Parameters<typeof delivery.updateTicket>[1]) => delivery.updateTicket(ticket.id, patch);
  const story = ws.stories.find(s => s.id === ticket.story);
  const parent = tickets.find(t => t.id === ticket.parent);
  const step = stepOf(settings, ticket.status);
  const blocked = isBlocked(settings, tickets, ticket);
  const me = mine[0];
  const select = (value: string, label: string, options: [string, string][], onChange: (v: string) => void) => (
    <select className={styles.filter} value={value} disabled={!canEdit} aria-label={label} onChange={e => onChange(e.target.value)}>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
  const props: [string, ReactNode][] = [
    ['Type', select(ticket.type, 'Type', settings.delivery.ticketTypes.map(t => [t.id, t.name]), type => set({ type }))],
    [
      'Étape',
      <span className={styles.dates}>
        {select(step?.id ?? '', 'Étape', settings.delivery.workflow.map(s => [s.id, s.name]), status => set({ status }))}
        {blocked ? <Tag value="Bloqué" tone="red" /> : null}
      </span>,
    ],
    [
      'Responsable',
      <span className={styles.dates}>
        <AssigneeSelect ticket={ticket} className={styles.filter} />
        {canEdit && me && ticket.assignee !== me ? (
          <button type="button" className={page.ghost} onClick={() => set({ assignee: me })}>
            M’attribuer
          </button>
        ) : null}
      </span>,
    ],
    ...(settings.delivery.estimation !== 'none' ? ([['Estimation', <span className={styles.narrow}><Estimate ticket={ticket} /></span>]] as [string, ReactNode][]) : []),
    ['Prêt', <span className={styles.narrow}><Ready ticket={ticket} /></span>],
    ['Version', select(ticket.release, 'Version', [['', 'Sans version'], ...releases.map(r => [r.id, r.name] as [string, string])], release => set({ release }))],
    [
      'Sprint',
      select(
        ticket.sprint,
        'Sprint',
        [['', 'Backlog'], ...[...sprints].sort(sprintOrder).filter(s => s.status !== 'closed' || s.id === ticket.sprint).map(s => [s.id, s.name] as [string, string])],
        sprint => set({ sprint }),
      ),
    ],
    ...(story
      ? ([
          [
            'US du cadrage',
            <span className={styles.dates}>
              <Link to={`/us/${story.id}`}>{story.id}</Link> {story.title} <Tag value={story.status} />
            </span>,
          ],
        ] as [string, ReactNode][])
      : []),
    ...(parent
      ? ([
          [
            'Ticket parent',
            <span>
              <Link to={`/realisation/ticket/${parent.id}`}>{parent.id}</Link> {parent.title}
            </span>,
          ],
        ] as [string, ReactNode][])
      : []),
  ];

  return (
    <DeliveryGate>
      <div className={page.page}>
        <nav className={page.crumbs} aria-label="Fil d’Ariane">
          <Link to="/realisation">Backlog de réalisation</Link>
          {parent ? (
            <>
              {' '}
              / <Link to={`/realisation/ticket/${parent.id}`}>{parent.id}</Link>
            </>
          ) : null}{' '}
          / <span>{ticket.id}</span>
          {canEdit ? (
            <span className={page.actions}>
              <button
                type="button"
                className={`${page.ghost} ${page.danger}`}
                onClick={async () => {
                  if (!confirm(`Supprimer le ticket ${ticket.id} ?${story ? ` L’US ${story.id} n’est pas supprimée.` : ''}`)) return;
                  await delivery.deleteTicket(ticket.id);
                  navigate(parent ? `/realisation/ticket/${parent.id}` : '/realisation');
                }}
              >
                Supprimer
              </button>
            </span>
          ) : null}
        </nav>
        <p className={page.kicker}>
          {ticket.id} · {settings.delivery.ticketTypes.find(t => t.id === ticket.type)?.name ?? ticket.type}
        </p>
        <EditableText variant="title" value={ticket.title} label="Intitulé du ticket" placeholder="Sans titre" multiline={false} onChange={title => set({ title })} />
        <div className={page.props}>
          {props.map(([label, value]) => (
            <div key={label} style={{ display: 'contents' }}>
              <span className={page.propLabel}>{label}</span>
              <div className={page.propValue}>{value}</div>
            </div>
          ))}
        </div>

        <h2 className={page.h2}>Description</h2>
        <BlockEditor
          blocks={ticket.description}
          onChange={description => set({ description })}
          placeholder={story ? 'Précisions techniques ; le besoin est décrit dans l’US du cadrage.' : 'Ce qu’il faut faire, critère de fin'}
        />

        {ticket.type !== 'subtask' ? <Subtasks ticket={ticket} /> : null}
        <TicketLinks ticket={ticket} />

        <h2 className={page.h2}>Commentaires</h2>
        <Comments
          items={ticket.comments}
          onAdd={text => void delivery.commentTicket(ticket.id, text, ws.session?.user?.name || ws.session?.user?.email || '')}
        />
        <History kind="ticket" id={ticket.id} stamp={ticket.updatedAt} />
      </div>
    </DeliveryGate>
  );
}
