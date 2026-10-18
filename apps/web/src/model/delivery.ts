import { useShallow } from 'zustand/react/shallow';
import type { Release, Sprint, Ticket, TicketLinkType } from '@board/shared';
export { byRank, rankAt } from '@board/shared';
import { api } from './api';
import { ops, useWorkspace } from './store';

/**
 * Actions de la partie Réalisation : versions, sprints, tickets. Mêmes principes que le reste du
 * store : modification locale immédiate, envoi regroupé, version du serveur réintégrée.
 */
type Editable<T> = Partial<Omit<T, 'id'>>;

const created = <T extends { id: string }>(kind: 'release' | 'sprint' | 'ticket', items: T[]) => {
  for (const item of items) ops.replace(kind, item.id, item);
  return items;
};

export const delivery = {
  createRelease: async (patch?: Editable<Release>) => {
    const r = await ops.send('release', 'new', () => api.post<Release>('/releases', { patch }));
    return created('release', [r])[0].id;
  },
  updateRelease: (id: string, patch: Editable<Release>) => {
    ops.local('release', id, (r: Release) => ({ ...r, ...patch }));
    ops.defer(`release:${id}`, 'release', id, patch, p => api.patch(`/releases/${id}`, p));
  },
  deleteRelease: async (id: string) => {
    await ops.send('release', id, () => api.delete(`/releases/${id}`));
    ops.replace('release', id, null);
  },

  createSprint: async (patch?: Editable<Sprint>) => {
    const s = await ops.send('sprint', 'new', () => api.post<Sprint>('/sprints', { patch }));
    return created('sprint', [s])[0].id;
  },
  updateSprint: (id: string, patch: Editable<Sprint>) => {
    ops.local('sprint', id, (s: Sprint) => ({ ...s, ...patch }));
    ops.defer(`sprint:${id}`, 'sprint', id, patch, p => api.patch(`/sprints/${id}`, p));
  },
  deleteSprint: async (id: string) => {
    await ops.send('sprint', id, () => api.delete(`/sprints/${id}`));
    ops.replace('sprint', id, null);
  },
  startSprint: (id: string) => ops.send('sprint', id, () => api.post<Sprint>(`/sprints/${id}/start`)),
  /** Les tickets non terminés partent au backlog (moveTo vide) ou dans le sprint indiqué. */
  closeSprint: (id: string, moveTo: string) =>
    ops.send('sprint', id, () => api.post<Sprint>(`/sprints/${id}/close`, { moveTo })),

  /** Passe des US du cadrage en réalisation : un ticket « US » chacune. */
  addStories: async (stories: string[], patch?: Editable<Ticket>) =>
    created('ticket', await ops.send('ticket', 'new', () => api.post<Ticket[]>('/tickets', { stories, patch }))),
  createTicket: async (patch: Editable<Ticket> & { title: string }) =>
    created('ticket', await ops.send('ticket', 'new', () => api.post<Ticket[]>('/tickets', { patch })))[0].id,
  updateTicket: (id: string, patch: Editable<Ticket>) => {
    ops.local('ticket', id, (t: Ticket) => ({ ...t, ...patch, updatedAt: new Date().toISOString() }));
    ops.defer(`ticket:${id}`, 'ticket', id, patch, p => api.patch(`/tickets/${id}`, p));
  },
  deleteTicket: async (id: string) => {
    await ops.send('ticket', id, () => api.delete(`/tickets/${id}`));
    ops.replace('ticket', id, null);
  },
  // L'autre ticket reçoit la liaison inverse par le flux temps réel.
  linkTickets: (id: string, ticket: string, type: TicketLinkType) =>
    ops.send('ticket', id, () => api.post<Ticket>(`/tickets/${id}/links`, { ticket, type })),
  unlinkTickets: async (id: string, other: string) => {
    ops.local('ticket', id, (t: Ticket) => ({ ...t, links: t.links.filter(l => l.ticket !== other) }));
    await ops.send('ticket', id, () => api.delete<Ticket>(`/tickets/${id}/links/${other}`));
  },
  commentTicket: async (id: string, text: string, author: string) => {
    ops.local('ticket', id, (t: Ticket) => ({
      ...t,
      comments: [...t.comments, { id: 'local', author, at: new Date().toISOString(), text }],
    }));
    await ops.send('ticket', id, () => api.post<Ticket>(`/tickets/${id}/comments`, { text }));
  },
};

/** Données de la partie Réalisation. */
export const useDelivery = () =>
  useWorkspace(
    useShallow(s => ({ settings: s.settings, releases: s.releases, sprints: s.sprints, tickets: s.tickets })),
  );
