import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  amount,
  byCount,
  casesOf,
  forecast,
  isBlocked,
  isDone,
  platformKeys,
  platformsOf,
  progressBy,
  releaseProgress,
  testSummary,
  UNIT,
  velocity,
  workdaysLeft,
  type GroupProgress,
} from '@board/shared';
import { useDelivery } from '../../model/delivery';
import { useWorkspace } from '../../model/store';
import { PdfButton } from '../../ui/PdfButton';
import { Tag } from '../../ui/Tag';
import page from '../Page.module.css';
import { Burndown, Velocity } from './Charts';
import { DeliveryGate, period, shortDay } from './parts';
import styles from './Pilotage.module.css';
import { useBurndown } from './usePilotage';

const pct = (done: number, total: number) => (total ? Math.round((done / total) * 100) : 0);

/** Barre d'avancement, avec son pourcentage sauf `bare` (le pourcentage est affiché ailleurs). */
export function Meter({ done, total, bare }: { done: number; total: number; bare?: boolean }) {
  return (
    <span className={styles.meter} data-empty={!total || undefined} title={`${pct(done, total)} % terminé`}>
      <span>
        <span style={{ width: `${pct(done, total)}%` }} />
      </span>
      {bare ? null : <span>{total ? `${pct(done, total)} %` : '—'}</span>}
    </span>
  );
}

