import { useState } from 'react';
import { useWorkspace } from '../model/store';
import type { Comment } from '../model/types';
import styles from './Comments.module.css';

const when = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

/** Fil de commentaires d'une page ; l'auteur est retenu dans le navigateur. */
export function Comments({ items, onAdd }: { items: Comment[]; onAdd: (text: string) => void }) {
  const [text, setText] = useState('');
  const author = useWorkspace(s => s.author);
  const setAuthor = useWorkspace(s => s.setAuthor);
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
            </p>
            <p className={styles.body}>{c.text}</p>
          </div>
        </article>
      ))}
      <div className={styles.form}>
        {!author ? (
          <input
            className={styles.author}
            placeholder="Votre nom"
            aria-label="Votre nom"
            onBlur={e => e.target.value.trim() && setAuthor(e.target.value.trim())}
          />
        ) : (
          <span className={styles.avatar} aria-hidden="true" title={author}>
            {author.slice(0, 1).toUpperCase()}
          </span>
        )}
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
    </section>
  );
}
