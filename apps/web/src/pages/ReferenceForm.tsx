import { useState } from 'react';
import type { Reference } from '@board/shared';
import { programme } from '../model/programme';
import page from './Page.module.css';
import styles from './workshop/Workshop.module.css';

const lines = (v: string) =>
  v
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

/**
 * Modification d'une fiche du cahier des charges : sujet, ce qu'il dit (une ligne par point ; une
 * ligne « … : » annonce une liste, « 1. » la numérote), où le lire, écarts, séquences concernées.
 */
export function ReferenceForm({ reference: r, onClose }: { reference: Reference; onClose: () => void }) {
  const [says, setSays] = useState(r.says.join('\n'));
  const [sessions, setSessions] = useState(r.sessions.join(', '));
  const set = (patch: Parameters<typeof programme.updateReference>[1]) =>
    programme.updateReference(r.id, patch);
  const remove = async () => {
    if (!confirm(`Supprimer la fiche ${r.id} ? Les séquences qui la citent ne la citeront plus.`)) return;
    await programme.deleteReference(r.id);
  };
  return (
    <div className={styles.sessionForm}>
      <label>
        Sujet
        <input autoFocus value={r.subject} onChange={e => set({ subject: e.target.value })} />
      </label>
      <label>
        Ce que dit le document (une ligne par point)
        <textarea
          rows={6}
          value={says}
          onChange={e => {
            setSays(e.target.value);
            set({ says: lines(e.target.value) });
          }}
        />
      </label>
      <label>
        Où le lire
        <input value={r.where} placeholder="Section, pages" onChange={e => set({ where: e.target.value })} />
      </label>
      <label>
        Écarts à trancher
        <textarea rows={2} value={r.gaps} onChange={e => set({ gaps: e.target.value })} />
      </label>
      <label>
        Séquences concernées (codes séparés par des virgules)
        <input
          value={sessions}
          placeholder="J2.1, J5.2"
          onChange={e => {
            setSessions(e.target.value);
            set({ sessions: e.target.value.split(/[\s,;]+/).filter(Boolean) });
          }}
        />
      </label>
      <p className={styles.formActions}>
        <button type="button" className={`${page.ghost} ${page.danger}`} onClick={() => void remove()}>
          Supprimer la fiche
        </button>
        <button type="button" className={page.primary} onClick={onClose}>
          Terminer
        </button>
      </p>
    </div>
  );
}
