import { Link } from 'react-router-dom';
import { amount, progress, RELEASE_STATUSES, VERSIONS, type Release, type ReleaseStatus, type Sprint } from '@board/shared';
import { delivery, useDelivery } from '../../model/delivery';
import { useCanEdit } from '../../model/store';
import { EditableText } from '../../ui/EditableText';
import { Tag } from '../../ui/Tag';
import page from '../Page.module.css';
import { DeliveryGate, period, sprintOrder } from './parts';
import styles from './Delivery.module.css';

const time = (iso: string) => new Date(`${iso}T12:00:00`).getTime();

/** Frise : versions et sprints sur l'axe du temps, un repère par mois et la date du jour. */
function Timeline({ releases, sprints }: { releases: Release[]; sprints: Sprint[] }) {
  const dated = [...releases, ...sprints].filter(x => x.start || x.end);
  if (!dated.length) return null;
  const dates = dated.flatMap(x => [x.start, x.end]).filter((d): d is string => !!d).sort();
  const from = time(dates[0]);
  const to = Math.max(time(dates.at(-1)!), from + 30 * 86_400_000);
  const pos = (iso: string) => ((time(iso) - from) / (to - from)) * 100;
  const bar = (x: { start: string | null; end: string | null }) => {
    const a = pos(x.start ?? x.end!);
    const b = pos(x.end ?? x.start!);
    return { left: `${a}%`, width: `${Math.max(b - a, 1)}%` };
  };
  const months: Date[] = [];
  for (let d = new Date(from); d.getTime() <= to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1))
    months.push(new Date(d.getFullYear(), d.getMonth(), 1));
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className={styles.timeline} aria-label="Frise des versions et des sprints">
      <div className={styles.months}>
        {months
          .map(m => ({ m, left: Math.max(0, ((m.getTime() - from) / (to - from)) * 100) }))
          // Un repère trop proche du précédent est omis : les libellés ne se chevauchent pas.
          .filter((x, i, all) => i === 0 || x.left - all[i - 1].left >= 6)
          .map(({ m, left }) => (
            <span key={m.toISOString()} style={{ left: `${left}%` }}>
              {m.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })}
            </span>
          ))}
      </div>
      {time(today) >= from && time(today) <= to ? (
        <div className={styles.axis}>
          <span className={styles.today} style={{ left: `${pos(today)}%` }} title="Aujourd’hui" />
        </div>
      ) : null}
      {releases
        .filter(r => r.start || r.end)
        .map(r => (
          <div key={r.id} className={styles.track}>
            <span className={styles.trackLabel}>{r.name}</span>
            <span className={styles.releaseBar} data-status={r.status} style={bar(r)} title={`${r.name} · ${period(r)}`} />
          </div>
        ))}
      <div className={styles.track}>
        <span className={styles.trackLabel}>Sprints</span>
        {sprints
          .filter(s => s.start || s.end)
          .map(s => (
            <Link key={s.id} to={`/realisation/sprint/${s.id}`} className={styles.sprintBar} data-status={s.status} style={bar(s)} title={`${s.name} · ${period(s)}`}>
              {s.name.replace(/^Sprint\s*/i, 'S')}
            </Link>
          ))}
      </div>
    </div>
  );
}

/** Feuille de route : versions (jalons de livraison), leur périmètre et leur avancement. */
export function Roadmap() {
  const { settings, releases, sprints, tickets } = useDelivery();
  const canEdit = useCanEdit();
  const sorted = [...releases].sort((a, b) => (a.end ?? '9').localeCompare(b.end ?? '9'));
  return (
    <DeliveryGate>
      <div className={`${page.page} ${page.wide}`}>
        <span className={page.icon} aria-hidden="true">
          🗺️
        </span>
        <h1 className={page.h1}>Feuille de route</h1>
        <p className={page.lead}>
          Les versions à livrer, avec leurs dates et leur avancement. Les US d’une version du cadrage (MVP, V1…)
          sont rangées par défaut dans la version qui la couvre.
        </p>
        {canEdit ? (
          <p className={page.actions}>
            <button type="button" className={page.primary} onClick={() => void delivery.createRelease()}>
              + Version
            </button>
          </p>
        ) : null}
        <Timeline releases={sorted} sprints={[...sprints].sort(sprintOrder)} />
        <div className={styles.cards}>
          {sorted.map(r => {
            const p = progress(settings, tickets.filter(t => t.release === r.id));
            const pct = p.total ? Math.round((p.done / p.total) * 100) : p.count ? Math.round((p.doneCount / p.count) * 100) : 0;
            return (
              <div key={r.id} className={styles.card}>
                <span className={styles.cardHead}>
                  <EditableText variant="inline" multiline={false} value={r.name} label="Nom de la version" onChange={name => delivery.updateRelease(r.id, { name })} />
                  <select
                    className={styles.filter}
                    value={r.status}
                    disabled={!canEdit}
                    aria-label="Statut"
                    onChange={e => delivery.updateRelease(r.id, { status: e.target.value as ReleaseStatus })}
                  >
                    {RELEASE_STATUSES.map(s => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </span>
                <span className={styles.dates}>
                  <input type="date" value={r.start ?? ''} disabled={!canEdit} aria-label="Début" onChange={e => delivery.updateRelease(r.id, { start: e.target.value || null })} />
                  →
                  <input type="date" value={r.end ?? ''} disabled={!canEdit} aria-label="Livraison" onChange={e => delivery.updateRelease(r.id, { end: e.target.value || null })} />
                </span>
                <span className={styles.versions}>
                  Couvre :
                  {VERSIONS.filter(v => v !== 'Hors périmètre').map(v => (
                    <label key={v} className={styles.inline}>
                      <input
                        type="checkbox"
                        disabled={!canEdit}
                        checked={r.versions.includes(v)}
                        onChange={e =>
                          delivery.updateRelease(r.id, {
                            versions: e.target.checked ? [...r.versions, v] : r.versions.filter(x => x !== v),
                          })
                        }
                      />
                      <Tag value={v} />
                    </label>
                  ))}
                </span>
                <EditableText variant="inline" value={r.goal} label="Objectif de la version" placeholder="Objectif, contenu attendu" onChange={goal => delivery.updateRelease(r.id, { goal })} />
                <span className={styles.bar} aria-label={`${pct} % terminé`}>
                  <span style={{ width: `${pct}%` }} />
                </span>
                <span className={page.faint}>
                  {p.doneCount}/{p.count} tickets terminés{p.total ? ` · ${amount(p.done, settings)} sur ${amount(p.total, settings)}` : ''}
                </span>
                {canEdit ? (
                  <button
                    type="button"
                    className={`${page.ghost} ${page.danger}`}
                    onClick={() => confirm(`Supprimer ${r.name} ? Ses tickets et sprints n’auront plus de version.`) && void delivery.deleteRelease(r.id)}
                  >
                    Supprimer
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
        {!sorted.length ? <p className={page.faint}>Aucune version pour le moment : créez le MVP, puis la V1…</p> : null}
      </div>
    </DeliveryGate>
  );
}
