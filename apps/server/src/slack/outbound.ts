import {
  pathOf,
  riskLevel,
  riskScore,
  slackEscape,
  slackLink,
  stepOf,
  type EntityKind,
  type Release,
  type Risk,
  type SlackEventGroup,
  type Sprint,
  type ThreadComment,
  type Ticket,
} from '@board/shared';
import { pool } from '../db';
import { env } from '../env';
import { fail, log, warn } from '../log';
import { originFor } from '../notificationMail';
import { getEntity, getSettings, onChange, type Change } from '../repo';
import { noteSent, slackTarget } from './store';

/**
 * Publication dans Slack. Chaque changement validé (interface, MCP, commande Slack) est mis en file ;
 * il part après un temps de calme, pour que des changements en rafale ne fassent qu'un message : un
 * ticket qui change trois fois d'étape en une minute donne un seul message (de la première étape à la
 * dernière), et aucun s'il revient à son étape de départ. Le message est rédigé à l'envoi, avec le
 * titre que l'élément a alors.
 */

interface Payload {
  group: SlackEventGroup;
  type: 'created' | 'status' | 'sprint' | 'release' | 'risk' | 'comment' | 'diligence';
  kind: EntityKind;
  id: string;
  /** État de départ (étape, statut), gardé du premier changement de la rafale. */
  from?: string;
  actor: string;
}

async function enqueue(projectId: string, key: string, payload: Payload, to?: string) {
  const target = await slackTarget(projectId);
  if (!target?.events.includes(payload.group)) return;
  const existing = await pool.query<{ payload: Payload }>(
    'SELECT payload FROM slack_outbox WHERE project_id = $1 AND group_key = $2',
    [projectId, key],
  );
  const from = existing.rows[0]?.payload.from ?? payload.from;
  // Revenu à l'état de départ pendant le temps de calme : il ne s'est rien passé.
  if (existing.rows[0] && to !== undefined && to === from) {
    await pool.query('DELETE FROM slack_outbox WHERE project_id = $1 AND group_key = $2', [projectId, key]);
    return;
  }
  await pool.query(
    `INSERT INTO slack_outbox (project_id, group_key, payload, send_after)
     VALUES ($1, $2, $3, now() + make_interval(secs => $4))
     ON CONFLICT (project_id, group_key) DO UPDATE SET payload = $3, send_after = EXCLUDED.send_after, attempts = 0`,
    [projectId, key, { ...payload, from }, env.slackQuietSeconds],
  );
}

async function actorName(userId: string | null) {
  if (!userId) return 'Le tableau';
  const { rows } = await pool.query<{ name: string; email: string }>(
    'SELECT name, email FROM users WHERE id = $1',
    [userId],
  );
  return rows[0]?.name || rows[0]?.email.split('@')[0] || 'Quelqu’un';
}

const critical = (r: Risk | null) =>
  !!r && riskLevel(riskScore(r.residual) ?? riskScore(r.initial)) === 'Critique';

onChange(async (ch: Change) => {
  if (!(await slackTarget(ch.projectId))) return;
  const actor = await actorName(ch.userId);
  const base = { kind: ch.kind, id: ch.id, actor };
  if (ch.kind === 'ticket') {
    const before = ch.before as Ticket | null;
    const after = ch.after as Ticket;
    if (!before)
      return enqueue(ch.projectId, `created:ticket:${ch.id}`, { ...base, group: 'tickets', type: 'created' });
    if (before.status !== after.status)
      return enqueue(
        ch.projectId,
        `status:ticket:${ch.id}`,
        { ...base, group: 'tickets', type: 'status', from: before.status },
        after.status,
      );
  }
  if (ch.kind === 'sprint' && ch.before) {
    const before = ch.before as Sprint;
    const after = ch.after as Sprint;
    if (before.status !== after.status && after.status !== 'planned')
      return enqueue(ch.projectId, `sprint:${ch.id}:${after.status}`, {
        ...base,
        group: 'sprints',
        type: 'sprint',
      });
  }
  if (ch.kind === 'release' && ch.before) {
    const before = ch.before as Release;
    const after = ch.after as Release;
    if (before.status !== after.status && after.status === 'Livrée')
      return enqueue(ch.projectId, `release:${ch.id}`, { ...base, group: 'sprints', type: 'release' });
  }
  if (ch.kind === 'risk' && critical(ch.after as Risk) && !critical(ch.before as Risk | null))
    return enqueue(ch.projectId, `risk:${ch.id}`, { ...base, group: 'risks', type: 'risk' });
  if (ch.kind === 'comment' && !ch.before)
    return enqueue(ch.projectId, `comment:${ch.id}`, { ...base, group: 'comments', type: 'comment' });
  if (ch.kind === 'diligence' && ch.before) {
    const before = (ch.before as { status: string }).status;
    const after = (ch.after as { status: string }).status;
    if (before !== after)
      return enqueue(
        ch.projectId,
        `status:diligence:${ch.id}`,
        { ...base, group: 'diligences', type: 'diligence', from: before },
        after,
      );
  }
});

const excerpt = (text: string, max = 240) =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

