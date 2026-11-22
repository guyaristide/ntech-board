import {
  isThreadKind,
  pathOf,
  riskLevel,
  riskScore,
  ROLE_LABEL,
  stepOf,
  type Attachment,
  type Diligence,
  type EntityKind,
  type Risk,
  type Role,
  type Sprint,
  type ThreadComment,
  type Ticket,
} from '@board/shared';
import { pool } from './db';
import { allMembers, autoFollow, followers, notifyUsers, usersOfParty, usersOfText } from './notifications';
import { getEntity, getSettings, onChange, type Change } from './repo';

/**
 * Règles de notification : qui prévenir, de quoi. Elles s'appuient sur les changements validés
 * (avant / après), sans toucher aux routes : toute écriture, d'où qu'elle vienne (interface, MCP),
 * prévient de la même façon.
 */

const excerpt = (text: string, max = 180) =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

async function actorOf(userId: string | null) {
  if (!userId) return { id: null, name: 'Le tableau' };
  const { rows } = await pool.query<{ name: string; email: string }>(
    'SELECT name, email FROM users WHERE id = $1',
    [userId],
  );
  return { id: userId, name: rows[0]?.name || rows[0]?.email.split('@')[0] || 'Quelqu’un' };
}

/** Nom lisible d'un élément : « ETO-12 · Paiement », « Sprint 2 », « contrat.pdf ». */
function labelOf(kind: string, e: Record<string, unknown> | null, id: string) {
  if (!e) return id;
  const s = (k: string) => (typeof e[k] === 'string' ? (e[k] as string) : '');
  if (
    kind === 'sprint' ||
    kind === 'release' ||
    kind === 'campaign' ||
    kind === 'party' ||
    kind === 'attachment'
  )
    return s('name') || id;
  const title = s('title') || s('subject');
  return title ? `${id} · ${title}` : id;
}

/** Où mène une notification sur un élément, son nom, et le type qui décide de sa visibilité. */
async function place(projectId: string, kind: string, id: string) {
  const entity = (await getEntity(projectId, kind as EntityKind, id)) as unknown as Record<
    string,
    unknown
  > | null;
  if (kind === 'attachment' && entity) {
    const owner = (entity as unknown as Attachment).owner;
    return { label: labelOf(kind, entity, id), path: pathOf(owner.kind, owner.id), visibility: owner.kind };
  }
  return { label: labelOf(kind, entity, id), path: pathOf(kind, id), visibility: kind };
}

async function onComment(ch: Change<'comment'>) {
  const c: ThreadComment = ch.after;
  const { kind, id } = c.target;
  const actor = await actorOf(ch.userId);
  const { label, path, visibility } = await place(ch.projectId, kind, id);
  const body = excerpt(c.text);
  const told = new Set<string>();
  const send = async (users: string[], type: 'mention' | 'reply' | 'comment', title: string) => {
    const fresh = users.filter(u => !told.has(u));
    fresh.forEach(u => told.add(u));
    await notifyUsers(ch.projectId, actor, fresh, { type, target: c.target, title, body, path }, visibility);
  };
  // Du plus personnel au plus général : une personne n'est prévenue qu'une fois par message.
  await send(c.mentions ?? [], 'mention', `${actor.name} vous a mentionné sur ${label}`);
  if (c.replyTo) {
    const parent = await getEntity(ch.projectId, 'comment', c.replyTo);
    if (parent?.author) await send([parent.author], 'reply', `${actor.name} vous a répondu sur ${label}`);
  }
  await send(await followers(ch.projectId, kind, id), 'comment', `${actor.name} a écrit sur ${label}`);
  // Qui écrit ou est nommé dans un fil suit la suite.
  await autoFollow(ch.projectId, [ch.userId], kind, id, 'commenter');
  await autoFollow(ch.projectId, c.mentions ?? [], kind, id, 'mentioned');
}

