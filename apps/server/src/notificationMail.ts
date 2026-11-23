import { randomBytes } from 'node:crypto';
import {
  diligenceOpen,
  groupOf,
  isDone,
  pathOf,
  withPrefDefaults,
  type EmailMode,
  type NotificationPrefs,
  type Diligence,
  type NotificationType,
  type Risk,
  type Ticket,
} from '@board/shared';
import { pool } from './db';
import { env } from './env';
import { fail, log } from './log';
import { esc, layout, sendMail } from './mail';
import { notifyUsers, usersOfParty, usersOfText } from './notifications';
import { getSettings } from './repo';

/**
 * Notifications par e-mail : préférences de chacun, envoi « tout de suite » après un temps de calme,
 * récapitulatif quotidien, rappels d'échéance. Une notification lue dans l'application avant
 * l'envoi ne part pas par e-mail.
 */

// --- Préférences --------------------------------------------------------------------------

export async function getPrefs(projectId: string, userId: string): Promise<NotificationPrefs> {
  const { rows } = await pool.query<{ prefs: Partial<NotificationPrefs> }>(
    'SELECT prefs FROM notification_prefs WHERE project_id = $1 AND user_id = $2',
    [projectId, userId],
  );
  return withPrefDefaults(rows[0]?.prefs);
}

export async function savePrefs(projectId: string, userId: string, prefs: NotificationPrefs) {
  await pool.query(
    `INSERT INTO notification_prefs (project_id, user_id, prefs, unsubscribe_token) VALUES ($1, $2, $3, $4)
     ON CONFLICT (project_id, user_id) DO UPDATE SET prefs = $3`,
    [projectId, userId, prefs, randomBytes(24).toString('base64url')],
  );
  return prefs;
}

/** Jeton du lien de désabonnement, créé à la première utilisation. */
async function unsubscribeToken(projectId: string, userId: string) {
  const { rows } = await pool.query<{ unsubscribe_token: string }>(
    `INSERT INTO notification_prefs (project_id, user_id, unsubscribe_token) VALUES ($1, $2, $3)
     ON CONFLICT (project_id, user_id) DO UPDATE SET project_id = EXCLUDED.project_id
     RETURNING unsubscribe_token`,
    [projectId, userId, randomBytes(24).toString('base64url')],
  );
  return rows[0].unsubscribe_token;
}

/** Coupe tous les e-mails de la personne pour ce projet ; rend le nom du tableau, ou null. */
export async function unsubscribe(token: string): Promise<string | null> {
  const { rows } = await pool.query<{ project_id: string; user_id: string; title: string }>(
    `SELECT f.project_id, f.user_id, p.title FROM notification_prefs f JOIN projects p ON p.id = f.project_id
      WHERE f.unsubscribe_token = $1`,
    [token],
  );
  if (!rows[0]) return null;
  await savePrefs(rows[0].project_id, rows[0].user_id, {
    ...(await getPrefs(rows[0].project_id, rows[0].user_id)),
    email: { mentions: 'off', assigned: 'off', following: 'off', project: 'off' },
  });
  return rows[0].title;
}

// --- Gabarit ------------------------------------------------------------------------------

/** Adresse publique d'un projet, pour les liens des e-mails. */
export const originFor = (slug: string) =>
  env.notify.origin
    ? env.notify.origin.replace('{slug}', slug).replace(/\/$/, '')
    : `https://${env.projectHosts[0].replace('{slug}', slug)}`;

interface Pending {
  id: string;
  project_id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  path: string;
  count: number;
  email: string;
  slug: string;
  board: string;
  prefs: Partial<NotificationPrefs> | null;
}

