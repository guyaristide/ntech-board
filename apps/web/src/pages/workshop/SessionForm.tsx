import type { Session } from '@board/shared';
import { programme } from '../../model/programme';
import { useWorkspace } from '../../model/store';
import page from '../Page.module.css';
import styles from './Workshop.module.css';

/** Modification d'une séquence : intitulé, horaires, porteur, contenu, résultat attendu, renvoi au CdC. */
export function SessionForm({
  workshop,
  session,
  onClose,
}: {
  workshop: string;
  session: Session;
  onClose: () => void;
}) {
  const ws = useWorkspace();
  const set = (patch: Parameters<typeof ws.updateSession>[2]) =>
    ws.updateSession(workshop, session.code, patch);
  const remove = async () => {
    const n = session.questions.length;
    if (!confirm(`Supprimer la séquence ${session.code}${n ? ` et ses ${n} point(s) à trancher` : ''} ?`))
      return;
    await programme.deleteSession(workshop, session.code);
  };
  return (
    <div className={styles.sessionForm}>
      <label className={styles.wide}>
        Intitulé
        <input autoFocus value={session.title} onChange={e => set({ title: e.target.value })} />
      </label>
      <label className={styles.check}>
        <input type="checkbox" checked={session.allDay} onChange={e => set({ allDay: e.target.checked })} />{' '}
        Toute la journée
      </label>
      {!session.allDay ? (
        <span className={styles.timeInputs}>
          <label>
            Début
            <input
              type="time"
              value={session.start ?? ''}
              onChange={e => set({ start: e.target.value || null })}
            />
          </label>
          <label>
            Fin
            <input
              type="time"
              value={session.end ?? ''}
              onChange={e => set({ end: e.target.value || null })}
            />
          </label>
        </span>
      ) : null}
      <label className={styles.wide}>
        Porteur
        <input
          value={session.owner}
          placeholder="Qui anime la séquence"
          onChange={e => set({ owner: e.target.value })}
        />
      </label>
      <label className={styles.wide}>
        Contenu
        <textarea rows={3} value={session.content} onChange={e => set({ content: e.target.value })} />
      </label>
      <label className={styles.wide}>
        Résultat attendu
        <textarea rows={2} value={session.outcome} onChange={e => set({ outcome: e.target.value })} />
      </label>
      <label className={styles.wide}>
        Renvoi au cahier des charges
        <input
          value={session.cdc}
          placeholder="Par exemple « UC 01 Compte »"
          onChange={e => set({ cdc: e.target.value })}
        />
      </label>
      <p className={styles.formActions}>
        <button type="button" className={`${page.ghost} ${page.danger}`} onClick={() => void remove()}>
          Supprimer la séquence
        </button>
        <button type="button" className={page.primary} onClick={onClose}>
          Terminer
        </button>
      </p>
    </div>
  );
}