function GroupTable({ rows, count, first }: { rows: GroupProgress[]; count: boolean; first: string }) {
  const settings = useWorkspace(s => s.settings);
  const shown = rows.filter(r => r.stories);
  if (!shown.length) return <p className={page.faint}>Aucune US.</p>;
  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>{first}</th>
            <th className={styles.n}>US</th>
            <th className={styles.n}>Validées</th>
            <th className={styles.n} title="US qui ont au moins un ticket">
              En réalisation
            </th>
            <th className={styles.n} title="Tous leurs tickets sont terminés">
              Terminées
            </th>
            <th className={styles.n}>{count ? 'Tickets' : 'Estimation'}</th>
            <th>Avancement</th>
          </tr>
        </thead>
        <tbody>
          {shown.map(r => (
            <tr key={r.key}>
              <td>{r.label}</td>
              <td className={styles.n}>{r.stories}</td>
              <td className={styles.n}>{r.validated}</td>
              <td className={styles.n}>{r.started}</td>
              <td className={styles.n}>{r.finished}</td>
              <td className={styles.n}>
                {count
                  ? `${r.ticketsDone}/${r.tickets}`
                  : `${amount(r.done, settings)} / ${amount(r.total, settings)}`}
              </td>
              <td className={styles.progressCell}>
                <Meter done={count ? r.ticketsDone : r.done} total={count ? r.tickets : r.total} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Pilotage : sprint en cours et burndown, vélocité, versions et prévisions, avancement par cas
 * d'usage et par plateforme ; rapport COPIL en PDF, pour tout le projet ou une organisation.
 */
export function Pilotage() {
  const { settings, releases, sprints, tickets, campaigns } = useDelivery();
  const ws = useWorkspace();
  const [by, setBy] = useState<'epic' | 'platform'>('epic');
  const [org, setOrg] = useState('');
  const count = byCount(settings);
  const unit = count ? 'tickets' : UNIT[settings.delivery.estimation];
  const active = sprints.find(s => s.status === 'active');
  const chart = useBurndown(settings, active, tickets);
  const v = velocity(sprints, count);
  const own = active ? tickets.filter(t => t.sprint === active.id) : [];
  const ownDone = own.filter(t => isDone(settings, t));
  const blocked = tickets.filter(t => !isDone(settings, t) && isBlocked(settings, tickets, t));
  const current = releases.find(r => r.status === 'En cours') ?? releases.find(r => r.status === 'Prévue');
  const currentP = current ? releaseProgress(settings, current, tickets) : null;
  const currentF = current ? forecast(settings, current, tickets, sprints) : null;
  const testing = campaigns.filter(c => c.status === 'En cours');
  const ko = testing.reduce(
    (n, c) => n + testSummary(casesOf(c, ws.stories).map(x => x.result?.status ?? '')).ko,
    0,
  );
  const orgs = ws.parties.filter(p => p.type === 'organization');
  const est = (list: typeof tickets) => list.reduce((n, t) => n + (t.estimate ?? 0), 0);
  const sum = (list: typeof tickets) => (count ? list.length : est(list));
  const groups =
    by === 'epic'
      ? progressBy(
          settings,
          ws.stories,
          tickets,
          ws.epics.map(e => ({ key: e.id, label: `${e.id} · ${e.title}` })),
          s => [s.epic],
        )
      : progressBy(
          settings,
          ws.stories,
          tickets,
          platformsOf(ws.stories).map(p => ({ key: p, label: p })),
          platformKeys,
        );

  return (
    <DeliveryGate>
      <div className={`${page.page} ${page.wide}`}>
        <span className={page.icon} aria-hidden="true">
          📈
        </span>
        <h1 className={page.h1}>Pilotage</h1>
        <p className={page.lead}>
          Où en est la réalisation : sprint en cours, vélocité, versions et prévisions, avancement par cas
          d’usage et par plateforme. Le rapport COPIL reprend ces éléments en PDF, pour tout le projet ou pour
          une organisation.
        </p>
        <div className={styles.report}>
          <select value={org} aria-label="Périmètre du rapport" onChange={e => setOrg(e.target.value)}>
            <option value="">Tout le projet</option>
            {orgs.map(o => (
              <option key={o.id} value={o.id}>
                Vue {o.name}
              </option>
            ))}
          </select>
          <PdfButton
            path={`/pdf/copil${org ? `?organisation=${encodeURIComponent(org)}` : ''}`}
            title="Rapport de pilotage pour le comité"
          >
            ⤓ Rapport COPIL
          </PdfButton>
        </div>

        <div className={styles.kpis}>
          {active ? (
            <Link to={`/realisation/sprint/${active.id}`} className={styles.kpi}>
              <span className={styles.kpiLabel}>{active.name}</span>
              <span className={styles.kpiValue}>{pct(sum(ownDone), sum(own))} %</span>
              <span className={page.faint}>
                {count
                  ? `${ownDone.length}/${own.length} tickets`
                  : `${amount(est(ownDone), settings)} / ${amount(est(own), settings)}`}{' '}
                · {workdaysLeft(active.end, undefined, active.start)} j ouvrés restants
              </span>
            </Link>
          ) : (
            <Link to="/realisation/sprints" className={styles.kpi}>
              <span className={styles.kpiLabel}>Sprint en cours</span>
              <span className={styles.kpiValue}>—</span>
              <span className={page.faint}>Aucun sprint démarré</span>
            </Link>
          )}
          {current && currentP && currentF ? (
            <Link to="/realisation/versions" className={styles.kpi}>
              <span className={styles.kpiLabel}>{current.name}</span>
              <span className={styles.kpiValue}>
                {pct(count ? currentP.doneCount : currentP.done, count ? currentP.count : currentP.total)} %
              </span>
              <span className={currentF.late ? styles.late : page.faint}>
                {current.end ? `Visée ${shortDay(current.end)}` : 'Sans date visée'}
                {currentF.date ? ` · prévue ${shortDay(currentF.date)}` : ''}
              </span>
            </Link>
          ) : null}
          <div className={styles.kpi}>
            <span className={styles.kpiLabel}>Vélocité moyenne</span>
            <span className={styles.kpiValue}>
              {v.average === null ? '—' : v.average.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
            </span>
            <span className={page.faint}>
              {v.average === null
                ? 'Pas encore de sprint clos'
                : `${unit} par sprint, ${Math.min(3, v.closed.length)} derniers`}
            </span>
          </div>
          <Link to="/realisation/tableau" className={styles.kpi} data-alert={blocked.length || undefined}>
            <span className={styles.kpiLabel}>Tickets bloqués</span>
            <span className={styles.kpiValue}>{blocked.length}</span>
            <span className={page.faint}>
              {blocked
                .slice(0, 3)
                .map(t => t.id)
                .join(', ') || 'Aucun'}
            </span>
          </Link>
          {campaigns.length ? (
            <Link to="/realisation/recette" className={styles.kpi} data-alert={ko || undefined}>
              <span className={styles.kpiLabel}>Recette</span>
              <span className={styles.kpiValue}>{ko}</span>
              <span className={page.faint}>
                KO dans {testing.length} campagne{testing.length > 1 ? 's' : ''} en cours
              </span>
            </Link>
          ) : null}
        </div>

        <div className={styles.grid2}>
          <section>
            <h2 className={page.h2}>Burndown{active ? ` · ${active.name}` : ''}</h2>
            {chart ? (
              <>
                <Burndown data={chart} unit={unit} />
                <p className={page.faint}>
                  {period(active!)} · un relevé est pris chaque jour où un ticket du sprint change.
                </p>
              </>
            ) : (
              <p className={page.faint}>
                {active
                  ? 'Donnez des dates au sprint pour tracer son burndown.'
                  : 'Démarrez un sprint pour suivre son burndown.'}
              </p>
            )}
          </section>
          <section>
            <h2 className={page.h2}>Vélocité</h2>
            {v.closed.length ? (
              <Velocity sprints={v.closed} count={count} average={v.average} unit={unit} />
            ) : (
              <p className={page.faint}>La vélocité apparaît à la clôture du premier sprint.</p>
            )}
          </section>
        </div>

        <h2 className={page.h2}>Versions</h2>
        {releases.length ? (
          <div className={styles.wrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Livraison visée</th>
                  <th>Statut</th>
                  <th className={styles.n}>{count ? 'Tickets' : 'Estimation'}</th>
                  <th>Avancement</th>
                  <th title="Reste à faire divisé par la vélocité moyenne">Prévision</th>
                </tr>
              </thead>
              <tbody>
                {releases
                  .filter(r => r.status !== 'Abandonnée')
                  .map(r => {
                    const p = releaseProgress(settings, r, tickets);
                    const f = forecast(settings, r, tickets, sprints);
                    return (
                      <tr key={r.id}>
                        <td>
                          <Link to="/realisation/versions">{r.name}</Link>
                        </td>
                        <td>{shortDay(r.end)}</td>
                        <td>
                          <Tag value={r.status} />
                        </td>
                        <td className={styles.n}>
                          {count
                            ? `${p.doneCount}/${p.count}`
                            : `${amount(p.done, settings)} / ${amount(p.total, settings)}`}
                          {p.unestimated && !count ? (
                            <span className={page.faint}>
                              {' '}
                              · {p.unestimated} non estimé{p.unestimated > 1 ? 's' : ''}
                            </span>
                          ) : null}
                        </td>
                        <td className={styles.progressCell}>
                          <Meter done={count ? p.doneCount : p.done} total={count ? p.count : p.total} />
                        </td>
                        <td className={f.late ? styles.late : undefined}>
                          {r.status === 'Livrée'
                            ? 'Livrée'
                            : !p.count
                              ? '—'
                              : f.remaining === 0
                                ? 'Terminée'
                                : f.date
                                  ? `${shortDay(f.date)} · ${f.sprints} sprint${(f.sprints ?? 0) > 1 ? 's' : ''}${f.late ? ', en retard' : ''}`
                                  : 'Vélocité inconnue'}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={page.faint}>Aucune version.</p>
        )}

        <h2 className={page.h2}>Avancement des US</h2>
        <div className={styles.tabs}>
          <button
            type="button"
            className={styles.tab}
            data-on={by === 'epic' || undefined}
            onClick={() => setBy('epic')}
          >
            Par cas d’usage
          </button>
          <button
            type="button"
            className={styles.tab}
            data-on={by === 'platform' || undefined}
            onClick={() => setBy('platform')}
          >
            Par plateforme
          </button>
        </div>
        <GroupTable rows={groups} count={count} first={by === 'epic' ? 'Cas d’usage' : 'Plateforme'} />
      </div>
    </DeliveryGate>
  );
}
