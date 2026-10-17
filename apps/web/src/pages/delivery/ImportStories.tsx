import { useState } from 'react';
import { VERSIONS, type Story } from '@board/shared';
import { delivery, useDelivery } from '../../model/delivery';
import { useWorkspace } from '../../model/store';
import { Tag } from '../../ui/Tag';
import page from '../Page.module.css';
import styles from './Delivery.module.css';

/**
 * Passage en réalisation : les US du cadrage qui n'ont pas encore de ticket, par épique. Par défaut
 * les US validées ; chaque US cochée devient un ticket « US » rangé dans la version qui couvre la sienne.
 */
export function ImportStories({ onClose }: { onClose: () => void }) {
  const ws = useWorkspace();
  const { tickets } = useDelivery();
  const [all, setAll] = useState(false);
  const [version, setVersion] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const taken = new Set(tickets.map(t => t.story).filter(Boolean));
  const candidates = ws.stories.filter(
    s =>
      !taken.has(s.id) &&
      (all ? s.status !== 'Écartée' : s.status === 'Validée') &&
      (!version || s.version === version),
  );
  const epics = ws.epics.filter(e => candidates.some(s => s.epic === e.id));
  const toggle = (ids: string[], on: boolean) =>
    setPicked(p => {
      const next = new Set(p);
      ids.forEach(id => (on ? next.add(id) : next.delete(id)));
      return next;
    });
  const submit = async () => {
    setBusy(true);
    try {
      await delivery.addStories([...picked]);
      onClose();
    } finally {
      setBusy(false);
    }
  };
  const row = (s: Story) => (
    <label key={s.id} className={styles.pickRow}>
      <input type="checkbox" checked={picked.has(s.id)} onChange={e => toggle([s.id], e.target.checked)} />
      <span className={styles.key}>{s.id}</span>
      <span className={styles.pickTitle}>{s.title}</span>
      <Tag value={s.version} />
      {all ? <Tag value={s.status} /> : null}
    </label>
  );
  return (
    <section className={styles.import} aria-label="Passer des US en réalisation">
      <header className={styles.laneHead}>
        <span className={styles.laneTitle}>Passer des US en réalisation</span>
        <select className={styles.filter} value={version} onChange={e => setVersion(e.target.value)} aria-label="Version du cadrage">
          <option value="">Toutes les versions</option>
          {VERSIONS.filter(v => v !== 'Hors périmètre').map(v => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <label className={styles.inline}>
          <input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} />
          Inclure les US pas encore validées
        </label>
        <span className={page.actions}>
          <button type="button" className={page.ghost} onClick={onClose}>
            Fermer
          </button>
          <button type="button" className={page.primary} disabled={!picked.size || busy} onClick={() => void submit()}>
            {busy ? 'Création…' : `Passer en réalisation (${picked.size})`}
          </button>
        </span>
      </header>
      {!candidates.length ? (
        <p className={styles.emptyLane}>
          {all
            ? 'Toutes les US sont déjà en réalisation.'
            : 'Aucune US validée en attente. Validez des US dans le backlog du cadrage, ou incluez celles qui ne le sont pas encore.'}
        </p>
      ) : (
        <div className={styles.pickList}>
          {epics.map(e => {
            const items = candidates.filter(s => s.epic === e.id);
            const on = items.every(s => picked.has(s.id));
            return (
              <div key={e.id}>
                <label className={styles.pickEpic}>
                  <input type="checkbox" checked={on} onChange={ev => toggle(items.map(s => s.id), ev.target.checked)} />
                  {e.id} · {e.title} <span className={page.faint}>({items.length})</span>
                </label>
                {items.map(row)}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
