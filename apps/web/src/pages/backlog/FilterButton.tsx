import { useState } from 'react';
import { matchesWords, type Tone } from '@board/shared';
import { Popover } from '../../ui/Popover';
import { Tag } from '../../ui/Tag';
import styles from './Backlog.module.css';

/** Au-delà, la liste se parcourt mal : un champ permet de la réduire. */
const SEARCH_FROM = 8;

/** Filtre multi-valeurs d'une propriété, présenté comme une puce de filtre Notion. */
export function FilterButton({
  label,
  options,
  selected,
  onChange,
  render = v => v,
  tone,
}: {
  label: string;
  options: { value: string; count: number }[];
  selected: string[];
  onChange: (values: string[]) => void;
  render?: (v: string) => string;
  /** Couleur d'une valeur, si le projet l'a choisie ; sinon elle se déduit de la valeur. */
  tone?: (v: string) => Tone;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  const close = () => {
    setOpen(false);
    setTerm('');
  };
  const found = options.filter(o => matchesWords(render(o.value) || 'Vide', term));
  const shown = term ? found : options;
  const unchecked = found.filter(o => !selected.includes(o.value));
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
      <Popover open={open} onClose={close}>
        {options.length >= SEARCH_FROM ? (
          <input
            type="search"
            className={styles.filterSearch}
            placeholder="Chercher une valeur…"
            aria-label={`Chercher dans ${label}`}
            autoFocus
            value={term}
            onChange={e => setTerm(e.target.value)}
          />
        ) : null}
        {term && unchecked.length > 1 ? (
          <button
            type="button"
            className={styles.filterAll}
            onClick={() => onChange([...selected, ...unchecked.map(o => o.value)])}
          >
            Tout cocher ({unchecked.length})
          </button>
        ) : null}
        {term && !found.length ? <p className={styles.filterNone}>Aucune valeur</p> : null}
        <ul className={styles.filterList}>
          {shown.map(o => (
            <li key={o.value}>
              <label>
                <input
                  type="checkbox"
                  checked={selected.includes(o.value)}
                  onChange={() => toggle(o.value)}
                />
                <Tag value={o.value} tone={o.value ? tone?.(o.value) : undefined}>
                  {render(o.value)}
                </Tag>
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
