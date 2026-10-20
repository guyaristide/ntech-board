import { Link } from 'react-router-dom';
import { amount, stepOf, type Story } from '@board/shared';
import { delivery, useDelivery } from '../../model/delivery';
import { useCanEdit, useSeesDelivery } from '../../model/store';
import { Tag } from '../../ui/Tag';
import page from '../Page.module.css';
import styles from './Delivery.module.css';

/**
 * Volet « Réalisation » d'une US, pour qui voit cette partie : son ticket (étape, sprint, version,
 * estimation), ou le bouton qui la passe en réalisation.
 */
export function StoryDelivery({ story }: { story: Story }) {
  const sees = useSeesDelivery();
  const canEdit = useCanEdit();
  const { settings, tickets, sprints, releases } = useDelivery();
  if (!sees) return null;
  const ticket = tickets.find(t => t.story === story.id);
  if (!ticket)
    return canEdit && story.status !== 'Écartée' ? (
      <p className={page.actions} style={{ justifyContent: 'flex-start', margin: '8px 0' }}>
        <span className={page.faint}>Réalisation</span>
        <button type="button" className={page.ghost} onClick={() => void delivery.addStories([story.id])}>
          ⇢ Passer en réalisation
        </button>
        {story.status !== 'Validée' ? <span className={page.faint}>US pas encore validée</span> : null}
      </p>
    ) : null;
  const sprint = sprints.find(s => s.id === ticket.sprint);
  const release = releases.find(r => r.id === ticket.release);
  const step = stepOf(settings, ticket.status);
  return (
    <p className={styles.versions} style={{ margin: '8px 0', fontSize: 14 }}>
      <span className={page.faint}>Réalisation</span>
      <span className={styles.key}>{ticket.id}</span>
      <Tag
        value={step?.name ?? ticket.status}
        tone={step?.category === 'done' ? 'green' : step?.category === 'doing' ? 'blue' : 'gray'}
      />
      {sprint ? (
        <Link to={`/realisation/sprint/${sprint.id}`}>{sprint.name}</Link>
      ) : (
        <Link to="/realisation">Backlog de réalisation</Link>
      )}
      {release ? <span>{release.name}</span> : null}
      {ticket.estimate !== null ? <span>{amount(ticket.estimate, settings)}</span> : null}
    </p>
  );
}
