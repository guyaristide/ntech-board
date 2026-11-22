import type {
  ImportReport,
  Member,
  PlatformAdmin,
  PlatformOverview,
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
