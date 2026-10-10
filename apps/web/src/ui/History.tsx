import { useEffect, useState } from 'react';
import type { EntityKind } from '@board/shared';
import { api } from '../model/api';
import styles from './History.module.css';

interface Entry {
  action: string;
  at: string;
  name: string | null;
  email: string | null;
}

const ACTION: Record<string, string> = {
  create: 'a créé l’US',
  update: 'a modifié',
  comment: 'a commenté',
  delete: 'a supprimé',
};
const label = (a: string) =>
  ACTION[a] ??
  (a.startsWith('question')
    ? 'a traité un point à trancher'
    : a.startsWith('session')
      ? 'a pris des notes de séance'
      : 'a modifié');

/** Historique des modifications (qui, quoi, quand), chargé à l'ouverture. */
export function History({ kind, id, stamp }: { kind: EntityKind; id: string; stamp: string }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  useEffect(() => {
    if (open)
      api.get<Entry[]>(`/history/${kind}/${encodeURIComponent(id)}`).then(setEntries, () => setEntries([]));
  }, [open, kind, id, stamp]);
  return (
    <details className={styles.history} onToggle={e => setOpen(e.currentTarget.open)}>
      <summary>Historique des modifications</summary>
      {entries === null ? (
        <p className={styles.empty}>Chargement…</p>
      ) : entries.length ? (
        <ol>
          {entries.map((e, i) => (
            <li key={i}>
              <strong>{e.name || e.email || 'Import'}</strong> {label(e.action)}{' '}
              <time dateTime={e.at}>
                {new Date(e.at).toLocaleString('fr-FR', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.empty}>Aucune modification depuis l’import.</p>
      )}
    </details>
  );
}
