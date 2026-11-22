import webpush from 'web-push';
import { pool } from './db';
import { env } from './env';
import { fail, log } from './log';

/**
 * Notifications système (Web Push) : affichées par le téléphone ou l'ordinateur même quand le
 * tableau est fermé. Demandent une paire de clés VAPID (variables VAPID_PUBLIC_KEY et
 * VAPID_PRIVATE_KEY) ; sans elles, la fonction est simplement absente de l'interface.
 */
export const pushEnabled = !!(env.push.publicKey && env.push.privateKey);
if (pushEnabled) webpush.setVapidDetails(env.push.subject, env.push.publicKey, env.push.privateKey);

export function checkPush() {
  log(
    'push',
    pushEnabled
      ? 'Notifications système actives (clés VAPID présentes).'
      : 'Notifications système inactives : VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY non renseignées.',
  );
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function subscribePush(
  projectId: string,
  userId: string,
  sub: PushSubscriptionInput,
  agent: string,
) {
  await pool.query(
    `INSERT INTO push_subscriptions (project_id, user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (endpoint) DO UPDATE SET project_id = $1, user_id = $2, p256dh = $4, auth = $5, user_agent = $6`,
    [projectId, userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, agent.slice(0, 300)],
  );
}

export const unsubscribePush = (userId: string, endpoint: string) =>
  pool.query('DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [userId, endpoint]);

export interface PushPayload {
  title: string;
  body: string;
  path: string;
  /** Sujet : une notification du même sujet remplace la précédente sur l'appareil. */
  tag: string;
}

/** Envoie à tous les appareils de la personne ; un abonnement expiré est retiré. */
export async function pushToUser(projectId: string, userId: string, payload: PushPayload) {
  if (!pushEnabled) return;
  const { rows } = await pool.query<{ id: string; endpoint: string; p256dh: string; auth: string }>(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE project_id = $1 AND user_id = $2',
    [projectId, userId],
  );
  for (const s of rows) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 60 * 60 * 12, urgency: 'normal' },
      );
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410)
        await pool.query('DELETE FROM push_subscriptions WHERE id = $1', [s.id]);
      else fail('push', `Notification système non remise (code ${status ?? 'inconnu'})`, e);
    }
  }
}