/** Texte du message, rédigé à l'envoi ; null si l'élément n'existe plus ou si le message n'a plus lieu d'être. */
async function render(projectId: string, origin: string, p: Payload): Promise<string | null> {
  const entity = (await getEntity(projectId, p.kind, p.id)) as unknown as Record<string, unknown> | null;
  if (!entity) return null;
  const s = (k: string) => (typeof entity[k] === 'string' ? (entity[k] as string) : '');
  const named = (kind: string, id: string, e: Record<string, unknown>) => {
    const title = ['sprint', 'release', 'campaign', 'party'].includes(kind)
      ? String(e.name ?? '')
      : String(e.title ?? e.subject ?? '');
    return slackLink(
      `${origin}${pathOf(kind, id)}`,
      title ? (kind === 'sprint' || kind === 'release' ? title : `${id} · ${title}`) : id,
    );
  };
  const link = named(p.kind, p.id, entity);
  const by = slackEscape(p.actor);
  const settings = await getSettings(projectId);
  const step = (id: string) => stepOf(settings, id)?.name ?? id;
  switch (p.type) {
    case 'created': {
      const t = entity as unknown as Ticket;
      const type = settings.delivery.ticketTypes.find(x => x.id === t.type)?.name ?? t.type;
      return `*Nouveau ticket* ${link}\n${slackEscape(type)} · ${slackEscape(step(t.status))} · créé par ${by}`;
    }
    case 'status': {
      const to = s('status');
      if (to === p.from) return null;
      return `${link} passe à *${slackEscape(step(to))}*\nDepuis « ${slackEscape(step(p.from ?? ''))} » · ${by}`;
    }
    case 'sprint': {
      const sp = entity as unknown as Sprint;
      return sp.status === 'active'
        ? `*${link} a démarré*${sp.goal ? `\nObjectif : ${slackEscape(sp.goal)}` : ''}`
        : `*${link} est clos*\n${sp.delivered ?? 0} ticket(s) terminé(s), ${sp.carried?.length ?? 0} reporté(s)`;
    }
    case 'release':
      return `*La version ${link} est livrée* · ${by}`;
    case 'risk':
      return `*Risque devenu critique* ${link}\nCoté par ${by}`;
    case 'diligence': {
      const to = s('status');
      if (to === p.from) return null;
      return `Diligence ${link} : *${slackEscape(to)}*\nDepuis « ${slackEscape(p.from ?? '')} » · ${by}`;
    }
    case 'comment': {
      const c = entity as unknown as ThreadComment;
      if (c.deleted) return null;
      const target =
        c.target.kind === 'attachment'
          ? null
          : await getEntity(projectId, c.target.kind as EntityKind, c.target.id);
      const where = target
        ? named(c.target.kind, c.target.id, target as unknown as Record<string, unknown>)
        : slackEscape(c.target.id);
      return `*${by}* sur ${where}\n> ${slackEscape(excerpt(c.text)).replace(/\n/g, '\n> ')}`;
    }
  }
}

/** Envoie un message au webhook ; renvoie '' si Slack l'a accepté, sinon la raison. */
export async function postToSlack(
  url: string,
  text: string,
): Promise<{ ok: boolean; gone: boolean; error: string }> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, unfurl_links: false }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return { ok: true, gone: false, error: '' };
    const body = (await res.text().catch(() => '')).slice(0, 120);
    // 403, 404, 410 : webhook révoqué ou canal archivé, inutile d'insister.
    return {
      ok: false,
      gone: [403, 404, 410].includes(res.status),
      error: `Slack a répondu ${res.status} ${body}`.trim(),
    };
  } catch (err) {
    return { ok: false, gone: false, error: `Slack injoignable : ${(err as Error).message}` };
  }
}

const MAX_ATTEMPTS = 5;

async function flush() {
  const { rows } = await pool.query<{
    id: string;
    project_id: string;
    slug: string;
    payload: Payload;
    attempts: number;
  }>(
    `SELECT o.id, o.project_id, p.slug, o.payload, o.attempts FROM slack_outbox o
       JOIN projects p ON p.id = o.project_id
      WHERE o.send_after <= now() ORDER BY o.id LIMIT 40`,
  );
  for (const r of rows) {
    const target = await slackTarget(r.project_id);
    const text = target ? await render(r.project_id, originFor(r.slug), r.payload).catch(() => null) : null;
    if (!target || !text) {
      await pool.query('DELETE FROM slack_outbox WHERE id = $1', [r.id]);
      continue;
    }
    const sent = await postToSlack(target.url, text);
    if (sent.ok) {
      await pool.query('DELETE FROM slack_outbox WHERE id = $1', [r.id]);
      await noteSent(r.project_id);
    } else if (sent.gone || r.attempts + 1 >= MAX_ATTEMPTS) {
      await pool.query('DELETE FROM slack_outbox WHERE id = $1', [r.id]);
      await noteSent(r.project_id, sent.error);
      warn('slack', `Message abandonné pour « ${r.slug} » : ${sent.error}`);
    } else {
      // Nouvel essai de plus en plus tard : 1, 2, 4, 8 minutes.
      await pool.query(
        `UPDATE slack_outbox SET attempts = attempts + 1, send_after = now() + make_interval(mins => $2) WHERE id = $1`,
        [r.id, 2 ** r.attempts],
      );
      await noteSent(r.project_id, sent.error);
    }
  }
  if (rows.length) log('slack', `${rows.length} message(s) traité(s).`);
}

/** Vide la file toutes les quinze secondes. */
export function startSlackJobs() {
  let busy = false;
  setInterval(() => {
    if (busy) return;
    busy = true;
    flush()
      .catch(err => fail('slack', 'Publication dans Slack interrompue', err))
      .finally(() => (busy = false));
  }, 15_000).unref();
}
