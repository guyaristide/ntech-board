import { Link } from 'react-router-dom';
import { stepOf, type FlowMetrics, type ProjectSettings } from '@board/shared';
import page from '../Page.module.css';
import styles from './Flow.module.css';
import kpi from './Pilotage.module.css';

const SHOWN = 8;

/** Durée lisible : en heures sous une journée, en jours au-delà. */
export const duration = (days: number | null) =>
  days === null
    ? '—'
    : days < 1
      ? `${Math.max(1, Math.round(days * 24))} h`
      : `${days.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} j`;

const weekLabel = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

/** Flux : temps de cycle, débit, temps par étape et tickets en cours qui vieillissent. */
export function FlowSection({ flow, settings }: { flow: FlowMetrics; settings: ProjectSettings }) {
  const stale = flow.aging.filter(a => a.stale);
  const weekly = flow.throughput.reduce((n, w) => n + w.count, 0) / (flow.throughput.length || 1);
  const top = Math.max(1, ...flow.throughput.map(w => w.count));
  const longest = Math.max(...flow.steps.map(s => s.days), 0);
  // Le goulot : l'étape de travail la plus longue (l'attente avant démarrage n'en est pas une).
  const slowest = Math.max(...flow.steps.filter(s => s.category === 'doing').map(s => s.days), 0);
  return (
    <>
      <h2 className={page.h2}>Flux</h2>
      <div className={kpi.kpis}>
        <div className={kpi.kpi} title="Entre l’entrée en cours d’un ticket et sa fin, sur 90 jours">
          <span className={kpi.kpiLabel}>Temps de cycle médian</span>
          <span className={kpi.kpiValue}>{duration(flow.cycle.median)}</span>
          <span className={page.faint}>
            {flow.finished
              ? `85 % des tickets en moins de ${duration(flow.cycle.p85)} · ${flow.finished} mesuré${flow.finished > 1 ? 's' : ''}`
              : 'Aucun ticket terminé sur 90 jours'}
          </span>
        </div>
        <div className={kpi.kpi} title="Entre la création d’un ticket et sa fin, sur 90 jours">
          <span className={kpi.kpiLabel}>Délai complet médian</span>
          <span className={kpi.kpiValue}>{duration(flow.lead)}</span>
          <span className={page.faint}>De la création à la fin</span>
        </div>
        <div className={kpi.kpi}>
          <span className={kpi.kpiLabel}>Débit</span>
          <span className={kpi.kpiValue}>{weekly.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}</span>
          <span className={styles.weeks} aria-label="Tickets terminés par semaine">
            {flow.throughput.map(w => (
              <span
                key={w.week}
                title={`Semaine du ${weekLabel(w.week)} : ${w.count} terminé${w.count > 1 ? 's' : ''}`}
                style={{ height: `${Math.max(8, (w.count / top) * 100)}%` }}
                data-empty={!w.count || undefined}
              />
            ))}
          </span>
          <span className={page.faint}>tickets par semaine, {flow.throughput.length} dernières</span>
        </div>
        <div className={kpi.kpi} data-alert={stale.length || undefined}>
          <span className={kpi.kpiLabel}>Tickets qui stagnent</span>
          <span className={kpi.kpiValue}>{stale.length}</span>
          <span className={page.faint}>
            {flow.cycle.p85 === null
              ? 'Mesurable après les premiers tickets terminés'
              : `En cours depuis plus de ${duration(flow.cycle.p85)}`}
          </span>
        </div>
      </div>

      <div className={kpi.grid2}>
        <section>
          <h3 className={styles.h3}>Où passe le temps</h3>
          {flow.finished ? (
            <ul className={styles.steps}>
              {flow.steps.map(s => (
                <li
                  key={s.id}
                  data-top={(s.category === 'doing' && s.days === slowest && slowest > 0) || undefined}
                >
                  <span>{s.name}</span>
                  <span className={styles.bar}>
                    <span style={{ width: `${longest ? (s.days / longest) * 100 : 0}%` }} />
                  </span>
                  <span className={styles.n}>{duration(s.days)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={page.faint}>Le temps moyen par étape apparaît dès qu’un ticket est terminé.</p>
          )}
          <p className={page.faint}>
            Temps moyen passé dans chaque étape par un ticket terminé ; l’étape de travail la plus longue est
            mise en avant.
          </p>
        </section>
        <section>
          <h3 className={styles.h3}>En cours, du plus ancien au plus récent</h3>
          {flow.aging.length ? (
            <ul className={styles.aging}>
              {flow.aging.slice(0, SHOWN).map(a => (
                <li key={a.ticket.id} data-stale={a.stale || undefined}>
                  <Link to={`/realisation/ticket/${a.ticket.id}`} className={styles.id}>
                    {a.ticket.id}
                  </Link>
                  <span className={styles.title} title={a.ticket.title}>
                    {a.ticket.title || 'Sans titre'}
                  </span>
                  <span className={page.faint}>
                    {stepOf(settings, a.ticket.status)?.name} depuis {duration(a.inStep)}
                  </span>
                  <span className={styles.age} title="Temps écoulé depuis l’entrée en cours">
                    {duration(a.age)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={page.faint}>Aucun ticket en cours.</p>
          )}
          {flow.aging.length > SHOWN ? (
            <p className={page.faint}>et {flow.aging.length - SHOWN} autres, plus récents.</p>
          ) : null}
        </section>
      </div>
    </>
  );
}
