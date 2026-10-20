import { Link } from 'react-router-dom';
import { amount, progress } from '@board/shared';
import { delivery, useDelivery } from '../../model/delivery';
import { useCanEdit } from '../../model/store';
import page from '../Page.module.css';
import { DeliveryGate, LoadBar, period, sprintOrder, SprintTag } from './parts';
import styles from './Delivery.module.css';

/** Liste des sprints : avancement des sprints ouverts, vélocité des sprints clos. */
export function Sprints() {
  const { settings, sprints, tickets, releases } = useDelivery();
  const canEdit = useCanEdit();
  const list = [...sprints].sort(sprintOrder);
  const closed = sprints
    .filter(s => s.status === 'closed' && s.velocity !== null)
    .sort((a, b) => (b.end ?? '').localeCompare(a.end ?? ''));
  const recent = closed.slice(0, 3);
  const average = recent.length ? recent.reduce((n, s) => n + (s.velocity ?? 0), 0) / recent.length : null;
  return (
    <DeliveryGate>
      <div className={`${page.page} ${page.wide}`}>
        <span className={page.icon} aria-hidden="true">
          🏃
        </span>
        <h1 className={page.h1}>Sprints</h1>
        <p className={page.lead}>
          Sprints de {settings.delivery.sprintWeeks} semaine{settings.delivery.sprintWeeks > 1 ? 's' : ''} par
          défaut (modifiable dans les réglages et sprint par sprint).
          {average !== null
            ? ` Vélocité moyenne des ${recent.length} derniers sprints : ${amount(average, settings)}.`
            : ''}
        </p>
        {canEdit ? (
          <p className={page.actions}>
            <button type="button" className={page.primary} onClick={() => void delivery.createSprint()}>
              + Sprint
            </button>
          </p>
        ) : null}
        <div className={styles.cards}>
          {list.map(s => {
            const items = tickets.filter(t => t.sprint === s.id || s.carried.includes(t.id));
            const p = progress(
              settings,
              tickets.filter(t => t.sprint === s.id),
            );
            const release = releases.find(r => r.id === s.release);
            return (
              <Link key={s.id} to={`/realisation/sprint/${s.id}`} className={styles.card}>
                <span className={styles.cardHead}>
                  <strong>{s.name}</strong>
                  <SprintTag sprint={s} />
                </span>
                <span className={page.faint}>
                  {period(s)}
                  {release ? ` · ${release.name}` : ''}
                </span>
                {s.goal ? <span className={styles.goal}>{s.goal}</span> : null}
                {s.status === 'closed' ? (
                  <span>
                    Vélocité {amount(s.velocity ?? 0, settings)}
                    {s.carried.length
                      ? ` · ${s.carried.length} reporté${s.carried.length > 1 ? 's' : ''}`
                      : ''}
                  </span>
                ) : (
                  <>
                    <LoadBar value={p.total} max={s.capacity} label="Charge et capacité" />
                    <span className={page.faint}>
                      {p.doneCount}/{p.count} terminé{p.doneCount > 1 ? 's' : ''} · {amount(p.done, settings)}{' '}
                      sur {amount(p.total, settings)}
                    </span>
                  </>
                )}
                {!items.length && s.status !== 'closed' ? (
                  <span className={page.faint}>Aucun ticket planifié</span>
                ) : null}
              </Link>
            );
          })}
        </div>
        {!list.length ? <p className={page.faint}>Aucun sprint pour le moment.</p> : null}
      </div>
    </DeliveryGate>
  );
}
