import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { uid } from '../model/ids';
import type { Criterion } from '@board/shared';
import { useCanEdit } from '../model/store';
import { useAutosize } from './useAutosize';
import styles from './Checklist.module.css';

/** Critères d'acceptation : cocher, modifier, Entrée pour ajouter, Retour arrière sur un critère vide pour le retirer. */
export function Checklist({
  items,
  onChange,
  addLabel = 'Ajouter un critère',
}: {
  items: Criterion[];
  onChange: (items: Criterion[]) => void;
  addLabel?: string;
}) {
  const canEdit = useCanEdit();
  const [focus, setFocus] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLTextAreaElement>());
  useEffect(() => {
    if (focus) {
      refs.current.get(focus)?.focus();
      setFocus(null);
    }
  }, [focus, items]);
  const update = (id: string, patch: Partial<Criterion>) =>
    onChange(items.map(c => (c.id === id ? { ...c, ...patch } : c)));
  const add = (index: number) => {
    const c = { id: uid(), text: '', done: false };
    const next = [...items];
    next.splice(index + 1, 0, c);
    onChange(next);
    setFocus(c.id);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>, c: Criterion, index: number) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      add(index);
    } else if (e.key === 'Backspace' && !c.text) {
      e.preventDefault();
      onChange(items.filter(x => x.id !== c.id));
      if (index > 0) setFocus(items[index - 1].id);
    }
  };
  const done = items.filter(c => c.done).length;
  return (
    <div className={styles.list}>
      {items.length ? (
        <div className={styles.progress} aria-label={`${done} critères vérifiés sur ${items.length}`}>
          <span style={{ width: `${(done / items.length) * 100}%` }} />
        </div>
      ) : null}
      {items.map((c, index) => (
        <div key={c.id} className={styles.item}>
          <input
            type="checkbox"
            checked={c.done}
            disabled={!canEdit}
            aria-label="Critère vérifié"
            onChange={e => update(c.id, { done: e.target.checked })}
          />
          <ItemText
            value={c.text}
            done={c.done}
            readOnly={!canEdit}
            register={el => (el ? refs.current.set(c.id, el) : refs.current.delete(c.id))}
            onText={text => update(c.id, { text })}
            onKeyDown={e => onKeyDown(e, c, index)}
          />
        </div>
      ))}
      {canEdit ? (
        <button type="button" className={styles.add} onClick={() => add(items.length - 1)}>
          + {addLabel}
        </button>
      ) : null}
    </div>
  );
}

function ItemText({
  value,
  done,
  readOnly,
  register,
  onText,
  onKeyDown,
}: {
  value: string;
  done: boolean;
  readOnly: boolean;
  register: (el: HTMLTextAreaElement | null) => void;
  onText: (v: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  const ref = useAutosize<HTMLTextAreaElement>(value);
  return (
    <textarea
      ref={el => {
        ref.current = el;
        register(el);
      }}
      rows={1}
      className={styles.text}
      data-done={done || undefined}
      value={value}
      readOnly={readOnly}
      placeholder="Critère d'acceptation"
      aria-label="Critère d'acceptation"
      onChange={e => onText(e.target.value)}
      onKeyDown={onKeyDown}
    />
  );
}
