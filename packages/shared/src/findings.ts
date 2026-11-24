import type { Campaign } from './delivery';

/**
 * Retours de recette : tout ce qu'un test fait remonter (anomalie, demande d'évolution, question,
 * remarque), rattaché à une campagne et, s'il y a lieu, à un cas de test. Un retour est qualifié,
 * corrigé par un ticket, retesté, puis clos ; il peut être rouvert autant de fois qu'il le faut.
 */

export const FINDING_NATURES = ['bug', 'change', 'question', 'remark'] as const;
export type FindingNature = (typeof FINDING_NATURES)[number];
export const FINDING_NATURE_LABEL: Record<FindingNature, string> = {
  bug: 'Anomalie',
  change: 'Demande d’évolution',
  question: 'Question',
  remark: 'Remarque',
};

/** Du plus grave au moins grave. */
export const FINDING_SEVERITIES = ['blocking', 'major', 'minor', 'cosmetic'] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];
export const FINDING_SEVERITY_LABEL: Record<FindingSeverity, string> = {
  blocking: 'Bloquant',
  major: 'Majeur',
  minor: 'Mineur',
  cosmetic: 'Cosmétique',
};

export const FINDING_STATUSES = ['new', 'open', 'retest', 'closed', 'rejected'] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];
export const FINDING_STATUS_LABEL: Record<FindingStatus, string> = {
  new: 'À qualifier',
  open: 'En correction',
  retest: 'À retester',
  closed: 'Clos',
  rejected: 'Écarté',
};

/** Éléments qu'un retour peut citer : pour retrouver le contexte, et le retour depuis ces éléments. */
export const FINDING_LINK_KINDS = ['story', 'ticket', 'risk', 'diligence', 'finding'] as const;
export type FindingLinkKind = (typeof FINDING_LINK_KINDS)[number];
export const FINDING_LINK_LABEL: Record<FindingLinkKind, string> = {
  story: 'US',
  ticket: 'Ticket',
  risk: 'Risque',
  diligence: 'Diligence',
  finding: 'Retour',
};
export interface FindingLink {
  kind: FindingLinkKind;
  id: string;
}

/** Étape de la vie d'un retour : qui, quand, de quel état à quel état, et pourquoi. */
export interface FindingStep {
  at: string;
  by: string;
  from: FindingStatus | '';
  to: FindingStatus;
  note: string;
}

export interface Finding {
  /** RET-01. */
  id: string;
  campaign: string;
  /** Cas de test concerné (clé « US:critère »), ou vide : retour hors critère. */
  caseKey: string;
  /** US concernée, si elle est connue. */
  story: string;
  title: string;
  nature: FindingNature;
  severity: FindingSeverity;
  status: FindingStatus;
  /** Étapes pour reproduire. */
  steps: string;
  expected: string;
  actual: string;
  /** Où le retour a été constaté : navigateur, appareil, compte de test, version. */
  environment: string;
  /** Ticket qui porte la correction. */
  ticket: string;
  /** Éléments liés : autres tickets, US, risques, diligences, retours. Absent des premiers retours. */
  related?: FindingLink[];
  /** Motif, pour un retour écarté (doublon, non reproductible, hors périmètre…). */
  reason: string;
  /** Auteur du retour : il est prévenu quand il faut retester. */
  reporter: string;
  reporterName: string;
  createdAt: string;
  updatedAt: string;
  history: FindingStep[];
}

/** Retour encore à traiter : ni clos ni écarté. */
export const isOpenFinding = (f: Pick<Finding, 'status'>) => f.status !== 'closed' && f.status !== 'rejected';

/** Nombre de fois où le retour est revenu en correction après un retest. */
export const reopenCount = (f: Pick<Finding, 'history'>) =>
  f.history.filter(h => h.from === 'retest' && h.to === 'open').length;

const rank = (s: FindingSeverity) => FINDING_SEVERITIES.indexOf(s);
/** Tri : à retester d'abord, puis à qualifier, puis par gravité, les plus anciens en tête. */
export function byUrgency(a: Finding, b: Finding) {
  const order: FindingStatus[] = ['retest', 'new', 'open', 'closed', 'rejected'];
  return (
    order.indexOf(a.status) - order.indexOf(b.status) ||
    rank(a.severity) - rank(b.severity) ||
    a.createdAt.localeCompare(b.createdAt)
  );
}

export interface FindingSummary {
  total: number;
  open: number;
  toQualify: number;
  toRetest: number;
  /** Retours ouverts par gravité. */
  bySeverity: Record<FindingSeverity, number>;
}

export function findingSummary(findings: Finding[]): FindingSummary {
  const open = findings.filter(isOpenFinding);
  return {
    total: findings.length,
    open: open.length,
    toQualify: open.filter(f => f.status === 'new').length,
    toRetest: open.filter(f => f.status === 'retest').length,
    bySeverity: Object.fromEntries(
      FINDING_SEVERITIES.map(s => [s, open.filter(f => f.severity === s).length]),
    ) as Record<FindingSeverity, number>,
  };
}

export const findingsOf = (findings: Finding[], campaign: string) =>
  findings.filter(f => f.campaign === campaign);

/**
 * Ce qui s'oppose à la clôture d'une campagne : cas non passés, et retours bloquants ou majeurs
 * encore ouverts. Vide : la campagne peut être close sans réserve.
 */
export function closingObstacles(
  campaign: Campaign,
  cases: { result?: { status: string } }[],
  findings: Finding[],
) {
  const s = findingSummary(findingsOf(findings, campaign.id));
  const todo = cases.filter(c => !c.result?.status).length;
  const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;
  return [
    todo ? plural(todo, 'cas de test reste à passer', 'cas de test restent à passer') : '',
    s.bySeverity.blocking
      ? plural(s.bySeverity.blocking, 'retour bloquant ouvert', 'retours bloquants ouverts')
      : '',
    s.bySeverity.major ? plural(s.bySeverity.major, 'retour majeur ouvert', 'retours majeurs ouverts') : '',
    s.toRetest ? plural(s.toRetest, 'correction à retester', 'corrections à retester') : '',
  ].filter(Boolean);
}

/** Retours qui concernent un élément : par leur ticket de correction, leur US, ou un lien. */
export const findingsAbout = (findings: Finding[], kind: FindingLinkKind, id: string) =>
  findings.filter(
    f =>
      (kind === 'ticket' && f.ticket === id) ||
      (kind === 'story' && f.story === id) ||
      (f.related ?? []).some(l => l.kind === kind && l.id === id),
  );
