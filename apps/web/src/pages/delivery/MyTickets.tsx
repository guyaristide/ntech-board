import { Link } from 'react-router-dom';
import { byRank, isDone } from '@board/shared';
import { useDelivery } from '../../model/delivery';
import { ExportButton } from '../../ui/ExportButton';
import page from '../Page.module.css';
import { useTicketColumns } from './exports';
import { useMyParties } from './fields';
import { DeliveryGate, sprintOrder, TicketRow } from './parts';
import styles from './Delivery.module.css';

/**
 * Mes tickets : ceux attribués à ma fiche de personne ou à un rôle que je tiens, à faire d'abord,
 * regroupés par sprint. La fiche de personne est reliée au compte dans Parties prenantes.
 */
export function MyTickets() {
  const { settings, sprints, tickets } = useDelivery();
  const mine = useMyParties();
  const list = tickets.filter(t => mine.includes(t.assignee));
  const open = list.filter(t => !isDone(settings, t));
  const groups = [
    ...[...sprints]
      .sort(sprintOrder)
      .filter(s => s.status !== 'closed')
      .map(s => ({ key: s.id, title: s.name, items: open.filter(t => t.sprint === s.id) })),
    {
      key: 'backlog',
      title: 'Backlog',
      items: open.filter(t => !t.sprint || !sprints.some(s => s.id === t.sprint && s.status !== 'closed')),
    },
  ].filter(g => g.items.length);
  const done = list.filter(t => isDone(settings, t));
  const columns = useTicketColumns();
  // Export : à mener par sprint, puis terminés, dans l'ordre de l'écran.
  const exported = [...groups.flatMap(g => [...g.items].sort(byRank)), ...[...done].sort(byRank)];
  return (
    <DeliveryGate>
      <div className={`${page.page} ${page.wide}`}>
        <span className={page.icon} aria-hidden="true">
          🙋
        </span>
        <h1 className={page.h1}>Mes tickets</h1>
        {!mine.length ? (
          <div className={page.emptyState}>
            <strong>Votre compte n’est relié à aucune fiche de personne</strong>
            <p>
              Les tickets attribués à votre fiche, ou aux rôles que vous tenez, apparaîtront ici. Un
              administrateur relie votre fiche à votre compte dans Parties prenantes, onglet Personnes,
              colonne Compte.
            </p>
            <Link to="/parties?vue=person" className={page.outline}>
              Ouvrir les parties prenantes
            </Link>
          </div>
        ) : (
          <>
            <p className={page.lead}>
              {open.length} ticket{open.length > 1 ? 's' : ''} à mener, {done.length} terminé
              {done.length > 1 ? 's' : ''}.
            </p>
            <p className={page.actions}>
              <ExportButton name="mes-tickets" rows={exported} columns={columns} noun="tickets" />
            </p>
          </>
        )}
        {groups.map(g => (
          <section key={g.key} className={styles.lane}>
            <header className={styles.laneHead}>
              <span className={styles.laneTitle}>{g.title}</span>
              <span className={page.faint}>{g.items.length}</span>
            </header>
            {g.items.sort(byRank).map(t => (
              <TicketRow key={t.id} ticket={t} />
            ))}
          </section>
        ))}
        {done.length ? (
          <details className={styles.lane}>
            <summary className={styles.laneHead}>Terminés ({done.length})</summary>
            {done.sort(byRank).map(t => (
              <TicketRow key={t.id} ticket={t} />
            ))}
          </details>
        ) : null}
      </div>
    </DeliveryGate>
  );
}
