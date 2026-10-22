import type { AttachableKind, Attachment, StorageBackendView, StorageProvider } from '@board/shared';
import { api, ApiError } from './api';
import { ops } from './store';

/** Pièces jointes et stockages du projet. */

export const fileUrl = (a: Attachment, preview = false) =>
  `/api/attachments/${a.id}/fichier${preview ? '?apercu=1' : ''}`;

/** Envoie un fichier, avec la progression (0 à 1). La pièce jointe arrive aussi par le temps réel. */
export function uploadFile(
  owner: { kind: AttachableKind; id: string },
  file: File,
  onProgress: (p: number) => void,
) {
  return new Promise<Attachment>((resolve, reject) => {
    const form = new FormData();
    form.append('kind', owner.kind);
    form.append('id', owner.id);
    form.append('file', file, file.name);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/attachments');
    xhr.withCredentials = true;
    xhr.upload.onprogress = e => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      const data = (() => {
        try {
          return JSON.parse(xhr.responseText);
        } catch {
          return null;
        }
      })();
      if (xhr.status >= 200 && xhr.status < 300) {
        ops.replace('attachment', data.id, data);
        resolve(data as Attachment);
      } else reject(new ApiError(xhr.status, data?.error ?? 'error', data?.message ?? 'Envoi refusé.'));
    };
    xhr.onerror = () => reject(new ApiError(0, 'network', 'Erreur réseau pendant l’envoi.'));
    xhr.send(form);
  });
}

export async function deleteAttachment(id: string) {
  await ops.send('attachment', id, () => api.delete(`/attachments/${id}`));
  ops.replace('attachment', id, null);
}

export interface StorageState {
  backends: StorageBackendView[];
  local: { files: number; bytes: number };
  canEncrypt: boolean;
}

export interface BackendInput {
  provider: StorageProvider;
  name: string;
  config: Record<string, string | boolean>;
  secret?: string;
  delivery: 'proxy' | 'direct';
}

export const storage = {
  load: () => api.get<StorageState>('/files/storage'),
  create: (input: BackendInput) => api.post<{ id: string }>('/files/backends', input),
  update: (id: string, input: Partial<Omit<BackendInput, 'provider'>>) =>
    api.patch(`/files/backends/${id}`, input),
  remove: (id: string) => api.delete(`/files/backends/${id}`),
  test: (id: string) =>
    api.post<{ ok: boolean; ms?: number; message?: string }>(`/files/backends/${id}/test`),
  migrate: () => api.post<{ moved: number; errors: string[]; remaining: number }>('/files/migrate'),
};
