import type { AgendaItem, Epic, Reference, Workshop } from '@board/shared';
import { api } from './api';
import { ops } from './store';

/**
 * Programme et épiques construits dans l'outil : création, suppression, ordre du jour. Les
 * modifications de champs passent par updateWorkshop, updateSession et updateEpic du store.
 */
export const programme = {
  createWorkshop: async (patch?: Partial<Workshop>, id?: string) => {
    const w = await ops.send('workshop', 'new', () =>
      api.post<Workshop>('/workshops', { patch, ...(id ? { id } : {}) }),
    );
    ops.replace('workshop', w.id, w);
    return w.id;
  },
  deleteWorkshop: async (id: string) => {
    await ops.send('workshop', id, () => api.delete(`/workshops/${id}`));
    ops.replace('workshop', id, null);
  },
  /** Ajoute une séquence en fin de journée ; renvoie son code. */
  createSession: async (workshop: string) => {
    const w = await ops.send('workshop', workshop, () =>
      api.post<Workshop>(`/workshops/${workshop}/sessions`, {}),
    );
    ops.replace('workshop', w.id, w);
    return w.sessions.at(-1)?.code ?? '';
  },
  deleteSession: async (workshop: string, code: string) => {
    const w = await ops.send('workshop', workshop, () =>
      api.delete<Workshop>(`/workshops/${workshop}/sessions/${encodeURIComponent(code)}`),
    );
    ops.replace('workshop', w.id, w);
  },
  setAgenda: (workshop: string, agenda: AgendaItem[]) => {
    ops.local('workshop', workshop, (w: Workshop) => ({ ...w, agenda }));
    ops.defer(`agenda:${workshop}`, 'workshop', workshop, { agenda }, p =>
      api.put(`/workshops/${workshop}/agenda`, p),
    );
  },
  createEpic: async (patch?: Partial<Epic>, id?: string) => {
    const e = await ops.send('epic', 'new', () => api.post<Epic>('/epics', { patch, ...(id ? { id } : {}) }));
    ops.replace('epic', e.id, e);
    return e.id;
  },
  createReference: async () => {
    const r = await ops.send('reference', 'new', () => api.post<Reference>('/references', {}));
    ops.replace('reference', r.id, r);
    return r.id;
  },
  updateReference: (id: string, patch: Partial<Omit<Reference, 'id'>>) => {
    ops.local('reference', id, (r: Reference) => ({ ...r, ...patch }));
    ops.defer(`reference:${id}`, 'reference', id, patch, p => api.patch(`/references/${id}`, p));
  },
  deleteReference: async (id: string) => {
    await ops.send('reference', id, () => api.delete(`/references/${id}`));
    ops.replace('reference', id, null);
  },
  deleteEpic: async (id: string) => {
    await ops.send('epic', id, () => api.delete(`/epics/${id}`));
    ops.replace('epic', id, null);
  },
};
