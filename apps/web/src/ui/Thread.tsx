import { useMemo, useState, type KeyboardEvent } from 'react';
import { commentCount, threadOf, type ThreadComment, type ThreadKind } from '@board/shared';
import { ApiError } from '../model/api';
import { useCanEdit, useIsAdmin, useWorkspace } from '../model/store';
import { threads } from '../model/threads';
import { useAutosize } from './useAutosize';
import page from '../pages/Page.module.css';
import styles from './Thread.module.css';

const when = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

/** Zone de saisie : Entrée envoie, Maj+Entrée va à la ligne, Échap annule. */
function Composer({
  placeholder,
  initial = '',
  submitLabel = 'Envoyer',
  autoFocus,
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  initial?: string;
  submitLabel?: string;
  autoFocus?: boolean;
  onSubmit: (text: string) => Promise<unknown>;
  onCancel?: () => void;
}) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ref = useAutosize<HTMLTextAreaElement>(text);
  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await onSubmit(text.trim());
      setText('');
    } catch (e) {
      setError(e instanceof ApiError ? (e.message ?? 'Envoi refusé.') : 'Erreur réseau, réessayez.');
    } finally {
      setBusy(false);
    }
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    } else if (e.key === 'Escape' && onCancel) {
      e.stopPropagation();
      onCancel();
    }
  };
  return (
    <div className={styles.composer}>
      <textarea
        ref={ref}
        rows={1}
        value={text}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus={autoFocus}
        maxLength={5000}
        onChange={e => setText(e.target.value)}
        onKeyDown={onKey}
      />
      <span className={styles.composerActions}>
        {onCancel ? (
          <button type="button" className={styles.ghost} onClick={onCancel}>
            Annuler
          </button>
        ) : null}
        <button
          type="button"
          className={styles.send}
          disabled={!text.trim() || busy}
          onClick={() => void submit()}
        >
          {submitLabel}
        </button>
      </span>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Message({
  comment,
  onReply,
  onPick,
  pickLabel,
}: {
  comment: ThreadComment;
  onReply?: () => void;
  onPick?: (text: string) => void;
  pickLabel?: string;
}) {
  const me = useWorkspace(s => s.session?.user?.id);
  const canEdit = useCanEdit();
  const isAdmin = useIsAdmin();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const mine = !!me && comment.author === me;
  const name = comment.authorName || 'Anonyme';
  return (
    <article className={styles.message} data-deleted={comment.deleted || undefined}>
      <span className={styles.avatar} aria-hidden="true">
        {comment.deleted ? '·' : name.slice(0, 1).toUpperCase()}
      </span>
      <div className={styles.main}>
        {comment.deleted ? (
          <p className={styles.gone}>Message supprimé</p>
        ) : (
          <>
            <p className={styles.meta}>
              <strong>{name}</strong> <time dateTime={comment.at}>{when(comment.at)}</time>
              {comment.editedAt ? (
                <span className={styles.edited} title={`Modifié le ${when(comment.editedAt)}`}>
                  {' '}
                  · modifié
                </span>
              ) : null}
            </p>
            {editing ? (
              <Composer
                placeholder="Modifier le message"
                initial={comment.text}
                submitLabel="Enregistrer"
                autoFocus
                onSubmit={async text => {
                  if (text !== comment.text) await threads.edit(comment.id, text);
                  setEditing(false);
                }}
                onCancel={() => setEditing(false)}
              />
            ) : (
              <p className={styles.body}>{comment.text}</p>
            )}
            {confirming ? (
              <p className={styles.confirm} role="alert">
                Supprimer ce message ?{' '}
                <button
                  type="button"
                  className={styles.danger}
                  onClick={() => void threads.remove(comment.id).finally(() => setConfirming(false))}
                >
                  Supprimer
                </button>
                <button type="button" className={styles.ghost} onClick={() => setConfirming(false)}>
                  Annuler
                </button>
              </p>
            ) : !editing ? (
              <p className={styles.tools}>
                {onReply && canEdit ? (
                  <button type="button" onClick={onReply}>
                    Répondre
                  </button>
                ) : null}
                {onPick && canEdit ? (
                  <button type="button" onClick={() => onPick(comment.text)}>
                    {pickLabel}
                  </button>
                ) : null}
                {mine && canEdit ? (
                  <button type="button" onClick={() => setEditing(true)}>
                    Modifier
                  </button>
                ) : null}
                {(mine || isAdmin) && canEdit ? (
                  <button type="button" onClick={() => setConfirming(true)}>
                    Supprimer
                  </button>
                ) : null}
              </p>
            ) : null}
          </>
        )}
      </div>
    </article>
  );
}

/**
 * Fil de discussion d'un élément ou d'une pièce jointe : messages du plus ancien au plus récent,
 * réponses en retrait sous leur message. `onPick` propose de reprendre le texte d'un message
 * ailleurs (dans la description d'une US).
 */
export function Thread({
  kind,
  id,
  onPick,
  pickLabel = 'Reprendre',
  autoFocus,
}: {
  kind: ThreadKind;
  id: string;
  onPick?: (text: string) => void;
  pickLabel?: string;
  autoFocus?: boolean;
}) {
  const comments = useWorkspace(s => s.comments);
  const entries = useMemo(() => threadOf(comments, kind, id), [comments, kind, id]);
  const canEdit = useCanEdit();
  const [replying, setReplying] = useState<string | null>(null);
  const target = { kind, id };
  return (
    <section className={styles.thread} aria-label="Discussion">
      {entries.length ? (
        <ol className={styles.list}>
          {entries.map(e => (
            <li key={e.comment.id}>
              <Message
                comment={e.comment}
                onReply={() => setReplying(e.comment.id)}
                onPick={onPick}
                pickLabel={pickLabel}
              />
              {e.replies.length || replying === e.comment.id ? (
                <div className={styles.replies}>
                  {e.replies.map(r => (
                    <Message
                      key={r.id}
                      comment={r}
                      onReply={() => setReplying(e.comment.id)}
                      onPick={onPick}
                      pickLabel={pickLabel}
                    />
                  ))}
                  {replying === e.comment.id ? (
                    <Composer
                      placeholder={`Répondre à ${e.comment.authorName || 'ce message'}`}
                      submitLabel="Répondre"
                      autoFocus
                      onSubmit={async text => {
                        await threads.post(target, text, e.comment.id);
                        setReplying(null);
                      }}
                      onCancel={() => setReplying(null)}
                    />
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.empty}>
          {canEdit
            ? 'Aucun message pour l’instant : posez une question, partagez une précision.'
            : 'Aucun message.'}
        </p>
      )}
      {canEdit ? (
        <Composer
          placeholder="Écrire un message…"
          autoFocus={autoFocus}
          onSubmit={text => threads.post(target, text)}
        />
      ) : null}
    </section>
  );
}

/** Fil affiché directement sur la fiche d'un élément, sous un titre « Discussion (n) ». */
export function ThreadSection({
  kind,
  id,
  level = 'h2',
  ...rest
}: {
  kind: ThreadKind;
  id: string;
  level?: 'h2' | 'h3';
  onPick?: (text: string) => void;
  pickLabel?: string;
}) {
  const count = useWorkspace(s => commentCount(s.comments, kind, id));
  const Heading = level;
  return (
    <>
      <Heading className={level === 'h2' ? page.h2 : page.h3}>Discussion{count ? ` (${count})` : ''}</Heading>
      <Thread kind={kind} id={id} {...rest} />
    </>
  );
}
