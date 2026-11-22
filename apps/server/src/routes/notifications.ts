import { Hono } from 'hono';
import { z } from 'zod';
import { EMAIL_MODES } from '@board/shared';
import { requireRole, type AppEnv } from '../auth';
import { feed, followState, markRead, markTargetRead, people, setFollow } from '../notifications';
import { getPrefs, savePrefs, unsubscribe } from '../notificationMail';
import '../notificationRules';
import { pushEnabled, subscribePush, unsubscribePush } from '../push';
import { env } from '../env';
import { body } from './workspace';

/** Notifications de la personne connectée, suivi d'un élément, et annuaire des membres à mentionner. */
export const notificationRoutes = new Hono<AppEnv>();

const read = requireRole('viewer');
const ids = (c: { get: (k: 'project' | 'user') => unknown }) => ({
  project: (c.get('project') as { id: string }).id,
  user: (c.get('user') as { id: string }).id,
});
const Target = z.object({ kind: z.string().min(1).max(40), id: z.string().min(1).max(80) });
const ReadBody = z.union([
  z.object({ all: z.literal(true) }),
  z.object({ ids: z.array(z.string().regex(/^\d+$/)).min(1).max(200) }),
  z.object({ target: Target }),
]);
const FollowBody = z.object({ state: z.enum(['following', 'muted', 'none']) });
const mode = z.enum(EMAIL_MODES);
const flag = z.boolean();
const PrefsBody = z.object({
  email: z.object({ mentions: mode, assigned: mode, following: mode, project: mode }),
  push: z.object({ mentions: flag, assigned: flag, following: flag, project: flag }),
});
const PushBody = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(300), auth: z.string().min(4).max(100) }),
});

notificationRoutes.get('/notifications', read, async c => {
  const { project, user } = ids(c);
  return c.json(await feed(project, user));
});

notificationRoutes.post('/notifications/read', read, async c => {
  const input = await body(c.req, ReadBody);
  if (!input) return c.json({ error: 'invalid' }, 400);
  const { project, user } = ids(c);
  if ('target' in input) await markTargetRead(project, user, input.target.kind, input.target.id);
  else await markRead(project, user, 'all' in input ? 'all' : input.ids);
  return c.json(await feed(project, user));
});

notificationRoutes.get('/people', read, async c => c.json(await people(ids(c).project)));

notificationRoutes.get('/follow/:kind/:id', read, async c => {
  const { project, user } = ids(c);
  return c.json({ state: await followState(project, user, c.req.param('kind'), c.req.param('id')) });
});

notificationRoutes.put('/follow/:kind/:id', read, async c => {
  const input = await body(c.req, FollowBody);
  const target = Target.safeParse({ kind: c.req.param('kind'), id: c.req.param('id') });
  if (!input || !target.success) return c.json({ error: 'invalid' }, 400);
  const { project, user } = ids(c);
  await setFollow(project, user, target.data.kind, target.data.id, input.state);
  return c.json({ state: input.state });
});

notificationRoutes.get('/notifications/prefs', read, async c => {
  const { project, user } = ids(c);
  return c.json(await getPrefs(project, user));
});

notificationRoutes.put('/notifications/prefs', read, async c => {
  const input = await body(c.req, PrefsBody);
  if (!input) return c.json({ error: 'invalid' }, 400);
  const { project, user } = ids(c);
  return c.json(await savePrefs(project, user, input));
});

/**
 * Lien « ne plus recevoir d'e-mails » des messages : sans connexion, le jeton désigne la personne et
 * le projet. Répond aussi au désabonnement en un clic des messageries (POST).
 */
notificationRoutes.on(['GET', 'POST'], '/notifications/unsubscribe', async c => {
  const board = await unsubscribe(c.req.query('token') ?? '');
  const esc = (s: string) => s.replace(/[&<>"]/g, x => `&#${x.charCodeAt(0)};`);
  return c.html(
    `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NTECH Board</title>
<body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#f7f7f5;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#37352f">
<div style="max-width:420px;margin:16px;padding:32px;border-radius:14px;background:#fff;box-shadow:0 3px 6px rgba(15,15,15,.1),0 9px 24px rgba(15,15,15,.12)">
<h1 style="margin:0 0 8px;font-size:20px">${board ? 'C’est noté' : 'Lien invalide'}</h1>
<p style="margin:0;line-height:1.5;color:#6b6a66">${
      board
        ? `Vous ne recevrez plus d’e-mails de notification de « ${esc(board)} ». Les notifications restent visibles dans le tableau, et le rythme des e-mails se règle à nouveau depuis la cloche, onglet Préférences.`
        : 'Ce lien de désabonnement n’est plus valable. Réglez vos e-mails depuis le tableau : cloche, onglet Préférences.'
    }</p></div></body></html>`,
    board ? 200 : 404,
  );
});

// --- Notifications système (Web Push) ---------------------------------------------------

/** Clé publique à donner au navigateur pour s'abonner ; null si le serveur n'a pas de clés VAPID. */
notificationRoutes.get('/push/key', read, c =>
  c.json({ publicKey: pushEnabled ? env.push.publicKey : null }),
);

notificationRoutes.post('/push/subscriptions', read, async c => {
  const input = await body(c.req, PushBody);
  if (!input) return c.json({ error: 'invalid' }, 400);
  if (!pushEnabled) return c.json({ error: 'push_disabled' }, 409);
  const { project, user } = ids(c);
  await subscribePush(project, user, input, c.req.header('user-agent') ?? '');
  return c.json({ ok: true }, 201);
});

notificationRoutes.post('/push/subscriptions/remove', read, async c => {
  const input = await body(c.req, z.object({ endpoint: z.url().max(1000) }));
  if (!input) return c.json({ error: 'invalid' }, 400);
  await unsubscribePush(ids(c).user, input.endpoint);
  return c.json({ ok: true });
});
