import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  byUrgency,
  FINDING_NATURE_LABEL,
  FINDING_SEVERITIES,
  FINDING_SEVERITY_LABEL,
  FINDING_STATUS_LABEL,
  findingsOf,
  findingSummary,
  isOpenFinding,
  type Campaign,
  type Finding,
} from '@board/shared';
import { useDelivery } from '../../model/delivery';
import { useCanEdit, useWorkspace } from '../../model/store';
import page from '../Page.module.css';
import { ReportDialog } from './FindingReport';
import recette from './Recette.module.css';
import styles from './Findings.module.css';

export const SeverityTag = ({ f }: { f: Pick<Finding, 'severity'> }) => (
  <span className={styles.severity} data-severity={f.severity}>
    {FINDING_SEVERITY_LABEL[f.severity]}
  </span>
);
export const FindingStatusTag = ({ f }: { f: Pick<Finding, 'status'> }) => (
  <span className={styles.status} data-status={f.status}>
    {FINDING_STATUS_LABEL[f.status]}
  </span>
);

/** Qui peut déposer un retour dans une campagne : l'équipe, et le client si la campagne lui est ouverte. */
export function useCanReport(campaign: Pick<Campaign, 'mode'>) {
  const canEdit = useCanEdit();
  const role = useWorkspace(s => s.session?.role);
  return canEdit || (role === 'viewer' && (campaign.mode === 'client' || campaign.mode === 'mixed'));
}

/** Retours d'un cas de test, en liens courts. */
export function CaseFindings({ campaign, caseKey }: { campaign: string; caseKey: string }) {
  const { findings } = useDelivery();
  const own = findings.filter(f => f.campaign === campaign && f.caseKey === caseKey);
  if (!own.length) return null;
  return (
    <span className={styles.caseLinks}>
      {own.map(f => (
        <Link
          key={f.id}
          to={`/realisation/retour/${f.id}`}
          className={styles.status}
          data-status={f.status}
          title={`${f.title} · ${FINDING_STATUS_LABEL[f.status]}`}
        >
          {f.id}
        </Link>
      ))}
    </span>
  );
}

type Filter = 'open' | 'retest' | 'all';

/** Retours d'une campagne : bilan par gravité, liste triée par urgence, signalement. */
export function FindingsSection({ campaign }: { campaign: Campaign }) {
  const { findings } = useDelivery();
  const canReport = useCanReport(campaign);
  const [filter, setFilter] = useState<Filter>('open');
  const [reporting, setReporting] = useState(false);
  const own = findingsOf(findings, campaign.id);
  const s = findingSummary(own);
  const shown = own
    .filter(f => (filter === 'all' ? true : filter === 'retest' ? f.status === 'retest' : isOpenFinding(f)))
    .sort(byUrgency);
  return (
    <section>
      <div className={styles.head}>
        <h2 className={page.h2}>Retours{own.length ? ` (${s.open} ouverts sur ${own.length})` : ''}</h2>
        {canReport ? (
          <button type="button" className={page.primary} onClick={() => setReporting(true)}>
            + Signaler un retour
          </button>
        ) : null}
      </div>
      <p className={page.faint}>
        Anomalies, demandes d’évolution, questions et remarques relevées pendant la recette. Quand le ticket
        d’un retour est terminé, le retour passe « à retester » et son auteur est prévenu.
      </p>
      {own.length ? (
        <>
          <div className={styles.summary}>
            {FINDING_SEVERITIES.filter(k => s.bySeverity[k]).map(k => (
              <span key={k} className={styles.severity} data-severity={k}>
                {s.bySeverity[k]} {FINDING_SEVERITY_LABEL[k].toLowerCase()}
                {s.bySeverity[k] > 1 ? 's' : ''}
              </span>
            ))}
            {s.toQualify ? <span className={page.faint}>{s.toQualify} à qualifier</span> : null}
            {!s.open ? <span className={page.faint}>Aucun retour ouvert.</span> : null}
          </div>
          <div className={recette.toolbar}>
            {(
              [
                ['open', `Ouverts (${s.open})`],
                ['retest', `À retester (${s.toRetest})`],
                ['all', `Tous (${own.length})`],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                className={recette.filter}
                data-on={filter === k || undefined}
                onClick={() => setFilter(k)}
              >
                {label}
              </button>
            ))}
          </div>
          <ul className={styles.list}>
            {shown.map(f => (
              <li key={f.id} className={styles.row} data-closed={!isOpenFinding(f) || undefined}>
                <Link to={`/realisation/retour/${f.id}`} className={styles.id}>
                  {f.id}
                </Link>
                <Link to={`/realisation/retour/${f.id}`} className={styles.title} title={f.title}>
                  {f.title}
                </Link>
                <span className={styles.meta}>
                  {FINDING_NATURE_LABEL[f.nature]}
                  {f.ticket ? ` · ${f.ticket}` : ''} · {f.reporterName.split(' ')[0]}
                </span>
                <SeverityTag f={f} />
                <FindingStatusTag f={f} />
              </li>
            ))}
          </ul>
          {!shown.length ? <p className={page.faint}>Aucun retour dans cette vue.</p> : null}
        </>
      ) : (
        <p className={page.faint}>Aucun retour pour l’instant.</p>
      )}
      {reporting ? <ReportDialog campaign={campaign} onClose={() => setReporting(false)} /> : null}
    </section>
  );
}