async function onTicket(ch: Change<'ticket'>) {
  const before: Ticket | null = ch.before;
  const after: Ticket = ch.after;
  const actor = await actorOf(ch.userId);
  const target = { kind: 'ticket', id: after.id };
  const label = labelOf('ticket', after as unknown as Record<string, unknown>, after.id);
  const path = pathOf('ticket', after.id);
  const assigned =
    after.assignee && after.assignee !== before?.assignee
      ? await usersOfParty(ch.projectId, after.assignee)
      : [];
  if (assigned.length) {
    await notifyUsers(ch.projectId, actor, assigned, {
      type: 'assigned',
      target,
      title: `${actor.name} vous a attribué ${label}`,
      path,
    });
    await autoFollow(ch.projectId, assigned, 'ticket', after.id, 'assignee');
  }
  if (before && before.status !== after.status) {
    const settings = await getSettings(ch.projectId);
    const name = (status: string) => stepOf(settings, status)?.name ?? status;
    const users = [
      ...(await usersOfParty(ch.projectId, after.assignee)),
      ...(await followers(ch.projectId, 'ticket', after.id)),
    ].filter(u => !assigned.includes(u));
    await notifyUsers(ch.projectId, actor, users, {
      type: 'status',
      target,
      title: `${label} passe à « ${name(after.status)} »`,
      body: `${actor.name} · depuis « ${name(before.status)} »`,
      bodyFrom: from => `${actor.name} · depuis « ${name(from)} »`,
      path,
      change: { from: before.status, to: after.status },
    });
  }
}

async function onSprint(ch: Change<'sprint'>) {
  const before = ch.before as Sprint;
  const after: Sprint = ch.after;
  if (before.status === after.status || after.status === 'planned') return;
  const actor = await actorOf(ch.userId);
  const started = after.status === 'active';
  await notifyUsers(ch.projectId, actor, await allMembers(ch.projectId), {
    type: 'sprint',
    target: { kind: 'sprint', id: after.id },
    title: started ? `${after.name} a démarré` : `${after.name} est clos`,
    body: started
      ? after.goal
      : `${after.delivered ?? 0} ticket(s) terminé(s), ${after.carried.length} reporté(s)`,
    path: pathOf('sprint', after.id),
  });
}

const criticality = (r: Risk) => riskLevel(riskScore(r.residual) ?? riskScore(r.initial));

async function onRisk(ch: Change<'risk'>) {
  const after: Risk = ch.after;
  if (criticality(after) !== 'Critique' || criticality(ch.before as Risk) === 'Critique') return;
  const actor = await actorOf(ch.userId);
  const users = [
    ...(await followers(ch.projectId, 'risk', after.id)),
    ...(await allMembers(ch.projectId, ['admin'])),
  ];
  await notifyUsers(ch.projectId, actor, users, {
    type: 'risk',
    target: { kind: 'risk', id: after.id },
    title: `Le risque ${labelOf('risk', after as unknown as Record<string, unknown>, after.id)} devient critique`,
    body: `Coté par ${actor.name}`,
    path: pathOf('risk', after.id),
  });
}

/** Personnes nouvellement désignées par un responsable en texte libre : celles d'après, moins celles d'avant. */
async function newlyNamed(projectId: string, before: string | undefined, after: string) {
  if (!after.trim() || after === before) return [];
  const old = new Set(before ? await usersOfText(projectId, before) : []);
  return (await usersOfText(projectId, after)).filter(u => !old.has(u));
}

async function onDiligence(ch: Change<'diligence'>) {
  const before = ch.before as Diligence | null;
  const after: Diligence = ch.after;
  const actor = await actorOf(ch.userId);
  const target = { kind: 'diligence', id: after.id };
  const label = labelOf('diligence', after as unknown as Record<string, unknown>, after.id);
  const path = pathOf('diligence', after.id);
  const assigned = await newlyNamed(ch.projectId, before?.owner, after.owner);
  if (assigned.length) {
    await notifyUsers(ch.projectId, actor, assigned, {
      type: 'assigned',
      target,
      title: `${actor.name} vous a confié la diligence ${label}`,
      body: after.due ? `Échéance : ${after.due}` : '',
      path,
    });
    await autoFollow(ch.projectId, assigned, 'diligence', after.id, 'assignee');
  }
  if (before && before.status !== after.status) {
    const users = [
      ...(await usersOfText(ch.projectId, after.owner)),
      ...(await followers(ch.projectId, 'diligence', after.id)),
    ].filter(u => !assigned.includes(u));
    await notifyUsers(ch.projectId, actor, users, {
      type: 'status',
      target,
      title: `La diligence ${label} passe à « ${after.status} »`,
      body: `${actor.name} · depuis « ${before.status} »`,
      bodyFrom: from => `${actor.name} · depuis « ${from} »`,
      path,
      change: { from: before.status, to: after.status },
    });
  }
}

