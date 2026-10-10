import { useState } from 'react';
import { Popover } from '../../ui/Popover';
import { Tag } from '../../ui/Tag';
import styles from './Backlog.module.css';

/** Filtre multi-valeurs d'une propriété, présenté comme une puce de filtre Notion. */
export function FilterButton({
  label,
  options,
  selected,
  onChange,
  render = v => v,
}: {
  label: string;
  options: { value: string; count: number }[];
  selected: string[];
  onChange: (values: string[]) => void;
  render?: (v: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  return (
    <div className={styles.filterRoot}>
      <button
        type="button"
        className={styles.filter}
        data-on={selected.length > 0 || undefined}
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        {label}
        {selected.length
          ? `: ${selected.length > 1 ? `${selected.length} valeurs` : render(selected[0])}`
          : ''}{' '}
        ▾
      </button>
      <Popover open={open} onClose={() => setOpen(false)}>
        <ul className={styles.filterList}>
          {options.map(o => (
            <li key={o.value}>
              <label>
                <input
                  type="checkbox"
                  checked={selected.includes(o.value)}
                  onChange={() => toggle(o.value)}
                />
                <Tag value={o.value}>{render(o.value)}</Tag>
                <span className={styles.filterCount}>{o.count}</span>
              </label>
            </li>
          ))}
        </ul>
        {selected.length ? (
          <button type="button" className={styles.filterClear} onClick={() => onChange([])}>
            Effacer le filtre
          </button>
        ) : null}
      </Popover>
    </div>
  );
}
