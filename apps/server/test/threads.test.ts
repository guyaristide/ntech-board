import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  commentCount,
  groupOf,
  isDeliveryComment,
  mentionsIn,
  pathOf,
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

test('mentions : « @Nom » d’un membre, le nom le plus long d’abord, sans doublon', () => {
  const people = [
    { userId: 'u1', name: 'Marc' },
    { userId: 'u2', name: 'Marc Kouassi' },
    { userId: 'u3', name: 'Awa Diallo' },
  ];
  assert.deepEqual(mentionsIn('@Marc Kouassi peux-tu voir avec @Awa Diallo ?', people).sort(), ['u2', 'u3']);
  assert.deepEqual(mentionsIn('Merci @Marc, et encore @Marc.', people), ['u1']);
  assert.deepEqual(mentionsIn('marc@exemple.com sans mention', people), []);
});

test('notifications : adresse d’un élément et famille d’un type', () => {
  assert.equal(pathOf('ticket', 'ETO-12'), '/realisation/ticket/ETO-12');
  assert.equal(pathOf('story', 'US-UC01-03'), '/us/US-UC01-03');
  assert.equal(pathOf('phase', 'P 1'), '/raci?phase=P%201');
  assert.equal(groupOf('reply'), 'mentions');
  assert.equal(groupOf('status'), 'assigned');
  assert.equal(groupOf('sprint'), 'project');
});

test('fil résolu : ses messages ne comptent plus parmi les messages en cours', () => {
  const comments = [
    msg('a', '2026-11-20T09:00', { resolvedAt: '2026-11-21T10:00', resolvedBy: 'Awa' }),
    msg('a1', '2026-11-20T09:30', { replyTo: 'a' }),
    msg('b', '2026-11-20T10:00'),
    msg('b1', '2026-11-20T10:30', { replyTo: 'b' }),
  ];
  assert.equal(commentCount(comments, 'story', 'US-1'), 2);
  assert.deepEqual(
    threadOf(comments, 'story', 'US-1').map(e => [e.comment.id, !!e.comment.resolvedAt]),
    [
      ['a', true],
      ['b', false],
    ],
  );
});
