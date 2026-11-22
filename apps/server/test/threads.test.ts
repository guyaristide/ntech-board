import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  commentCount,
  isDeliveryComment,
  threadOf,
  type Attachment,
  type ThreadComment,
} from '@board/shared';

const msg = (id: string, at: string, patch: Partial<ThreadComment> = {}): ThreadComment => ({
  id,
  target: { kind: 'story', id: 'US-1' },
  replyTo: '',
  author: 'u1',
  authorName: 'Awa',
  text: id,
  at,
  editedAt: null,
  deleted: false,
  ...patch,
});

test('fil : messages par date, réponses sous leur message, autres éléments ignorés', () => {
  const comments = [
    msg('b', '2026-11-20T10:00'),
    msg('a', '2026-11-20T09:00'),
    msg('a2', '2026-11-20T11:00', { replyTo: 'a' }),
    msg('a1', '2026-11-20T09:30', { replyTo: 'a' }),
    msg('x', '2026-11-20T08:00', { target: { kind: 'ticket', id: 'US-1' } }),
  ];
  const t = threadOf(comments, 'story', 'US-1');
  assert.deepEqual(
    t.map(e => [e.comment.id, e.replies.map(r => r.id)]),
    [
      ['a', ['a1', 'a2']],
      ['b', []],
    ],
  );
  assert.equal(commentCount(comments, 'story', 'US-1'), 4);
});

test('fil : un message supprimé reste tant qu’il a des réponses ; une réponse orpheline remonte', () => {
  const comments = [
    msg('a', '2026-11-20T09:00', { deleted: true, text: '' }),
    msg('a1', '2026-11-20T09:30', { replyTo: 'a' }),
    msg('b', '2026-11-20T10:00', { deleted: true, text: '' }),
    msg('c1', '2026-11-20T11:00', { replyTo: 'disparu' }),
  ];
  assert.deepEqual(
    threadOf(comments, 'story', 'US-1').map(e => [e.comment.id, e.replies.length]),
    [
      ['a', 1],
      ['c1', 0],
    ],
  );
  assert.equal(commentCount(comments, 'story', 'US-1'), 2);
});

test('fil d’une pièce jointe : visible comme l’élément qui porte le fichier', () => {
  const files = [
    { id: 'PJ-1', owner: { kind: 'ticket', id: 'T-1' } },
    { id: 'PJ-2', owner: { kind: 'story', id: 'US-1' } },
  ] as Attachment[];
  assert.equal(isDeliveryComment({ target: { kind: 'attachment', id: 'PJ-1' } }, files), true);
  assert.equal(isDeliveryComment({ target: { kind: 'attachment', id: 'PJ-2' } }, files), false);
  assert.equal(isDeliveryComment({ target: { kind: 'sprint', id: 'SP-1' } }, files), true);
});
