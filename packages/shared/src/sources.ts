import type { Reference, ReferenceSource } from './types';

/**
 * Sources externes : un échange reçu (transcription, fil Slack, compte rendu) et les propositions
 * que l'IA en tire. Rien n'entre dans le board sans qu'un éditeur ait accepté la proposition.
 */

export type SourceOrigin = 'paste' | 'upload' | 'mcp' | 'fireflies' | 'slack' | 'email';
export const SOURCE_ORIGIN_LABEL: Record<SourceOrigin, string> = {
  paste: 'Texte collé',
  upload: 'Fichier déposé',
  mcp: 'Assistant (MCP)',
  fireflies: 'Fireflies',
  slack: 'Slack',
  email: 'E-mail',
};

/** reçu → analyse en cours → analysé (ou en erreur, à relancer). */
export type SourceStatus = 'pending' | 'analyzing' | 'done' | 'error';
export const SOURCE_STATUS_LABEL: Record<SourceStatus, string> = {
  pending: 'En attente d’analyse',
  analyzing: 'Analyse en cours',
  done: 'Analysé',
  error: 'Analyse en erreur',
};

export interface SourceItem {
  /** Clé lisible : SRC-01. */
  id: string;
  title: string;
  origin: SourceOrigin;
  /** Lien vers l'original (fil Slack, réunion), s'il existe. */
  url: string;
  /** Date de l'échange (AAAA-MM-JJ). */
  occurredAt: string | null;
  participants: string;
  text: string;
  status: SourceStatus;
  /** Message d'erreur de la dernière analyse. */
  error: string;
  createdAt: string;
  createdBy: string;
}

export type ProposalKind = 'reference.create' | 'reference.update';
export type ProposalStatus = 'pending' | 'accepted' | 'rejected';
export type Confidence = 'high' | 'medium' | 'low';
export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: 'Confiance haute',
  medium: 'Confiance moyenne',
  low: 'Confiance basse',
};

/** Champs d'une Référence qu'une proposition peut écrire. */
export interface ReferenceFields {
  subject?: string;
  says?: string[];
  where?: string;
  gaps?: string;
}

export interface Proposal {
  /** Clé lisible : PRO-01. */
  id: string;
  /** Élément source d'origine. */
  source: string;
  kind: ProposalKind;
  /** Référence visée par une mise à jour ; vide pour une création. */
  target: string;
  fields: ReferenceFields;
  /** Citation exacte de l'échange qui justifie la proposition. */
  quote: string;
  /** Pourquoi l'IA propose ce changement, en une ou deux phrases. */
  rationale: string;
  confidence: Confidence;
  status: ProposalStatus;
  decidedBy: string;
  decidedAt: string | null;
  /** Motif d'un rejet. */
  reason: string;
  /** Référence créée ou modifiée à l'acceptation. */
  result: string;
  createdAt: string;
}

/** Texte comparable : casse, accents, ponctuation typographique et espaces neutralisés. */
const flat = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/**
 * La citation figure-t-elle dans l'échange ? Une proposition dont la citation est introuvable est
 * écartée : l'IA ne peut rien affirmer qui ne soit écrit dans la source.
 */
export function quoteFound(text: string, quote: string) {
  const q = flat(quote)
    .replace(/^\.{3}|\.{3}$/g, '')
    .trim();
  if (q.length < 12) return false;
  const hay = flat(text);
  // Une citation abrégée par « ... » : chaque morceau doit s'y trouver, dans l'ordre.
  let from = 0;
  for (const part of q.split(/\s*\.{3}\s*/).filter(Boolean)) {
    const at = hay.indexOf(part, from);
    if (at < 0) return false;
    from = at + part.length;
  }
  return true;
}

/** Retire les champs vides ou inchangés d'une proposition de mise à jour. */
export function changedFields(current: Reference | null, fields: ReferenceFields): ReferenceFields {
  const out: ReferenceFields = {};
  const says = fields.says?.map(s => s.trim()).filter(Boolean);
  if (fields.subject?.trim() && fields.subject.trim() !== current?.subject)
    out.subject = fields.subject.trim();
  if (says?.length && JSON.stringify(says) !== JSON.stringify(current?.says ?? [])) out.says = says;
  if (fields.where?.trim() && fields.where.trim() !== current?.where) out.where = fields.where.trim();
  if (fields.gaps?.trim() && fields.gaps.trim() !== current?.gaps) out.gaps = fields.gaps.trim();
  return out;
}

/**
 * Référence après acceptation : les champs proposés remplacent les actuels, et l'échange s'ajoute à
 * ses sources. `reference` est null pour une création.
 */
export function applyProposal(
  reference: Reference | null,
  proposal: Pick<Proposal, 'source' | 'quote' | 'fields'>,
  at: string,
): Omit<Reference, 'id'> {
  const base: Omit<Reference, 'id'> = reference
    ? { ...reference }
    : { subject: 'Nouvelle référence', says: [], where: '', gaps: '', sessions: [], sources: [] };
  const entry: ReferenceSource = { source: proposal.source, quote: proposal.quote, at };
  return {
    ...base,
    ...changedFields(reference, proposal.fields),
    sources: [
      ...(base.sources ?? []).filter(s => s.source !== proposal.source || s.quote !== proposal.quote),
      entry,
    ],
  };
}

/** Sous-titres (.vtt, .srt) : on garde la parole, sans numéros de répliques ni horodatages. */
export const cleanTranscript = (name: string, text: string) =>
  /\.(vtt|srt)$/i.test(name)
    ? text
        .split(/\r?\n/)
        .filter(l => !/^(WEBVTT|NOTE\b|\d+\s*$)/.test(l.trim()) && !l.includes('-->'))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    : text.trim();

/** Propositions encore à relire, pour le compteur du menu. */
export const pendingProposals = (proposals: Proposal[]) => proposals.filter(p => p.status === 'pending');
