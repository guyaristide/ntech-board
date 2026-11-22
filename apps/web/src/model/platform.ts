import type {
  ImportReport,
  Member,
  PlatformAdmin,
  PlatformAudit,
  PlatformEvent,
  PlatformOverview,
  PlatformProjectDetail,
  PlatformStatus,
  PlatformUser,
  Role,
} from '@board/shared';
import { api } from './api';

/** Console de la plateforme : appels réservés aux super-administrateurs, sur l'hôte de la console. */
const admin = (slug: string) => `/platform/projects/${encodeURIComponent(slug)}/admin`;

export type ImportKind = 'planning' | 'stories' | 'raci' | 'risks' | 'cadrage' | 'snapshot';

export const platform = {
  overview: () => api.get<PlatformOverview>('/platform/overview'),
  users: () => api.get<PlatformUser[]>('/platform/users'),
  admins: () => api.get<PlatformAdmin[]>('/platform/admins'),
  addAdmin: (email: string) => api.post<PlatformAdmin[]>('/platform/admins', { email }),
  removeAdmin: (email: string) =>
    api.delete<PlatformAdmin[]>(`/platform/admins/${encodeURIComponent(email)}`),

  create: (input: { slug: string; title: string; subtitle: string; admin: string; from?: string }) =>
    api.post<{ slug: string; url: string }>('/platform/projects', input),
  /** Lien d'entrée à usage unique dans le projet. */
  open: (slug: string) => api.post<{ url: string }>(`/platform/projects/${encodeURIComponent(slug)}/open`),
  rename: (slug: string, next: string) =>
    api.patch<{ slug: string; url: string }>(`/platform/projects/${encodeURIComponent(slug)}`, {
      slug: next,
    }),
  revokeSessions: (slug: string) =>
    api.post<{ closed: number }>(`/platform/projects/${encodeURIComponent(slug)}/sessions/revoke`),
  remove: (slug: string, confirm: string) =>
    api.delete<{ deleted: string; files: number; filesLeft: number }>(
      `/platform/projects/${encodeURIComponent(slug)}`,
      { confirm },
    ),

  detail: (slug: string) => api.get<PlatformProjectDetail>(`/platform/projects/${encodeURIComponent(slug)}`),
  events: (slug: string) => api.get<PlatformEvent[]>(`/platform/projects/${encodeURIComponent(slug)}/events`),
  closeSession: (slug: string, id: string) =>
    api.delete<{ closed: number }>(`/platform/projects/${encodeURIComponent(slug)}/sessions/${id}`),
  revokeToken: (slug: string, id: string) =>
    api.delete<{ revoked: number }>(`/platform/projects/${encodeURIComponent(slug)}/tokens/${id}`),
  setDelivery: (slug: string, delivery: boolean) =>
    api.patch<{ ok: true }>(`/platform/projects/${encodeURIComponent(slug)}/settings`, { delivery }),
  duplicate: (slug: string, input: { slug: string; title: string; admin: string; content: boolean }) =>
    api.post<{ slug: string; url: string; copied: string }>(
      `/platform/projects/${encodeURIComponent(slug)}/duplicate`,
      input,
    ),
  updateProject: (slug: string, patch: { title?: string; subtitle?: string }) =>
    api.patch<{ ok: true }>(`${admin(slug)}/project`, patch),
  copySettings: (slug: string, from: string) => api.post<unknown>(`${admin(slug)}/settings/copy`, { from }),
  renameMember: (slug: string, userId: string, name: string) =>
    api.patch<Member[]>(`${admin(slug)}/members/${userId}`, { name }),

  status: () => api.get<PlatformStatus>('/platform/status'),
  audit: () => api.get<PlatformAudit[]>('/platform/audit'),
  verifyMail: () => api.post<{ ok: boolean; message: string }>('/platform/status/mail/verify'),
  testMail: (to?: string) =>
    api.post<{ ok: boolean; message: string }>('/platform/status/mail/test', to ? { to } : {}),

  members: (slug: string) => api.get<Member[]>(`${admin(slug)}/members`),
  addMember: (slug: string, input: { email: string; name: string; role: Role; notify: boolean }) =>
    api.post<Member[]>(`${admin(slug)}/members`, input),
  setRole: (slug: string, userId: string, role: Role) =>
    api.patch<Member[]>(`${admin(slug)}/members/${userId}`, { role }),
  removeMember: (slug: string, userId: string) => api.delete<Member[]>(`${admin(slug)}/members/${userId}`),
  exportUrl: (slug: string) => `/api${admin(slug)}/export`,
  import: (slug: string, kind: ImportKind, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<ImportReport>(`${admin(slug)}/import/${kind}`, form);
  },
};
