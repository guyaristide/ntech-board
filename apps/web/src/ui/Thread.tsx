import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  commentCount,
  isResolved,
  mentionsIn,
  threadOf,
  type Person,
  type ThreadComment,
  type ThreadEntry,
  type ThreadKind,
} from '@board/shared';
import { ApiError } from '../model/api';
import { useCanEdit, useIsAdmin, useWorkspace } from '../model/store';
import { useNotifications } from '../model/notifications';
import { threads } from '../model/threads';
import { FollowButton } from './Notifications';
import { useAutosize } from './useAutosize';
import page from '../pages/Page.module.css';
import styles from './Thread.module.css';

/** Texte d'un message, les mentions « @Nom » mises en valeur. */
function withMentions(text: string, names: string[]): ReactNode {
  const tokens = names
    .filter(Boolean)
    .map(n => `@${n}`)
    .sort((a, b) => b.length - a.length);
  if (!tokens.length) return text;
  const out: ReactNode[] = [];
  let rest = text;
  for (let guard = 0; rest && guard < 200; guard++) {
    const hit = tokens
      .map(t => ({ t, i: rest.indexOf(t) }))
      .filter(x => x.i >= 0)
      .sort((a, b) => a.i - b.i)[0];
    if (!hit) break;
    if (hit.i) out.push(rest.slice(0, hit.i));
    out.push(
      <span key={out.length} className={styles.mention}>
        {hit.t}
      </span>,
    );
    rest = rest.slice(hit.i + hit.t.length);
  }
  if (rest) out.push(rest);
  return out;
}

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
  onSubmit: (text: string, mentions: string[]) => Promise<unknown>;
  onCancel?: () => void;
}) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ref = useAutosize<HTMLTextAreaElement>(text);
  const { people, loadPeople } = useNotifications();
  // Mention en cours de saisie : « @ » suivi de lettres, juste avant le curseur.
  const [query, setQuery] = useState<{ at: number; text: string } | null>(null);
  const [active, setActive] = useState(0);
  const matches = query
    ? people.filter(p => p.name.toLowerCase().includes(query.text.toLowerCase())).slice(0, 6)
    : [];
  const track = (value: string, caret: number) => {
    const m = /(^|\s)@([\p{L}\p{N}._'’ -]{0,30})$/u.exec(value.slice(0, caret));
    setQuery(m ? { at: caret - m[2].length - 1, text: m[2] } : null);
    setActive(0);
    if (m) void loadPeople();
  };
  const pick = (p: Person) => {
    if (!query) return;
    const end = query.at + 1 + query.text.length;
    const next = `${text.slice(0, query.at)}@${p.name} ${text.slice(end)}`;
    setText(next);
    setQuery(null);
    requestAnimationFrame(() => {
      const caret = query.at + p.name.length + 2;
      ref.current?.focus();
      ref.current?.setSelectionRange(caret, caret);
    });
  };
  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await onSubmit(text.trim(), mentionsIn(text, people));
      setText('');
      setQuery(null);
    } catch (e) {
      setError(e instanceof ApiError ? (e.message ?? 'Envoi refusé.') : 'Erreur réseau, réessayez.');
    } finally {
      setBusy(false);
    }
  };
  const onKey = (e: KeyboardEvent) => {
    if (query && matches.length) {
      // Liste des mentions ouverte : les flèches la parcourent, Entrée ou Tab choisit, Échap la ferme.
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setActive(a => (a + (e.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pick(matches[active]);
        return;
      }
      if (e.key === 'Escape') {
        e.stopPropagation();
        setQuery(null);
        return;
      }
    }
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
        onChange={e => {
          setText(e.target.value);
          track(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={onKey}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
      />
      {query && matches.length ? (
        <ul className={styles.mentions} role="listbox" aria-label="Mentionner un membre">
          {matches.map((p, i) => (
            <li key={p.userId} role="option" aria-selected={i === active}>
              <button
                type="button"
                data-active={i === active || undefined}
                onMouseDown={e => {
                  e.preventDefault();
                  pick(p);
                }}
              >
                <span className={styles.avatar} aria-hidden="true">
                  {p.name.slice(0, 1).toUpperCase()}
                </span>
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
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
  onResolve,
  resolveLabel = 'Résoudre',
  onPick,
  pickLabel,
}: {
  comment: ThreadComment;
  onReply?: () => void;
  /** Message de tête : marquer le fil résolu, ou le rouvrir. */
  onResolve?: () => void;
  resolveLabel?: string;
  onPick?: (text: string) => void;
  pickLabel?: string;
}) {
  const me = useWorkspace(s => s.session?.user?.id);
  const canEdit = useCanEdit();
  const isAdmin = useIsAdmin();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const people = useNotifications(s => s.people);
  const loadPeople = useNotifications(s => s.loadPeople);
  useEffect(() => {
    if (comment.mentions?.length) void loadPeople();
  }, [comment.mentions?.length, loadPeople]);
  const mentioned = people.filter(p => comment.mentions?.includes(p.userId)).map(p => p.name);
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
              <p className={styles.body}>{withMentions(comment.text, mentioned)}</p>
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
                {onResolve && canEdit ? (
                  <button type="button" onClick={onResolve}>
                    {resolveLabel}
                  </button>
                ) : null}
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
  // Lire le fil vaut lecture des notifications de cet élément.
  const pending = useNotifications(s =>
    s.items.some(n => !n.readAt && n.target.kind === kind && n.target.id === id),
  );
  const read = useNotifications(s => s.read);
  useEffect(() => {
    if (pending) void read({ target: { kind, id } });
  }, [pending, read, kind, id]);
  const open = entries.filter(e => !isResolved(e));
  const settled = entries.filter(isResolved);
  /** Un fil : son message de tête, ses réponses, la réponse en cours de saisie. Résolu : en lecture, on peut le rouvrir. */
  const entry = (e: ThreadEntry, done = false) => (
    <li key={e.comment.id} data-resolved={done || undefined}>
      <Message
        comment={e.comment}
        onReply={done ? undefined : () => setReplying(e.comment.id)}
        onResolve={() => void threads.resolve(e.comment.id, !done)}
        resolveLabel={done ? 'Rouvrir' : 'Résoudre'}
        onPick={onPick}
        pickLabel={pickLabel}
      />
      {e.replies.length || replying === e.comment.id ? (
        <div className={styles.replies}>
          {e.replies.map(r => (
            <Message
              key={r.id}
              comment={r}
              onReply={done ? undefined : () => setReplying(e.comment.id)}
              onPick={onPick}
              pickLabel={pickLabel}
            />
          ))}
          {replying === e.comment.id && !done ? (
            <Composer
              placeholder={`Répondre à ${e.comment.authorName || 'ce message'}`}
              submitLabel="Répondre"
              autoFocus
              onSubmit={async (text, mentions) => {
                await threads.post(target, text, e.comment.id, mentions);
                setReplying(null);
              }}
              onCancel={() => setReplying(null)}
            />
          ) : null}
        </div>
      ) : null}
      {done && e.comment.resolvedAt ? (
        <p className={styles.resolvedBy}>
          Résolu{e.comment.resolvedBy ? ` par ${e.comment.resolvedBy}` : ''} · {when(e.comment.resolvedAt)}
        </p>
      ) : null}
    </li>
  );
  return (
    <section className={styles.thread} aria-label="Discussion">
      {open.length ? (
        <ol className={styles.list}>{open.map(e => entry(e))}</ol>
      ) : (
        <p className={styles.empty}>
          {settled.length
            ? 'Tout est réglé : aucun fil en cours.'
            : canEdit
              ? 'Aucun message pour l’instant : posez une question, partagez une précision.'
              : 'Aucun message.'}
        </p>
      )}
      {settled.length ? (
        <details className={styles.resolved}>
          <summary>
            ✓ {settled.length} fil{settled.length > 1 ? 's' : ''} résolu{settled.length > 1 ? 's' : ''}
          </summary>
          <ol className={styles.list}>{settled.map(e => entry(e, true))}</ol>
        </details>
      ) : null}
      {canEdit ? (
        <Composer
          placeholder="Écrire un message…"
          autoFocus={autoFocus}
          onSubmit={(text, mentions) => threads.post(target, text, undefined, mentions)}
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
      <Heading className={level === 'h2' ? page.h2 : page.h3}>
        Discussion{count ? ` (${count})` : ''} <FollowButton kind={kind} id={id} />
      </Heading>
      <Thread kind={kind} id={id} {...rest} />
    </>
  );
}
