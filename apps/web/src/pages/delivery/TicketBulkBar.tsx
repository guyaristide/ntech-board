import { useState } from 'react';
import type { Ticket } from '@board/shared';
import { ApiError } from '../../model/api';
import { delivery, useDelivery } from '../../model/delivery';
import { useWorkspace } from '../../model/store';
import { ExportButton, type Column } from '../../ui/ExportButton';
import page from '../Page.module.css';
import backlog from '../backlog/Backlog.module.css';
import { assigneeName } from './fields';
import { sprintOrder } from './parts';
import styles from './Delivery.module.css';

type Field = 'release' | 'sprint' | 'status' | 'assignee' | 'type';
const LABEL: Record<Field, string> = {
  release: 'Version',
  sprint: 'Sprint',
  status: 'Étape',
  assignee: 'Responsable',
  type: 'Type',
};
/** Valeur du choix d'invite : « Sans version », « Backlog »… valent la chaîne vide. */
const PROMPT = '__';

/**
 * Actions groupées sur les tickets cochés : changer la version, le sprint, l'étape, le responsable
 * ou le type d'un coup, exporter la sélection, supprimer.
 */
export function TicketBulkBar({
  tickets,
  columns,
  onClear,
}: {
  tickets: Ticket[];
  columns: Column<Ticket>[];
  onClear: () => void;
}) {
  const { settings, releases, sprints } = useDelivery();
  const parties = useWorkspace(s => s.parties);
  const [note, setNote] = useState('');
  const ids = tickets.map(t => t.id);
  const n = `${ids.length} ticket${ids.length > 1 ? 's' : ''}`;

  const apply = async (field: Field, value: string, label: string) => {
    setNote(`${LABEL[field]} en cours de modification…`);
    try {
      await delivery.updateTickets(ids, { [field]: value });
      setNote(`${LABEL[field]} : « ${label} » pour ${n}.`);
    } catch (e) {
      setNote(e instanceof ApiError ? e.message : 'Modification impossible, réessayez.');
    }
  };
  const remove = async () => {
    if (!confirm(`Supprimer ${n} ? Les US du cadrage ne sont pas supprimées.`)) return;
    try {
      await delivery.deleteTickets(ids);
      onClear();
    } catch {
      setNote('Suppression impossible, réessayez.');
    }
  };
  const people = (type: 'person' | 'role') =>
    parties
      .filter(p => p.type === type && p.name)
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
      .map(p => [p.id, assigneeName(parties, p.id)] as const);

  const choice = (field: Field, options: (readonly [string, string])[], groups?: [string, number][]) => (
    <select
      className={`${styles.filter} ${styles.bulkSelect}`}
      value={PROMPT}
      aria-label={`${LABEL[field]} des tickets sélectionnés`}
      onChange={e => {
        const opt = options.find(o => o[0] === e.target.value);
        if (opt) void apply(field, opt[0], opt[1]);
      }}
    >
      <option value={PROMPT} disabled>
        {LABEL[field]}…
      </option>
      {(groups ? options.slice(0, 1) : options).map(([v, l]) => (
        <option key={v || 'none'} value={v}>
          {l}
        </option>
      ))}
      {groups
        ? groups.map(([label, end], i) => (
            <optgroup key={label} label={label}>
              {options.slice(i ? groups[i - 1][1] : 1, end).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </optgroup>
          ))
        : null}
    </select>
  );

  const persons = people('person');
  const roles = people('role');
  return (
    <div className={backlog.bulk} role="region" aria-label="Actions sur la sélection">
      <strong>
        {n} sélectionné{ids.length > 1 ? 's' : ''}
      </strong>
      {choice('release', [['', 'Sans version'], ...releases.map(r => [r.id, r.name] as const)])}
      {choice('sprint', [
        ['', 'Backlog'],
        ...sprints
          .filter(s => s.status !== 'closed')
          .sort(sprintOrder)
          .map(s => [s.id, s.name] as const),
      ])}
      {choice(
        'status',
        settings.delivery.workflow.map(s => [s.id, s.name] as const),
      )}
      {choice(
        'assignee',
        [['', 'Non attribué'], ...persons, ...roles],
        [
          ['Personnes', 1 + persons.length],
          ['Rôles', 1 + persons.length + roles.length],
        ],
      )}
      {choice(
        'type',
        settings.delivery.ticketTypes.map(t => [t.id, t.name] as const),
      )}
      <ExportButton name="tickets-selection" rows={tickets} columns={columns} label="Exporter la sélection" />
      <button type="button" className={`${page.ghost} ${page.danger}`} onClick={() => void remove()}>
        Supprimer
      </button>
      <button type="button" className={page.ghost} onClick={onClear}>
        Désélectionner
      </button>
      {note ? (
        <span className={page.faint} role="status">
          {note}
        </span>
      ) : null}
    </div>
  );
}
