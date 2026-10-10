import { useState, type KeyboardEvent } from 'react';
import { useCanEdit } from '../model/store';
import { Popover } from './Popover';
import { Tag } from './Tag';
import styles from './PropertySelect.module.css';

interface Props {
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  label: string;
  /** Autorise la saisie d'une nouvelle valeur. */
  creatable?: boolean;
  render?: (value: string) => string;
}

/** Sélecteur d'option à la Notion : l'étiquette, un clic, la liste filtrable. */
export function PropertySelect({ value, options, onChange, label, creatable, render = v => v }: Props) {
  const canEdit = useCanEdit();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const q = query.trim().toLowerCase();
  const list = options.filter(o => render(o).toLowerCase().includes(q));
  const canCreate = creatable && q && !options.some(o => o.toLowerCase() === q);
  const items = canCreate ? [...list, query.trim()] : list;
  const close = () => {
    setOpen(false);
    setQuery('');
    setActive(0);
  };
  const pick = (v: string) => {
    onChange(v);
    close();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') setActive(a => Math.min(a + 1, items.length - 1));
    else if (e.key === 'ArrowUp') setActive(a => Math.max(a - 1, 0));
    else if (e.key === 'Enter' && items[active] !== undefined) pick(items[active]);
    else return;
    e.preventDefault();
  };
  return (
    <div className={styles.root}>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label} : ${value || 'vide'}`}
        disabled={!canEdit}
        onClick={() => setOpen(o => !o)}
      >
        <Tag value={value}>{value ? render(value) : undefined}</Tag>
      </button>
      <Popover open={open} onClose={close}>
        <input
          autoFocus
          className={styles.search}
          placeholder={creatable ? 'Rechercher ou créer une option' : 'Rechercher une option'}
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
        <ul role="listbox" aria-label={label} className={styles.list}>
          {items.map((o, i) => (
            <li key={o} role="option" aria-selected={o === value}>
              <button
                type="button"
                className={styles.option}
                data-active={i === active || undefined}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(o)}
              >
                {canCreate && i === items.length - 1 ? <span className={styles.create}>Créer</span> : null}
                <Tag value={o}>{render(o)}</Tag>
                {o === value ? <span className={styles.check}>✓</span> : null}
              </button>
            </li>
          ))}
          {!items.length ? <li className={styles.none}>Aucune option</li> : null}
        </ul>
        {value ? (
          <button type="button" className={styles.clear} onClick={() => pick('')}>
            Effacer
          </button>
        ) : null}
      </Popover>
    </div>
  );
}