/** Risque : propriétaire, responsable d'action et responsable de chaque action du plan. */
async function onRiskOwners(ch: Change<'risk'>) {
  const before = ch.before as Risk | null;
  const after: Risk = ch.after;
  const actor = await actorOf(ch.userId);
  const target = { kind: 'risk', id: after.id };
  const label = labelOf('risk', after as unknown as Record<string, unknown>, after.id);
  const path = pathOf('risk', after.id);
  const tell = async (users: string[], title: string, body: string, key: string) => {
    if (!users.length) return;
    await notifyUsers(ch.projectId, actor, users, {
      type: 'assigned',
      target,
      groupKey: `assigned:risk:${after.id}:${key}`,
      title,
      body,
      path,
    });
    await autoFollow(ch.projectId, users, 'risk', after.id, 'assignee');
  };
  await tell(
    await newlyNamed(ch.projectId, before?.owner, after.owner),
    `${actor.name} vous a désigné propriétaire du risque ${label}`,
    '',
    'owner',
  );
  await tell(
    await newlyNamed(ch.projectId, before?.actionOwner, after.actionOwner),
    `${actor.name} vous a désigné responsable d’action du risque ${label}`,
    '',
    'actionOwner',
  );
  for (const action of after.actions) {
    const was = before?.actions.find(a => a.id === action.id);
    await tell(
      await newlyNamed(ch.projectId, was?.owner, action.owner),
      `${actor.name} vous a confié une action sur le risque ${label}`,
      excerpt(action.text),
      `action:${action.id}`,
    );
  }
}

/** Fil résolu : son auteur est prévenu (sauf s'il l'a résolu lui-même). */
async function onResolved(ch: Change<'comment'>) {
  const c: ThreadComment = ch.after;
  if (!c.resolvedAt || ch.before?.resolvedAt || !c.author) return;
  const actor = await actorOf(ch.userId);
  const { label, path, visibility } = await place(ch.projectId, c.target.kind, c.target.id);
  await notifyUsers(
    ch.projectId,
    actor,
    [c.author],
    {
      type: 'reply',
      target: c.target,
      groupKey: `resolved:${c.id}`,
      title: `${actor.name} a marqué votre fil résolu sur ${label}`,
      body: excerpt(c.text),
      path,
    },
    visibility,
  );
}

/** Propositions tirées d'un échange : les éditeurs sont prévenus une fois, pas une fois par proposition. */
async function onProposal(ch: Change<'proposal'>) {
  await notifyUsers(ch.projectId, await actorOf(null), await allMembers(ch.projectId, ['admin', 'editor']), {
    type: 'proposal',
    target: { kind: '', id: '' },
    groupKey: 'proposal:inbox',
    title: 'De nouvelles propositions sont à relire',
    body: `Tirées de l’échange ${ch.after.source}`,
    path: '/a-relire',
  });
}

/** Nouveau membre : les administrateurs sont prévenus (appelé par la route d'invitation). */
export async function notifyNewMember(projectId: string, by: string, name: string, role: Role) {
  await notifyUsers(projectId, await actorOf(by), await allMembers(projectId, ['admin']), {
    type: 'member',
    target: { kind: '', id: '' },
    groupKey: `member:${name}`,
    title: `${name} rejoint le projet`,
    body: `Rôle : ${ROLE_LABEL[role]}`,
    path: '/admin',
  });
}

onChange(async ch => {
  // Qui crée un élément suit ce qui s'y passe ensuite.
  if (!ch.before && isThreadKind(ch.kind) && ch.kind !== 'attachment')
    await autoFollow(ch.projectId, [ch.userId], ch.kind, ch.id, 'author');
  if (ch.kind === 'comment' && !ch.before) return onComment(ch as Change<'comment'>);
  if (ch.kind === 'comment') return onResolved(ch as Change<'comment'>);
  if (ch.kind === 'diligence') return onDiligence(ch as Change<'diligence'>);
  if (ch.kind === 'ticket') return onTicket(ch as Change<'ticket'>);
  if (ch.kind === 'sprint' && ch.before) return onSprint(ch as Change<'sprint'>);
  if (ch.kind === 'risk') {
    await onRiskOwners(ch as Change<'risk'>);
    if (ch.before) await onRisk(ch as Change<'risk'>);
    return;
  }
  if (ch.kind === 'proposal' && !ch.before) return onProposal(ch as Change<'proposal'>);
});
