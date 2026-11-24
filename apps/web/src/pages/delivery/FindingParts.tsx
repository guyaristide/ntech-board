import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  byUrgency,
  FINDING_NATURES,
  FINDING_NATURE_LABEL,
  FINDING_SEVERITIES,
  FINDING_SEVERITY_LABEL,
  FINDING_STATUS_LABEL,
  findingsOf,
  findingSummary,
  isOpenFinding,
  type Campaign,
  type Finding,
  type FindingNature,
  type FindingSeverity,
} from '@board/shared';
import { ApiError } from '../../model/api';
import { useDelivery } from '../../model/delivery';
import { findings as actions } from '../../model/findings';
import { useCanEdit, useWorkspace } from '../../model/store';
import page from '../Page.module.css';
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

/** Formulaire de signalement d'un retour, libre ou sur un cas de test. */
export function ReportDialog({
  campaign,
  caseKey = '',
  criterion = '',
  actual = '',
  onClose,
}: {
  campaign: Campaign;
  caseKey?: string;
  criterion?: string;
  actual?: string;
  onClose: (created: Finding | null) => void;
}) {
  const [title, setTitle] = useState('');
  const [nature, setNature] = useState<FindingNature>('bug');
  const [severity, setSeverity] = useState<FindingSeverity>('major');
  const [steps, setSteps] = useState('');
  const [expected, setExpected] = useState(criterion);
  const [seen, setSeen] = useState(actual);
  const [environment, setEnvironment] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      onClose(
        await actions.create({
          campaign: campaign.id,
          caseKey,
          title: title.trim(),
          nature,
          severity,
          steps,
          expected,
          actual: seen,
          environment,
        }),
      );
    } catch (err) {
      setError(err instanceof ApiError ? (err.message ?? err.code) : 'Erreur réseau, réessayez.');
      setBusy(false);
    }
  };
  return (
    <div className={styles.backdrop} onMouseDown={e => e.target === e.currentTarget && onClose(null)}>
      <form
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Signaler un retour"
        onSubmit={submit}
      >
        <h2>Signaler un retour</h2>
        <p className={page.faint} style={{ margin: 0 }}>
          {campaign.name}
          {criterion ? ` · cas : ${criterion}` : ' · hors cas de test'}
        </p>
        <label className={styles.field}>
          Titre
          <input
            value={title}
            required
            autoFocus
            maxLength={300}
            placeholder="Ce qui ne va pas, en une phrase"
            onChange={e => setTitle(e.target.value)}
          />
        </label>
        <div className={styles.pair}>
          <label className={styles.field}>
            Nature
            <select value={nature} onChange={e => setNature(e.target.value as FindingNature)}>
              {FINDING_NATURES.map(n => (
                <option key={n} value={n}>
                  {FINDING_NATURE_LABEL[n]}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            Gravité
            <select value={severity} onChange={e => setSeverity(e.target.value as FindingSeverity)}>
              {FINDING_SEVERITIES.map(s => (
                <option key={s} value={s}>
                  {FINDING_SEVERITY_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className={styles.field}>
          Pour reproduire
          <textarea value={steps} placeholder={'1. …\n2. …'} onChange={e => setSteps(e.target.value)} />
        </label>
        <div className={styles.pair}>
          <label className={styles.field}>
            Attendu
            <textarea value={expected} onChange={e => setExpected(e.target.value)} />
          </label>
          <label className={styles.field}>
            Constaté
            <textarea value={seen} onChange={e => setSeen(e.target.value)} />
          </label>
        </div>
        <label className={styles.field}>
          Environnement
          <input
            value={environment}
            maxLength={500}
            placeholder="Navigateur, appareil, compte de test…"
            onChange={e => setEnvironment(e.target.value)}
          />
        </label>
        <p className={page.faint} style={{ margin: 0 }}>
          Les captures d’écran s’ajoutent sur la fiche du retour, juste après.
        </p>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <p className={styles.dialogActions}>
          <button type="button" className={page.outline} onClick={() => onClose(null)}>
            Annuler
          </button>
          <button type="submit" className={page.primary} disabled={busy || !title.trim()}>
            Signaler
          </button>
        </p>
      </form>
    </div>
  );
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
