import { partiesOfUser, type Party, type Ticket } from '@board/shared';
import { delivery } from '../../model/delivery';
import { useCanEdit, useWorkspace } from '../../model/store';
import styles from './Delivery.module.css';

/** Nom d'un responsable : personne ou rôle, avec la personne qui tient le rôle. */
export function assigneeName(parties: Party[], id: string) {
  const p = parties.find(x => x.id === id);
  if (!p) return id ? id : '';
  const holder = p.type === 'role' && p.holder ? parties.find(x => x.id === p.holder)?.name : '';
  return holder ? `${p.name} (${holder})` : p.name;
}

/** Parties qui désignent l'utilisateur connecté (sa fiche de personne et ses rôles). */
export const useMyParties = () => {
  const parties = useWorkspace(s => s.parties);
  const userId = useWorkspace(s => s.session?.user?.id ?? null);
  return partiesOfUser(parties, userId);
};

/** Choix du responsable d'un ticket : les personnes et les rôles du référentiel. */
export function AssigneeSelect({ ticket, className }: { ticket: Ticket; className?: string }) {
  const parties = useWorkspace(s => s.parties);
  const canEdit = useCanEdit();
  const group = (type: Party['type']) =>
    parties
      .filter(p => p.type === type && p.name)
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
      .map(p => (
        <option key={p.id} value={p.id}>
          {assigneeName(parties, p.id)}
        </option>
      ));
  return (
    <select
      className={className ?? styles.select}
      value={ticket.assignee}
      disabled={!canEdit}
      aria-label={`Responsable de ${ticket.id}`}
      onChange={e => delivery.updateTicket(ticket.id, { assignee: e.target.value })}
    >
      <option value="">Non attribué</option>
      <optgroup label="Personnes">{group('person')}</optgroup>
      <optgroup label="Rôles">{group('role')}</optgroup>
      {ticket.assignee && !parties.some(p => p.id === ticket.assignee) ? (
        <option value={ticket.assignee}>{ticket.assignee} (supprimé)</option>
      ) : null}
    </select>
  );
}
