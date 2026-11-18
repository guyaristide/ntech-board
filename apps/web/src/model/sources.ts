import type { ReferenceFields, SourceItem } from '@board/shared';
import { api } from './api';
import { ops } from './store';

/**
 * Échanges et propositions à relire. L'analyse tourne sur le serveur : son avancement et les
 * propositions arrivent par le temps réel, comme toute autre modification.
 */
export const sources = {
  deposit: async (input: {
    title: string;
    text: string;
    origin: 'paste' | 'upload';
    url: string;
    occurredAt: string | null;
    participants: string;
  }) => {
    const s = await ops.send('source', 'new', () => api.post<SourceItem>('/sources', input));
    ops.replace('source', s.id, s);
    return s;
  },
  analyze: (id: string) => api.post(`/sources/${id}/analyze`, {}),
  remove: async (id: string) => {
    await ops.send('source', id, () => api.delete(`/sources/${id}`));
    ops.replace('source', id, null);
  },
  accept: (id: string, edit: { fields?: ReferenceFields; target?: string } = {}) =>
    api.post<{ result: string }>(`/proposals/${id}/accept`, edit),
  reject: (id: string, reason = '') => api.post(`/proposals/${id}/reject`, { reason }),
  acceptMany: (ids: string[]) => api.post<{ done: number }>('/proposals/accept', { ids }),
  rejectMany: (ids: string[], reason = '') => api.post('/proposals/reject', { ids, reason }),
};