async function send(items: Pending[], digest: boolean) {
  const first = items[0];
  const origin = originFor(first.slug);
  const token = await unsubscribeToken(first.project_id, first.user_id);
  const stop = `${origin}/api/notifications/unsubscribe?token=${token}`;
  const subject = digest
    ? `Votre récapitulatif · ${first.board}`
    : items.length === 1
      ? `${first.title} · ${first.board}`
      : `${items.length} notifications · ${first.board}`;
  const rows = items
    .map(
      n => `<tr><td style="padding:12px 0;border-top:1px solid #eeeeec">
<a href="${origin}${n.path}" style="color:#1c1b19;font-weight:600;text-decoration:none;line-height:1.4">${esc(n.title)}</a>
${n.body ? `<div style="margin-top:4px;color:#6b6a66;font-size:14px;line-height:1.5">${esc(n.body)}</div>` : ''}
${n.count > 1 ? `<div style="margin-top:4px;color:#8a8984;font-size:12px">${n.count} changements regroupés</div>` : ''}
</td></tr>`,
    )
    .join('');
  const intro = digest
    ? `Ce qui s’est passé pour vous sur <strong>${esc(first.board)}</strong> et que vous n’avez pas encore vu.`
    : `Sur <strong>${esc(first.board)}</strong> :`;
  const html = layout(
    digest
      ? 'Votre récapitulatif'
      : items.length === 1
        ? 'Une notification pour vous'
        : 'Des notifications pour vous',
    `<p style="margin:0 0 8px;line-height:1.5">${intro}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`,
    {
      label: items.length === 1 ? 'Ouvrir' : 'Ouvrir le tableau',
      url: `${origin}${items.length === 1 ? first.path : '/'}`,
    },
    origin,
    `Le rythme de ces e-mails se règle dans le tableau : cloche, puis Préférences.<br><a href="${stop}" style="color:#8a8984">Ne plus recevoir d’e-mails de ce tableau</a><br><br>`,
  );
  const text = `${items.map(n => `- ${n.title}${n.body ? `\n  ${n.body}` : ''}\n  ${origin}${n.path}`).join('\n\n')}\n\nNe plus recevoir d’e-mails de ce tableau : ${stop}`;
  await sendMail(first.email, subject, html, text, {
    'List-Unsubscribe': `<${stop}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  });
}

// --- Envois -------------------------------------------------------------------------------

const modeOf = (n: Pending): EmailMode => withPrefDefaults(n.prefs).email[groupOf(n.type)];

/**
 * Notifications à envoyer, réservées dans la même requête (emailed_at posé) : deux instances du
 * serveur n'envoient pas deux fois. Celles dont la personne ne veut pas d'e-mail sont libérées.
 */
async function claim(where: string, params: unknown[], wanted: EmailMode): Promise<Pending[][]> {
  const { rows } = await pool.query<Pending>(
    `SELECT n.id, n.project_id, n.user_id, n.type, n.title, n.body, n.path, n.count,
            u.email, p.slug, p.title AS board, f.prefs
       FROM notifications n
       JOIN users u ON u.id = n.user_id
       JOIN projects p ON p.id = n.project_id
       JOIN memberships m ON m.project_id = n.project_id AND m.user_id = n.user_id
       LEFT JOIN notification_prefs f ON f.project_id = n.project_id AND f.user_id = n.user_id
      WHERE n.emailed_at IS NULL AND n.read_at IS NULL AND ${where}
      ORDER BY n.updated_at`,
    params,
  );
  const mine = rows.filter(n => modeOf(n) === wanted);
  if (!mine.length) return [];
  const taken = await pool.query<{ id: string }>(
    'UPDATE notifications SET emailed_at = now() WHERE id = ANY($1::bigint[]) AND emailed_at IS NULL RETURNING id',
    [mine.map(n => n.id)],
  );
  const ok = new Set(taken.rows.map(r => String(r.id)));
  const groups = new Map<string, Pending[]>();
  for (const n of mine.filter(n => ok.has(String(n.id)))) {
    const key = `${n.project_id}:${n.user_id}`;
    groups.set(key, [...(groups.get(key) ?? []), n]);
  }
  return [...groups.values()];
}

async function deliver(groups: Pending[][], digest: boolean) {
  for (const items of groups)
    await send(items, digest).catch(err => fail('mail', `Notification non envoyée à ${items[0].email}`, err));
}

/**
 * E-mails « tout de suite » : une notification part quand elle n'a plus bougé depuis le temps de
 * calme (des changements en rafale n'en font qu'une, envoyée une fois la rafale passée), ou au plus
 * tard une demi-heure après sa création.
 */
export async function sendInstant() {
  await deliver(
    await claim(
      `(n.updated_at < now() - make_interval(mins => $1) OR n.created_at < now() - interval '30 minutes')`,
      [env.notify.quietMinutes],
      'instant',
    ),
    false,
  );
}

/** Récapitulatif quotidien : ce qui est en mode récapitulatif et toujours non lu. */
export const sendDigests = async () => deliver(await claim('true', [], 'digest'), true);

/** Rappels d'échéance : les tickets non terminés à rendre aujourd'hui ou demain, une fois par jour. */
export async function remindDueTickets() {
  const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  const { rows } = await pool.query<{ project_id: string; data: Ticket }>(
    `SELECT project_id, data FROM entities WHERE kind = 'ticket' AND data->>'due' = ANY($1) AND data->>'assignee' <> ''`,
    [[day(0), day(1)]],
  );
  for (const { project_id, data: t } of rows) {
    if (isDone(await getSettings(project_id), t)) continue;
    const today = t.due === day(0);
    await notifyUsers(
      project_id,
      { id: null, name: 'Le tableau' },
      await usersOfParty(project_id, t.assignee),
      {
        type: 'due',
        target: { kind: 'ticket', id: t.id },
        groupKey: `due:ticket:${t.id}:${t.due}:${today ? 'today' : 'tomorrow'}`,
        once: true,
        title: `${t.id} · ${t.title} est à rendre ${today ? 'aujourd’hui' : 'demain'}`,
        path: pathOf('ticket', t.id),
      },
    );
  }
}

/** Rappels d'échéance des diligences à mener et des actions de risque en cours, à leur responsable. */
export async function remindDueOwners() {
  const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  const when = (due: string) => (due === day(0) ? 'aujourd’hui' : due === day(1) ? 'demain' : null);
  const system = { id: null, name: 'Le tableau' };
  const diligences = await pool.query<{ project_id: string; data: Diligence }>(
    `SELECT project_id, data FROM entities WHERE kind = 'diligence' AND data->>'due' = ANY($1)`,
    [[day(0), day(1)]],
  );
  for (const { project_id, data: d } of diligences.rows) {
    const at = when(d.due);
    if (!at || !diligenceOpen(d.status)) continue;
    await notifyUsers(project_id, system, await usersOfText(project_id, d.owner), {
      type: 'due',
      target: { kind: 'diligence', id: d.id },
      groupKey: `due:diligence:${d.id}:${d.due}:${at}`,
      once: true,
      title: `La diligence ${d.id} · ${d.title} est à rendre ${at}`,
      path: pathOf('diligence', d.id),
    });
  }
  const risks = await pool.query<{ project_id: string; data: Risk }>(
    `SELECT project_id, data FROM entities e WHERE kind = 'risk'
        AND EXISTS (SELECT 1 FROM jsonb_array_elements(e.data->'actions') a WHERE a->>'due' = ANY($1))`,
    [[day(0), day(1)]],
  );
  for (const { project_id, data: r } of risks.rows)
    for (const a of r.actions) {
      const at = when(a.due);
      if (!at || a.status === 'Réalisée' || a.status === 'Abandonnée') continue;
      await notifyUsers(project_id, system, await usersOfText(project_id, a.owner), {
        type: 'due',
        target: { kind: 'risk', id: r.id },
        groupKey: `due:risk:${r.id}:${a.id}:${a.due}:${at}`,
        once: true,
        title: `Une action du risque ${r.id} · ${r.title} est à rendre ${at}`,
        body: a.text,
        path: pathOf('risk', r.id),
      });
    }
}

/** Vrai une seule fois par jour et par tâche, toutes instances confondues. */
export async function firstRunToday(name: string) {
  const { rowCount } = await pool.query(
    `INSERT INTO job_runs (name, ran_on) VALUES ($1, current_date)
     ON CONFLICT (name) DO UPDATE SET ran_on = current_date WHERE job_runs.ran_on < current_date`,
    [name],
  );
  return !!rowCount;
}

async function tick() {
  await sendInstant();
  if (new Date().getHours() >= env.notify.digestHour && (await firstRunToday('notifications-daily'))) {
    await remindDueTickets();
    await remindDueOwners();
    await sendDigests();
    log('notifications', 'Rappels d’échéance et récapitulatifs du jour envoyés.');
  }
}

/** Lance les envois : toutes les minutes, sans bloquer l'arrêt du serveur. */
export function startNotificationJobs() {
  let busy = false;
  setInterval(() => {
    if (busy) return;
    busy = true;
    tick()
      .catch(err => fail('notifications', 'Envoi des notifications interrompu', err))
      .finally(() => (busy = false));
  }, 60_000).unref();
}
