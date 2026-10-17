import pg from 'pg';
import { isDeliveryKind, type EntityKind, type PresenceEntry, type Role, type ServerEvent } from '@board/shared';
import { seesDelivery } from './access';
import { env } from './env';
import { getEntity } from './repo';

/**
 * Temps réel : chaque écriture émet NOTIFY board_events (dans la transaction, donc après validation).
 * Chaque instance du serveur écoute ce canal et relaie l'entité à jour aux navigateurs du projet
 * par Server-Sent Events. La présence (qui consulte quelle page) est tenue en mémoire de l'instance.
 */
export const CHANNEL = 'board_events';

interface Client {
  /** Identifiant de la connexion SSE (unique). */
  id: string;
  /** Identifiant de l'onglet, partagé avec la présence. */
  key: string;
  projectId: string;
  user: { id: string; name: string; email: string };
  role: Role;
  send: (event: ServerEvent) => void;
}

const clients = new Map<string, Client>();
const presence = new Map<string, PresenceEntry & { projectId: string; at: number }>();

export function subscribe(client: Client) {
  clients.set(client.id, client);
  // Le nouvel onglet reçoit tout de suite qui est déjà là.
  client.send({ type: 'presence', users: presenceOf(client.projectId) });
  return () => {
    if (!clients.delete(client.id)) return;
    // Délai de grâce : un onglet qui se reconnecte (rechargement, coupure réseau) garde sa présence.
    setTimeout(() => {
      const stillOpen = [...clients.values()].some(c => c.key === client.key);
      if (!stillOpen && presence.delete(client.key)) broadcastPresence(client.projectId);
    }, 5000).unref();
  };
}

function broadcast(projectId: string, event: ServerEvent) {
  for (const c of clients.values()) if (c.projectId === projectId) c.send(event);
}

function presenceOf(projectId: string): PresenceEntry[] {
  const byUser = new Map<string, PresenceEntry>();
  for (const p of presence.values()) {
    if (p.projectId !== projectId) continue;
    byUser.set(`${p.userId}:${p.path}`, { userId: p.userId, name: p.name, email: p.email, path: p.path });
  }
  return [...byUser.values()];
}

const broadcastPresence = (projectId: string) =>
  broadcast(projectId, { type: 'presence', users: presenceOf(projectId) });

export function setPresence(key: string, projectId: string, user: Client['user'], path: string) {
  presence.set(key, { projectId, userId: user.id, name: user.name, email: user.email, path, at: Date.now() });
  broadcastPresence(projectId);
}

// Les onglets fermés sans déconnexion propre disparaissent après une minute.
setInterval(() => {
  const stale = [...presence.entries()].filter(([, p]) => Date.now() - p.at > 60_000);
  stale.forEach(([k]) => presence.delete(k));
  new Set(stale.map(([, p]) => p.projectId)).forEach(broadcastPresence);
}, 20_000).unref();

export interface Notification {
  projectId: string;
  kind: EntityKind | 'reload';
  id: string;
  by: string | null;
}

/** Écoute le canal PostgreSQL ; se reconnecte en cas de coupure. */
export async function listen(
  log = (m: string) => console.log(`${new Date().toISOString()} [temps-réel] ${m}`),
) {
  const client = new pg.Client({ connectionString: env.databaseUrl });
  client.on('error', err => {
    log(`Écoute temps réel interrompue (${err.message}), reconnexion…`);
    setTimeout(() => void listen(log), 2000);
  });
  client.on('notification', async msg => {
    if (!msg.payload) return;
    const n = JSON.parse(msg.payload) as Notification;
    if (n.kind === 'reload') {
      broadcast(n.projectId, { type: 'reload', reason: n.id });
      return;
    }
    const data = await getEntity(n.projectId, n.kind, n.id);
    const event: ServerEvent = { type: 'entity', kind: n.kind, id: n.id, data, by: n.by };
    if (!isDeliveryKind(n.kind)) return broadcast(n.projectId, event);
    // Partie Réalisation : seulement aux membres qui la voient (évalué une fois par membre).
    const allowed = new Map<string, boolean>();
    for (const c of clients.values()) {
      if (c.projectId !== n.projectId) continue;
      if (!allowed.has(c.user.id)) allowed.set(c.user.id, await seesDelivery(c.projectId, c.role, c.user.id));
      if (allowed.get(c.user.id)) c.send(event);
    }
  });
  await client.connect();
  await client.query(`LISTEN ${CHANNEL}`);
  log(`écoute du canal ${CHANNEL} active`);
}
