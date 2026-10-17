import { useMemo, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../model/store';
import styles from './QuickFind.module.css';

interface Hit {
  to: string;
  code: string;
  title: string;
  meta: string;
}

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Recherche rapide (⌘K) dans les US, les diligences, les épiques, les ateliers et leurs sessions. */
export function QuickFind({ onClose }: { onClose: () => void }) {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const index = useMemo<(Hit & { text: string })[]>(
    () => [
      ...ws.stories.map(s => ({
        to: `/us/${s.id}`,
        code: s.id,
        title: s.title || 'Sans titre',
        meta: `${s.actor} · ${s.status}`,
        text: norm(
          `${s.id} ${s.title} ${s.description} ${s.asA} ${s.iWant} ${s.soThat} ${s.actor} ${s.targets.map(t => `${t.platform} ${t.module}`).join(' ')} ${s.acceptance.map(c => c.text).join(' ')} ${s.body.map(b => b.text).join(' ')}`,
        ),
      })),
      ...ws.diligences.map(d => ({
        to: `/diligence/${d.id}`,
        code: d.id,
        title: d.title || 'Sans titre',
        meta: `Diligence · ${d.owner || 'à désigner'} · ${d.status}`,
        text: norm(`${d.id} ${d.title} ${d.detail} ${d.owner} ${d.partners} ${d.dependency}`),
      })),
      ...ws.references.map(r => ({
        to: `/references#${r.id}`,
        code: r.id,
        title: r.subject,
        meta: 'Référence CdC',
        text: norm(`${r.id} ${r.subject} ${r.says.join(' ')} ${r.gaps}`),
      })),
      ...ws.epics.map(e => ({
        to: `/epic/${e.id}`,
        code: e.id,
        title: e.title,
        meta: 'Épique',
        text: norm(`${e.id} ${e.title} ${e.summary}`),
      })),
      ...ws.workshops.flatMap(w => [
        {
          to: `/atelier/${w.id}`,
          code: w.id,
          title: w.title,
          meta: 'Atelier',
          text: norm(`${w.id} ${w.title} ${w.objectives.join(' ')}`),
        },
        ...w.sessions.map(s => ({
          to: `/atelier/${w.id}#${s.code}`,
          code: s.code,
          title: s.title,
          meta: `Session de ${w.id}`,
          text: norm(
            `${s.code} ${s.title} ${s.content} ${s.questions.map(q => `${q.text} ${q.answer}`).join(' ')}`,
          ),
        })),
      ]),
    ],
    [ws.stories, ws.epics, ws.workshops, ws.references, ws.diligences],
  );
  const words = norm(query).split(/\s+/).filter(Boolean);
  const hits = (words.length ? index.filter(h => words.every(w => h.text.includes(w))) : index).slice(0, 40);
  const go = (h: Hit) => {
    navigate(h.to);
    onClose();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') setActive(a => Math.min(a + 1, hits.length - 1));
    else if (e.key === 'ArrowUp') setActive(a => Math.max(a - 1, 0));
    else if (e.key === 'Enter' && hits[active]) go(hits[active]);
    else if (e.key === 'Escape') onClose();
    else return;
    e.preventDefault();
  };
  return (
    <div className={styles.backdrop} onMouseDown={onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-label="Recherche"
        onMouseDown={e => e.stopPropagation()}
      >
        <input
          autoFocus
          className={styles.input}
          placeholder="Rechercher une US, une épique, un atelier, une question…"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
        <ul className={styles.list} role="listbox">
          {hits.map((h, i) => (
            <li key={`${h.to}-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                data-active={i === active || undefined}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(h)}
              >
                <span className={styles.code}>{h.code}</span>
                <span className={styles.title}>{h.title}</span>
                <span className={styles.meta}>{h.meta}</span>
              </button>
            </li>
          ))}
          {!hits.length ? <li className={styles.none}>Aucun résultat</li> : null}
        </ul>
      </div>
    </div>
  );
}
