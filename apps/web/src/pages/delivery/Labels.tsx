import { useId, useState } from 'react';
import { canonicalLabels, labelsOf, type Ticket } from '@board/shared';
import { delivery, useDelivery } from '../../model/delivery';
import { useCanEdit } from '../../model/store';
import { Tag } from '../../ui/Tag';
import styles from './Delivery.module.css';

/** Saisie d'une étiquette : propose celles du projet, ou en crée une nouvelle avec Entrée. */
export function LabelInput({ onAdd }: { onAdd: (label: string) => void }) {
  const { tickets } = useDelivery();
  const list = useId();
  const [value, setValue] = useState('');
  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        const [label] = canonicalLabels([value], labelsOf(tickets));
        if (label) onAdd(label);
        setValue('');
      }}
    >
      <input
        className={`${styles.filter} ${styles.labelInput}`}
        list={list}
        maxLength={40}
        value={value}
        placeholder="Étiquette, puis Entrée"
        aria-label="Ajouter une étiquette"
        onChange={e => setValue(e.target.value)}
      />
      <datalist id={list}>
        {labelsOf(tickets).map(l => (
          <option key={l} value={l} />
        ))}
      </datalist>
    </form>
  );
}

/** Étiquettes d'un ticket, sur sa fiche. */
export function TicketLabels({ ticket }: { ticket: Ticket }) {
  const canEdit = useCanEdit();
  const set = (labels: string[]) => delivery.updateTicket(ticket.id, { labels });
  return (
    <span className={styles.labels}>
      {ticket.labels.map(l => (
        <span key={l} className={styles.labels}>
          <Tag value={l} />
          {canEdit ? (
            <button
              type="button"
              className={styles.labelRemove}
              aria-label={`Retirer l’étiquette ${l}`}
              onClick={() => set(ticket.labels.filter(x => x !== l))}
            >
              ×
            </button>
          ) : null}
        </span>
      ))}
      {canEdit ? (
        <LabelInput onAdd={l => set(canonicalLabels([...ticket.labels, l], ticket.labels))} />
      ) : !ticket.labels.length ? (
        '—'
      ) : null}
    </span>
  );
}
