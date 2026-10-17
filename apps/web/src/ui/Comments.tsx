import { useState } from 'react';
import type { Comment } from '@board/shared';
import { useCanEdit, useWorkspace } from '../model/store';
import styles from './Comments.module.css';

const when = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * Fil de commentaires d'une page. Avec onPick, chaque commentaire propose de reprendre son texte
 * ailleurs (dans la description d'une US).
 */
export function Comments({
  items,
  onAdd,
  onPick,
  pickLabel = 'Reprendre',
}: {
  items: Comment[];
  onAdd: (text: string) => void;
  onPick?: (comment: Comment) => void;
  pickLabel?: string;
}) {
  const [text, setText] = useState('');
  const author = useWorkspace(s => s.session?.user?.name || s.session?.user?.email || '');
  const canEdit = useCanEdit();
  const submit = () => {
    if (!text.trim()) return;
    onAdd(text.trim());
    setText('');
  };
  return (
    <section className={styles.comments} aria-label="Commentaires">
      {items.map(c => (
        <article key={c.id} className={styles.comment}>
          <span className={styles.avatar} aria-hidden="true">
            {c.author.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <p className={styles.meta}>
              <strong>{c.author}</strong> <time dateTime={c.at}>{when(c.at)}</time>
              {onPick && canEdit ? (
                <button type="button" className={styles.pick} onClick={() => onPick(c)}>
                  {pickLabel}
                </button>
              ) : null}
            </p>
            <p className={styles.body}>{c.text}</p>
          </div>
        </article>
      ))}
      {canEdit ? (
        <div className={styles.form}>
          <span className={styles.avatar} aria-hidden="true" title={author}>
            {author.slice(0, 1).toUpperCase()}
          </span>
          <input
            className={styles.input}
            value={text}
            placeholder="Ajouter un commentaire…"
            aria-label="Ajouter un commentaire"
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
          />
          <button type="button" className={styles.send} disabled={!text.trim()} onClick={submit}>
            Envoyer
          </button>
        </div>
      ) : null}
    </section>
  );
}
