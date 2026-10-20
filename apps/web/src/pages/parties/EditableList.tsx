import { useState } from 'react';
import page from '../Page.module.css';
import styles from './Parties.module.css';

/** Liste ordonnée de libellés modifiables (étapes, types). */
export function EditableList<T extends { id: string; name: string }>({
  items,
  onChange,
  extra,
  add,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  extra?: (item: T, set: (patch: Partial<T>) => void) => React.ReactNode;
  add: (name: string) => T;
}) {
  const [draft, setDraft] = useState('');
  const set = (i: number, patch: Partial<T>) =>
    onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: number) => {
    const next = [...items];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  return (
    <div className={styles.list}>
      {items.map((item, i) => (
        <div key={item.id} className={styles.listRow}>
          <input
            type="text"
            value={item.name}
            aria-label="Libellé"
            onChange={e => set(i, { name: e.target.value } as Partial<T>)}
          />
          {extra?.(item, patch => set(i, patch))}
          <button
            type="button"
            className={page.ghost}
            disabled={!i}
            onClick={() => move(i, -1)}
            aria-label="Monter"
          >
            ↑
          </button>
          <button
            type="button"
            className={page.ghost}
            disabled={i === items.length - 1}
            onClick={() => move(i, 1)}
            aria-label="Descendre"
          >
            ↓
          </button>
          <button
            type="button"
            className={`${page.ghost} ${page.danger}`}
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            aria-label="Retirer"
          >
            ✕
          </button>
        </div>
      ))}
      <form
        className={styles.listRow}
        onSubmit={e => {
          e.preventDefault();
          if (!draft.trim()) return;
          onChange([...items, add(draft.trim())]);
          setDraft('');
        }}
      >
        <input
          type="text"
          value={draft}
          placeholder="Ajouter…"
          aria-label="Ajouter"
          onChange={e => setDraft(e.target.value)}
        />
        <button type="submit" className={page.ghost}>
          Ajouter
        </button>
      </form>
    </div>
  );
}
