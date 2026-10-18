import { Link } from 'react-router-dom';
import { byRank, isDone } from '@board/shared';
import { useDelivery } from '../../model/delivery';
import page from '../Page.module.css';
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
    ...[...sprints].sort(sprintOrder).filter(s => s.status !== 'closed').map(s => ({ key: s.id, title: s.name, items: open.filter(t => t.sprint === s.id) })),
    { key: 'backlog', title: 'Backlog', items: open.filter(t => !t.sprint || !sprints.some(s => s.id === t.sprint && s.status !== 'closed')) },
  ].filter(g => g.items.length);
  const done = list.filter(t => isDone(settings, t));
  return (
    <DeliveryGate>
      <div className={`${page.page} ${page.wide}`}>
        <span className={page.icon} aria-hidden="true">
          🙋
        </span>
        <h1 className={page.h1}>Mes tickets</h1>
        {!mine.length ? (
          <p className={page.lead}>
            Votre compte n’est relié à aucune fiche de personne. Dans{' '}
            <Link to="/parties?vue=person">Parties prenantes › Personnes</Link>, un administrateur relie votre fiche à votre
            compte (colonne Compte) ; les tickets attribués à votre fiche, ou aux rôles que vous tenez, apparaîtront ici.
          </p>
        ) : (
          <p className={page.lead}>
            {open.length} ticket{open.length > 1 ? 's' : ''} à mener, {done.length} terminé{done.length > 1 ? 's' : ''}.
          </p>
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
