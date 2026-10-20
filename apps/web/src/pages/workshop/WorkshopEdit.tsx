import { useState, type ReactNode } from 'react';
import { agendaItems, type AgendaItem, type Session, type Workshop } from '@board/shared';
import { programme } from '../../model/programme';
import { useCanEdit, useWorkspace } from '../../model/store';
import page from '../Page.module.css';
import { SessionCard } from './SessionCard';
import styles from './Workshop.module.css';

/** Champ date ou heure : vide → null. */
const value = (v: string) => v || null;

/** Échéances de l'atelier : PV, livrable, validation. */
export function Deadlines({ w, label }: { w: Workshop; label: (iso: string | null) => string }) {
  const ws = useWorkspace();
  const canEdit = useCanEdit();
  const fields: [keyof Pick<Workshop, 'pvDue' | 'deliverableDue' | 'validationDue'>, string][] = [
    ['pvDue', 'PV'],
    ['deliverableDue', 'Livrable'],
    ['validationDue', 'Validation'],
  ];
  if (!canEdit)
    return (
      <div className={page.propText}>
        {fields
          .filter(([k]) => w[k])
          .map(([k, name]) => `${name} le ${label(w[k])}`)
          .join(' · ') || '—'}
      </div>
    );
  return (
    <div className={`${page.propValue} ${styles.deadlines}`}>
      {fields.map(([k, name]) => (
        <label key={k}>
          {name}
          <input
            type="date"
            value={w[k] ?? ''}
            onChange={e => ws.updateWorkshop(w.id, { [k]: value(e.target.value) })}
          />
        </label>
      ))}
    </div>
  );
}

/** Pause de l'ordre du jour, modifiable par l'équipe. */
function BreakRow({
  item,
  onChange,
}: {
  item: Extract<AgendaItem, { kind: 'break' }>;
  onChange: (b: AgendaItem | null) => void;
}) {
  const canEdit = useCanEdit();
  if (!canEdit)
    return (
      <div className={styles.break}>
        <span className={styles.time}>{item.start ? `${item.start} à ${item.end ?? ''}` : ''}</span>
        <span>{item.title}</span>
      </div>
    );
  return (
    <div className={`${styles.break} ${styles.breakEdit}`}>
      <span className={styles.timeInputs}>
        <input
          type="time"
          aria-label="Début de la pause"
          value={item.start ?? ''}
          onChange={e => onChange({ ...item, start: value(e.target.value) })}
        />
        <input
          type="time"
          aria-label="Fin de la pause"
          value={item.end ?? ''}
          onChange={e => onChange({ ...item, end: value(e.target.value) })}
        />
      </span>
      <span className={styles.breakTitle}>
        <input
          aria-label="Intitulé de la pause"
          value={item.title}
          placeholder="Pause, déjeuner…"
          onChange={e => onChange({ ...item, title: e.target.value })}
        />
        <button
          type="button"
          className={`${page.ghost} ${page.danger}`}
          aria-label="Retirer la pause"
          onClick={() => onChange(null)}
        >
          ✕
        </button>
      </span>
    </div>
  );
}

/** Flèches pour déplacer un élément de l'ordre du jour. */
function Move({
  i,
  n,
  move,
  children,
}: {
  i: number;
  n: number;
  move: (from: number, to: number) => void;
  children: ReactNode;
}) {
  const canEdit = useCanEdit();
  if (!canEdit) return <>{children}</>;
  return (
    <div className={styles.movable}>
      <span className={styles.moveButtons}>
        <button
          type="button"
          className={page.ghost}
          disabled={i === 0}
          aria-label="Monter"
          onClick={() => move(i, i - 1)}
        >
          ↑
        </button>
        <button
          type="button"
          className={page.ghost}
          disabled={i === n - 1}
          aria-label="Descendre"
          onClick={() => move(i, i + 1)}
        >
          ↓
        </button>
      </span>
      <div className={styles.movableBody}>{children}</div>
    </div>
  );
}

/**
 * Déroulé de la journée : séquences et pauses dans l'ordre de l'ordre du jour. L'équipe ajoute,
 * déplace et retire séquences et pauses ; chaque séquence se modifie depuis sa carte.
 */
export function Agenda({ w }: { w: Workshop }) {
  const canEdit = useCanEdit();
  const [opened, setOpened] = useState<string | null>(null);
  const items = agendaItems(w);
  const byCode = new Map(w.sessions.map(s => [s.code, s] as [string, Session]));
  const save = (next: AgendaItem[]) => programme.setAgenda(w.id, next);
  const move = (from: number, to: number) => {
    const next = [...items];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    save(next);
  };
  return (
    <>
      <div className={styles.agenda}>
        {items.map((item, i) => {
          if (item.kind === 'break')
            return (
              <Move key={`b-${i}`} i={i} n={items.length} move={move}>
                <BreakRow
                  item={item}
                  onChange={b => save(items.flatMap((x, j) => (j === i ? (b ? [b] : []) : [x])))}
                />
              </Move>
            );
          const s = byCode.get(item.code);
          return s ? (
            <Move key={s.code} i={i} n={items.length} move={move}>
              <SessionCard
                workshop={w.id}
                session={s}
                editing={opened === s.code}
                onEdit={open => setOpened(open ? s.code : null)}
              />
            </Move>
          ) : null;
        })}
        {!items.length ? <p className={page.faint}>Aucune séquence pour le moment.</p> : null}
      </div>
      {canEdit ? (
        <p className={styles.agendaActions}>
          <button
            type="button"
            className={page.outline}
            onClick={async () => setOpened(await programme.createSession(w.id))}
          >
            + Séquence
          </button>
          <button
            type="button"
            className={page.outline}
            onClick={() => save([...items, { kind: 'break', start: null, end: null, title: 'Pause' }])}
          >
            + Pause
          </button>
        </p>
      ) : null}
    </>
  );
}
