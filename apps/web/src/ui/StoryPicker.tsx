import { useState, type KeyboardEvent } from 'react';
import type { Story } from '@board/shared';
import { useWorkspace } from '../model/store';
import { Popover } from './Popover';
import styles from './Relations.module.css';

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Bouton qui ouvre une recherche d'US (identifiant ou mots du titre) et renvoie celle choisie. */
export function StoryPicker({
  label,
  exclude = [],
  onPick,
}: {
  label: string;
  exclude?: string[];
  onPick: (story: Story) => void;
}) {
  const stories = useWorkspace(s => s.stories);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const words = norm(query).split(/\s+/).filter(Boolean);
  const hits = stories
    .filter(s => !exclude.includes(s.id))
    .filter(s => words.every(w => norm(`${s.id} ${s.title}`).includes(w)))
    .slice(0, 30);
  const close = () => {
    setOpen(false);
    setQuery('');
    setActive(0);
  };
  const pick = (s: Story) => {
    onPick(s);
    close();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') setActive(a => Math.min(a + 1, hits.length - 1));
    else if (e.key === 'ArrowUp') setActive(a => Math.max(a - 1, 0));
    else if (e.key === 'Enter' && hits[active]) pick(hits[active]);
    else return;
    e.preventDefault();
  };
  return (
    <span className={styles.pickerRoot}>
      <button type="button" className={styles.add} onClick={() => setOpen(o => !o)}>
        + {label}
      </button>
      <Popover open={open} onClose={close} width={420}>
        <input
          autoFocus
          className={styles.search}
          placeholder="Identifiant ou mots du titre (ex. EX16 assistant)"
          aria-label="Rechercher une US"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
        <ul className={styles.hits} role="listbox" aria-label="US">
          {hits.map((s, i) => (
            <li key={s.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                data-active={i === active || undefined}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(s)}
              >
                <span className={styles.code}>{s.id}</span> {s.title || 'Sans titre'}
              </button>
            </li>
          ))}
          {!hits.length ? <li className={styles.none}>Aucune US</li> : null}
        </ul>
      </Popover>
    </span>
  );
}
