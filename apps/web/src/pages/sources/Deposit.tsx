import { useState } from 'react';
import { cleanTranscript } from '@board/shared';
import { ApiError } from '../../model/api';
import { sources } from '../../model/sources';
import page from '../Page.module.css';
import styles from './Inbox.module.css';

const ACCEPT = '.txt,.md,.vtt,.srt,.csv,text/plain';
const MAX_CHARS = 400_000;

/** Dépôt d'un échange : texte collé ou fichier texte, avec son titre, sa date et son lien. */
export function Deposit({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [file, setFile] = useState('');
  const [occurredAt, setOccurredAt] = useState('');
  const [url, setUrl] = useState('');
  const [participants, setParticipants] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const read = async (f: File | undefined) => {
    if (!f) return;
    const content = cleanTranscript(f.name, await f.text());
    setText(content);
    setFile(f.name);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
  };
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await sources.deposit({
        title: title.trim(),
        text,
        origin: file ? 'upload' : 'paste',
        url: url.trim(),
        occurredAt: occurredAt || null,
        participants: participants.trim(),
      });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? (e.message ?? e.code) : 'Dépôt impossible, réessayez.');
      setBusy(false);
    }
  };
  const tooLong = text.length > MAX_CHARS;

  return (
    <form
      className={styles.deposit}
      onSubmit={e => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className={styles.depositRow}>
        <label>
          <span>Titre</span>
          <input
            required
            value={title}
            placeholder="Réunion de suivi du 12/11, fil #paiement…"
            onChange={e => setTitle(e.target.value)}
          />
        </label>
        <label>
          <span>Date de l’échange</span>
          <input type="date" value={occurredAt} onChange={e => setOccurredAt(e.target.value)} />
        </label>
      </div>
      <div className={styles.depositRow}>
        <label>
          <span>Lien vers l’original (facultatif)</span>
          <input type="url" value={url} placeholder="https://…" onChange={e => setUrl(e.target.value)} />
        </label>
        <label>
          <span>Participants (facultatif)</span>
          <input value={participants} onChange={e => setParticipants(e.target.value)} />
        </label>
      </div>
      <label>
        <span>
          Texte de l’échange{file ? ` · ${file}` : ''} · {text.length.toLocaleString('fr-FR')} caractères
        </span>
        <textarea
          required
          rows={10}
          value={text}
          placeholder="Collez la transcription, le fil de discussion ou le compte rendu, sans le résumer."
          onChange={e => {
            setText(e.target.value);
            setFile('');
          }}
        />
      </label>
      <p className={styles.depositFoot}>
        <label className={page.outline}>
          Choisir un fichier…
          <input
            type="file"
            accept={ACCEPT}
            hidden
            onChange={e => {
              void read(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
        <span className={page.faint}>
          Texte, Markdown, sous-titres .vtt ou .srt (export Fireflies, Plaud, Teams…)
        </span>
        <span className={page.actions}>
          <button type="button" className={page.ghost} onClick={onDone}>
            Annuler
          </button>
          <button
            type="submit"
            className={page.primary}
            disabled={busy || !title.trim() || text.trim().length < 20 || tooLong}
          >
            {busy ? 'Envoi…' : 'Déposer et analyser'}
          </button>
        </span>
      </p>
      {tooLong ? (
        <p className={styles.error}>
          Texte trop long ({MAX_CHARS.toLocaleString('fr-FR')} caractères au plus) : découpez l’échange.
        </p>
      ) : null}
      {error ? <p className={styles.error}>{error}</p> : null}
    </form>
  );
}
