import type { BackupInfo, BackupList } from '@board/shared';
import { api } from './api';

/**
 * Sauvegardes d'un projet. `base` est l'administration du projet : « /admin » dans le projet,
 * « /platform/projects/<slug>/admin » depuis la console.
 */
export const backupsOf = (base = '/admin') => ({
  list: () => api.get<BackupList>(`${base}/backups`),
  create: (note = '') => api.post<BackupInfo | null>(`${base}/backups`, { note }),
  downloadUrl: (id: string) => `/api${base}/backups/${id}/download`,
  restore: (id: string, confirm: string) =>
    api.post<{ restored: number; safety: string | null }>(`${base}/backups/${id}/restore`, { confirm }),
  remove: (id: string) => api.delete<{ ok: true }>(`${base}/backups/${id}`),
});

/** Console : toutes les sauvegardes, y compris celles des projets supprimés. */
export const platformBackups = {
  list: () => api.get<BackupList>('/platform/backups'),
  run: () =>
    api.post<{ projects: number; created: number; unchanged: number; removed: number; failed: string[] }>(
      '/platform/backups/run',
    ),
  downloadUrl: (id: string) => `/api/platform/backups/${id}/download`,
  remove: (id: string) => api.delete<{ ok: true }>(`/platform/backups/${id}`),
  restoreAs: (id: string, input: { slug: string; title: string; admin: string; members: boolean }) =>
    api.post<{ slug: string; url: string; restored: number; members: number }>(
      `/platform/backups/${id}/restore-as`,
      input,
    ),
};
