import type { ThreadComment, ThreadKind } from '@board/shared';
import { api } from './api';
import { ops } from './store';

/** Fils de discussion : écrire, répondre, modifier, supprimer. Les messages arrivent aussi par le temps réel. */
export const threads = {
  post: (target: { kind: ThreadKind; id: string }, text: string, replyTo?: string) =>
    ops.send('comment', 'new', () =>
      api.post<ThreadComment>('/comments', { target, text, ...(replyTo ? { replyTo } : {}) }),
    ),
  edit: (id: string, text: string) =>
    ops.send('comment', id, () => api.patch<ThreadComment>(`/comments/${id}`, { text })),
  remove: async (id: string) => {
    const { kept } = await ops.send('comment', id, () =>
      api.delete<{ kept: ThreadComment | null }>(`/comments/${id}`),
    );
    ops.replace('comment', id, kept);
  },
};
