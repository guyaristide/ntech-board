import type { Finding, FindingLink, FindingNature, FindingSeverity, Ticket } from '@board/shared';
import { api } from './api';
import { ops } from './store';

/** Retours de recette : dépôt, contenu, qualification par l'équipe, retest. */
export type FindingDraft = {
  campaign: string;
  caseKey?: string;
  title: string;
  nature?: FindingNature;
  severity?: FindingSeverity;
  steps?: string;
  expected?: string;
  actual?: string;
  environment?: string;
  story?: string;
  related?: FindingLink[];
};
type Content = Partial<
  Pick<
    Finding,
    'title' | 'nature' | 'severity' | 'steps' | 'expected' | 'actual' | 'environment' | 'story' | 'related'
  >
>;
export type FindingDecision =
  | { action: 'accept'; ticket?: string; create?: boolean }
  | { action: 'reject'; reason: string }
  | { action: 'reopen'; note?: string }
  | { action: 'close'; note?: string };

const keep = (f: Finding) => {
  ops.replace('finding', f.id, f);
  return f;
};

export const findings = {
  create: async (draft: FindingDraft) =>
    keep(await ops.send('finding', 'new', () => api.post<Finding>('/findings', draft))),
  update: (id: string, patch: Content) => {
    ops.local('finding', id, (f: Finding) => ({ ...f, ...patch }));
    ops.defer(`finding:${id}`, 'finding', id, patch, p => api.patch(`/findings/${id}`, p));
  },
  decide: async (id: string, decision: FindingDecision) => {
    const r = await ops.send('finding', id, () =>
      api.post<Finding | { finding: Finding; ticket: Ticket | null }>(`/findings/${id}/decision`, decision),
    );
    if ('finding' in r) {
      if (r.ticket) ops.replace('ticket', r.ticket.id, r.ticket);
      return keep(r.finding);
    }
    return keep(r);
  },
  retest: async (id: string, fixed: boolean, note = '') =>
    keep(await ops.send('finding', id, () => api.post<Finding>(`/findings/${id}/retest`, { fixed, note }))),
  remove: async (id: string) => {
    await ops.send('finding', id, () => api.delete(`/findings/${id}`));
    ops.replace('finding', id, null);
  },
};
