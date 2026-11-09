import { useEffect, useId, useRef, useState } from 'react';
import { TONES, canonicalLabels, fold, labelTone, labelsOf, type Ticket, type Tone } from '@board/shared';
import { ApiError } from '../../model/api';
import { delivery, useDelivery } from '../../model/delivery';
import { useCanEdit } from '../../model/store';
import { Popover } from '../../ui/Popover';
import { Tag } from '../../ui/Tag';
import page from '../Page.module.css';
import styles from './Delivery.module.css';

const TONE_NAME: Record<Tone, string> = {
  gray: 'Gris',
  brown: 'Brun',
  orange: 'Orange',
  yellow: 'Jaune',
  green: 'Vert',
  blue: 'Bleu',
  purple: 'Violet',
  pink: 'Rose',
  red: 'Rouge',
};

/** Une étiquette, dans la couleur choisie pour le projet. */
export function LabelTag({ label }: { label: string }) {
  const { settings } = useDelivery();
  return <Tag value={label} tone={labelTone(settings, label)} />;
}

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
          <LabelTag label={l} />
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

/** Une ligne du panneau : renommer en validant le champ, choisir la couleur. */
function LabelLine({
  label,
  count,
  known,
  onRenamed,
  onError,
}: {
  label: string;
  count: number;
  known: string[];
  onRenamed: (from: string, to: string) => void;
  onError: (message: string) => void;
}) {
  const { settings } = useDelivery();
  const [name, setName] = useState(label);
  // Dernière saisie : le panneau peut se fermer avant que le champ perde le focus.
  const typed = useRef(label);
  const type = (value: string) => {
    typed.current = value;
    setName(value);
  };
  const fail = (e: unknown) =>
    onError(e instanceof ApiError ? e.message : 'Modification impossible, réessayez.');
  const rename = async () => {
    const to = typed.current.trim().replace(/\s+/g, ' ');
    type(label);
    if (!to || to === label) return;
    const other = known.find(l => l !== label && fold(l) === fold(to));
    if (other && !confirm(`« ${other} » existe déjà. Fusionner « ${label} » avec elle ?`)) return;
    setName(to);
    try {
      onRenamed(label, await delivery.renameLabel(label, to));
    } catch (e) {
      setName(label);
      fail(e);
    }
  };
  // Cliquer hors du panneau valide la saisie, comme quitter le champ ; Échap l'annule.
  useEffect(() => () => void rename(), []);
  return (
    <li className={styles.labelLine}>
      <LabelTag label={label} />
      <input
        className={styles.filter}
        value={name}
        maxLength={40}
        aria-label={`Renommer ${label}`}
        onChange={e => type(e.target.value)}
        onBlur={() => void rename()}
        onKeyDown={e => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') type(label);
        }}
      />
      <select
        className={styles.filter}
        value={settings.delivery.labelColors[label] ?? ''}
        aria-label={`Couleur de ${label}`}
        onChange={e => void delivery.colorLabel(label, (e.target.value || null) as Tone | null).catch(fail)}
      >
        <option value="">Automatique</option>
        {TONES.map(t => (
          <option key={t} value={t}>
            {TONE_NAME[t]}
          </option>
        ))}
      </select>
      <span className={page.faint}>{count}</span>
    </li>
  );
}

/** Panneau de gestion des étiquettes du projet : renommer, fusionner, choisir la couleur. */
export function ManageLabels({ onRenamed }: { onRenamed: (from: string, to: string) => void }) {
  const { tickets } = useDelivery();
  const canEdit = useCanEdit();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const known = labelsOf(tickets);
  if (!canEdit || !known.length) return null;
  return (
    <div className={styles.labelManage}>
      <button type="button" className={page.ghost} aria-expanded={open} onClick={() => setOpen(o => !o)}>
        Gérer les étiquettes
      </button>
      <Popover open={open} onClose={() => setOpen(false)} width={Math.min(440, window.innerWidth - 16)}>
        <ul className={styles.labelLines}>
          {known.map(l => (
            <LabelLine
              key={l}
              label={l}
              count={tickets.filter(t => t.labels.includes(l)).length}
              known={known}
              onRenamed={onRenamed}
              onError={setError}
            />
          ))}
        </ul>
        {error ? (
          <p className={page.faint} role="alert">
            {error}
          </p>
        ) : null}
      </Popover>
    </div>
  );
}
