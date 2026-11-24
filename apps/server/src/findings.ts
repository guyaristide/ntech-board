import { isDone, pathOf, stepOf, type Finding, type FindingStatus, type Ticket } from '@board/shared';
import { notifyUsers, usersOfParty } from './notifications';
import { pool } from './db';
import { all, deleteEntity, getEntity, getSettings, mutate, onChange, onDelete, type Change } from './repo';

/**
 * Vie d'un retour de recette, et ses automatismes : quand le ticket d'un retour est terminé, le
 * retour passe « à retester », son cas de test redevient à passer et son auteur est prévenu ; le
 * résultat du retest clôt le retour ou le renvoie en correction (le ticket est alors rouvert).
 */

const now = () => new Date().toISOString();
type Actor = { id: string; name: string };

/** Change l'état d'un retour, en gardant la trace de l'étape. */
export const moveFinding = (
  projectId: string,
  id: string,
  actor: Actor,
  to: FindingStatus,
  note = '',
  extra: Partial<Finding> = {},
) =>
  mutate(
    projectId,
    'finding',
    id,
    actor.id,
    'status',
    f => ({
      ...f,
      ...extra,
      status: to,
      updatedAt: now(),
      history: [...f.history, { at: now(), by: actor.name, from: f.status, to, note }],
    }),
    { status: to, note },
  );

/** Résultat du cas de test d'un retour : remis « à passer » au retest, « OK » à la clôture. */
async function setCase(projectId: string, f: Finding, actor: Actor, status: '' | 'ok') {
  if (!f.caseKey) return;
  const campaign = await getEntity(projectId, 'campaign', f.campaign);
  if (!campaign || !campaign.results[f.caseKey] || campaign.results[f.caseKey].status === status) return;
  await mutate(
    projectId,
    'campaign',
    campaign.id,
    actor.id,
    'result',
    c => ({
      ...c,
      results: { ...c.results, [f.caseKey]: { ...c.results[f.caseKey], status, by: actor.name, at: now() } },
    }),
    { key: f.caseKey, status, finding: f.id },
  );
}

const label = (f: Finding) => `${f.id} · ${f.title}`;

/** Le ticket est terminé : le retour est à retester par son auteur. */
async function toRetest(projectId: string, f: Finding, actor: Actor, ticket: Ticket) {
  await moveFinding(projectId, f.id, actor, 'retest', `${ticket.id} terminé`);
  await setCase(projectId, f, actor, '');
  await notifyUsers(projectId, { id: actor.id, name: actor.name }, [f.reporter], {
    type: 'status',
    target: { kind: 'finding', id: f.id },
    title: `À retester : ${label(f)}`,
    body: `${actor.name} a terminé ${ticket.id} · ${ticket.title}`,
    path: pathOf('finding', f.id),
  });
}

/**
 * Résultat d'un retest. Corrigé : le retour est clos et son cas passe à OK. Toujours en défaut : le
 * retour revient en correction, son ticket repart à la première étape et son responsable est prévenu.
 */
export async function retestFinding(
  projectId: string,
  f: Finding,
  actor: Actor,
  fixed: boolean,
  note: string,
) {
  if (fixed) {
    const closed = await moveFinding(projectId, f.id, actor, 'closed', note || 'Correction vérifiée');
    await setCase(projectId, f, actor, 'ok');
    return closed;
  }
  const reopened = await moveFinding(projectId, f.id, actor, 'open', note || 'Toujours en défaut');
  const ticket = f.ticket ? await getEntity(projectId, 'ticket', f.ticket) : null;
  if (ticket) {
    const settings = await getSettings(projectId);
    if (isDone(settings, ticket))
      await mutate(
        projectId,
        'ticket',
        ticket.id,
        actor.id,
        'update',
        t => ({ ...t, status: settings.delivery.workflow[0].id, updatedAt: now() }),
        { status: settings.delivery.workflow[0].id },
      );
    await notifyUsers(projectId, actor, await usersOfParty(projectId, ticket.assignee), {
      type: 'status',
      target: { kind: 'finding', id: f.id },
      title: `Retest en échec : ${label(f)}`,
      body: note || `${actor.name} constate que le défaut est toujours là (${ticket.id} rouvert)`,
      path: pathOf('finding', f.id),
    });
  }
  return reopened;
}

/**
 * Un cas de test vient de recevoir un résultat : s'il porte un retour à retester, le résultat vaut
 * retest (OK : corrigé ; KO ou réserve : toujours en défaut).
 */
export async function onCaseResult(
  projectId: string,
  campaign: string,
  key: string,
  status: string,
  actor: Actor,
) {
  if (!['ok', 'ko', 'reserve'].includes(status)) return;
  const waiting = (await all<Finding>(projectId, 'finding')).filter(
    f => f.campaign === campaign && f.caseKey === key && f.status === 'retest',
  );
  for (const f of waiting) await retestFinding(projectId, { ...f, caseKey: '' }, actor, status === 'ok', '');
}

async function actorOf(userId: string | null): Promise<Actor> {
  if (!userId) return { id: '', name: 'Le tableau' };
  const { rows } = await pool.query<{ name: string; email: string }>(
    'SELECT name, email FROM users WHERE id = $1',
    [userId],
  );
  return { id: userId, name: rows[0]?.name || rows[0]?.email.split('@')[0] || 'Quelqu’un' };
}

onChange(async (ch: Change) => {
  if (ch.kind !== 'ticket' || !ch.before) return;
  const before = ch.before as Ticket;
  const after = ch.after as Ticket;
  if (before.status === after.status) return;
  const settings = await getSettings(ch.projectId);
  const was = stepOf(settings, before.status)?.category === 'done';
  const is = stepOf(settings, after.status)?.category === 'done';
  if (was === is) return;
  const linked = (await all<Finding>(ch.projectId, 'finding')).filter(f => f.ticket === after.id);
  if (!linked.length) return;
  const actor = await actorOf(ch.userId);
  for (const f of linked) {
    if (is && (f.status === 'open' || f.status === 'new')) await toRetest(ch.projectId, f, actor, after);
    // Ticket rouvert avant le retest : il n'y a plus rien à retester pour l'instant.
    else if (!is && f.status === 'retest')
      await moveFinding(ch.projectId, f.id, actor, 'open', `${after.id} rouvert`);
  }
});

/** Une campagne supprimée emporte ses retours (les tickets ouverts restent). */
onDelete(async (projectId, userId, kind, id) => {
  if (kind !== 'campaign') return;
  for (const f of await all<Finding>(projectId, 'finding'))
    if (f.campaign === id) await deleteEntity(projectId, userId, 'finding', f.id);
});
