import type { Context, Hono } from 'hono';
import { z } from 'zod';
import {
  SLUG_PATTERN,
  type PlatformAudit,
  type PlatformEvent,
  type PlatformProjectDetail,
  type PlatformSession,
  type PlatformStatus,
  type PlatformToken,
  type WorkspaceData,
} from '@board/shared';
import { aiKeyStatus } from '../ai/keys';
import { originOf, type AppEnv } from '../auth';
import { pool } from '../db';
import { env } from '../env';
import { canEncrypt } from '../files/crypto';
import { importSnapshot } from '../imports';
import { sendTestMail, verifyMail } from '../mail';
import { originFor } from '../notificationMail';
import { addMember, createProject } from '../projects';
import { pushEnabled } from '../push';
import { onlineNow } from '../realtime';
import { getSettings, getWorkspace, saveSettings } from '../repo';
import { storageRoot } from '../storage';
import { findProject, forgetProject, type Project } from '../tenancy';

/**
 * Console de la plateforme, vues détaillées : fiche complète d'un projet (contenu, activité, accès,
 * réglages), journal, duplication, et état technique de la plateforme (services, base, files).
 */

const startedAt = new Date().toISOString();
const RESERVED = new Set(['boards', 'www', 'api', 'admin', 'app', 'mail']);

/** Trace une action de la console : qui, quoi, sur quoi. */
export async function audit(c: Context<AppEnv>, action: string, target = '', detail = '') {
  await pool
    .query('INSERT INTO platform_audit (actor, action, target, detail) VALUES ($1, $2, $3, $4)', [
      c.get('user')?.email ?? '',
      action,
      target,
      detail.slice(0, 500),
    ])
    .catch(() => undefined);
}

const n = async (sql: string, params: unknown[] = []) =>
  Number((await pool.query<{ n: string }>(sql, params)).rows[0]?.n ?? 0);

async function load(slug: string): Promise<Project | null> {
  forgetProject(slug);
  return findProject(slug);
}

export function registerPlatformDetail(app: Hono<AppEnv>) {
  app.get('/platform/projects/:slug', async c => {
    const p = await load(c.req.param('slug'));
    if (!p) return c.json({ error: 'not_found' }, 404);
    const id = p.id;
    const counts = await pool.query<{ kind: string; n: number }>(
      'SELECT kind, count(*)::int AS n FROM entities WHERE project_id = $1 GROUP BY kind',
      [id],
    );
    const activity = await pool.query<{ day: string; n: number }>(
      `SELECT to_char(at::date, 'YYYY-MM-DD') AS day, count(*)::int AS n FROM events
        WHERE project_id = $1 AND at > now() - interval '30 days' GROUP BY 1 ORDER BY 1`,
      [id],
    );
    const contributors = await pool.query<{ name: string; email: string; n: number }>(
      `SELECT coalesce(u.name, '') AS name, coalesce(u.email, 'Import ou système') AS email, count(*)::int AS n
         FROM events e LEFT JOIN users u ON u.id = e.user_id
        WHERE e.project_id = $1 AND e.at > now() - interval '30 days'
        GROUP BY 1, 2 ORDER BY n DESC LIMIT 8`,
      [id],
    );
    const sessions = await pool.query<{
      id: string;
      email: string;
      name: string;
      created_at: Date;
      last_seen_at: Date;
      expires_at: Date;
    }>(
      `SELECT left(s.id_hash, 16) AS id, u.email, u.name, s.created_at, s.last_seen_at, s.expires_at
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.project_id = $1 AND s.expires_at > now() ORDER BY s.last_seen_at DESC`,
      [id],
    );
    const tokens = await pool.query<{
      id: string;
      name: string;
      prefix: string;
      email: string;
      created_at: Date;
      last_used_at: Date | null;
      expires_at: Date | null;
    }>(
      `SELECT t.id, t.name, t.prefix, u.email, t.created_at, t.last_used_at, t.expires_at
         FROM api_tokens t JOIN users u ON u.id = t.user_id WHERE t.project_id = $1 ORDER BY t.created_at DESC`,
      [id],
    );
    const storage = await pool.query<{ store: string; files: number; bytes: string }>(
      `SELECT data->>'store' AS store, count(*)::int AS files, coalesce(sum((data->>'size')::bigint), 0) AS bytes
         FROM entities WHERE project_id = $1 AND kind = 'attachment' GROUP BY 1`,
      [id],
    );
    const backends = await pool.query<{ id: string; name: string; provider: string }>(
      'SELECT id, name, provider FROM storage_backends WHERE project_id = $1 ORDER BY name',
      [id],
    );
    const s = await getSettings(id);
    const ai = await aiKeyStatus(id);
    const count = (kind: string) => counts.rows.find(r => r.kind === kind)?.n ?? 0;
    const bytes = storage.rows.reduce((sum, r) => sum + Number(r.bytes), 0);
    const admins = await pool.query<{ email: string }>(
      `SELECT u.email FROM memberships m JOIN users u ON u.id = m.user_id
        WHERE m.project_id = $1 AND m.role = 'admin' ORDER BY u.email`,
      [id],
    );
    const meta = await pool.query<{ created_at: Date; last: Date | null }>(
      'SELECT created_at, (SELECT max(at) FROM events WHERE project_id = $1) AS last FROM projects WHERE id = $1',
      [id],
    );
    const backendName = (store: string) =>
      store === 'local'
        ? 'Serveur de l’application'
        : (backends.rows.find(b => b.id === store)?.name ?? store);
    const detail: PlatformProjectDetail = {
      project: {
        slug: p.slug,
        title: p.title,
        subtitle: p.subtitle,
        url: originFor(p.slug),
        createdAt: meta.rows[0].created_at.toISOString(),
        members: await n('SELECT count(*) AS n FROM memberships WHERE project_id = $1', [id]),
        admins: admins.rows.map(r => r.email),
        stories: count('story'),
        tickets: count('ticket'),
        files: count('attachment'),
        bytes,
        lastActivity: meta.rows[0].last?.toISOString() ?? null,
        delivery: s.delivery.enabled,
        aiKey: ai.configured,
      },
      counts: Object.fromEntries(counts.rows.map(r => [r.kind, r.n])),
      activity: activity.rows,
      contributors: contributors.rows,
      online: onlineNow(id),
      sessions: sessions.rows.map((r): PlatformSession => ({
        id: r.id,
        email: r.email,
        name: r.name,
        createdAt: r.created_at.toISOString(),
        lastSeenAt: r.last_seen_at.toISOString(),
        expiresAt: r.expires_at.toISOString(),
      })),
      tokens: tokens.rows.map((r): PlatformToken => ({
        id: r.id,
        name: r.name,
        prefix: r.prefix,
        email: r.email,
        createdAt: r.created_at.toISOString(),
        lastUsedAt: r.last_used_at?.toISOString() ?? null,
        expiresAt: r.expires_at?.toISOString() ?? null,
      })),
      settings: {
        delivery: s.delivery.enabled,
        ticketKey: s.delivery.key,
        estimation: s.delivery.estimation,
        sprintWeeks: s.delivery.sprintWeeks,
        workflow: s.delivery.workflow.map(x => x.name),
        ticketTypes: s.delivery.ticketTypes.map(x => x.name),
        versions: s.versions,
        actors: s.actors,
        referenceDocument: s.referenceDocument,
        riskScopes: s.riskScopes.map(x => `${x.name} (${x.prefix})`),
        mcpRoles: s.mcp.roles,
        mcpDeletions: s.mcp.deletions,
        fileStore: backendName(s.files.store),
        fileMaxMb: s.files.maxMb,
        fileCategories: s.files.categories,
      },
      storage: storage.rows.map(r => ({
        store: backendName(r.store),
        files: r.files,
        bytes: Number(r.bytes),
      })),
      backends: backends.rows.map(b => ({ name: b.name, provider: b.provider })),
      aiKey: {
        configured: ai.configured,
        hint: ai.hint ?? '',
        updatedBy: ai.updatedBy ?? '',
        updatedAt: ai.updatedAt ? new Date(ai.updatedAt).toISOString() : null,
      },
      notifications: {
        total: await n('SELECT count(*) AS n FROM notifications WHERE project_id = $1', [id]),
        unread: await n('SELECT count(*) AS n FROM notifications WHERE project_id = $1 AND read_at IS NULL', [
          id,
        ]),
        unsent: await n(
          'SELECT count(*) AS n FROM notifications WHERE project_id = $1 AND read_at IS NULL AND emailed_at IS NULL',
          [id],
        ),
        devices: await n('SELECT count(*) AS n FROM push_subscriptions WHERE project_id = $1', [id]),
        followers: await n(
          `SELECT count(*) AS n FROM subscriptions WHERE project_id = $1 AND state = 'following'`,
          [id],
        ),
      },
    };
    return c.json(detail);
  });

  /** Journal des modifications du projet, du plus récent au plus ancien. */
  app.get('/platform/projects/:slug/events', async c => {
    const p = await load(c.req.param('slug'));
    if (!p) return c.json({ error: 'not_found' }, 404);
    const { rows } = await pool.query<{
      at: Date;
      kind: string;
      entity_id: string;
      action: string;
      by: string;
    }>(
      `SELECT e.at, e.kind, e.entity_id, e.action, coalesce(nullif(u.name, ''), u.email, 'Import ou système') AS by
         FROM events e LEFT JOIN users u ON u.id = e.user_id
        WHERE e.project_id = $1 ORDER BY e.at DESC LIMIT 200`,
      [p.id],
    );
    const events: PlatformEvent[] = rows.map(r => ({
      at: r.at.toISOString(),
      kind: r.kind,
      entityId: r.entity_id,
      action: r.action,
      by: r.by,
    }));
    return c.json(events);
  });

  /** Ferme une session du projet (la personne devra se reconnecter). */
  app.delete('/platform/projects/:slug/sessions/:id', async c => {
    const p = await load(c.req.param('slug'));
    if (!p) return c.json({ error: 'not_found' }, 404);
    const { rowCount } = await pool.query(
      'DELETE FROM sessions WHERE project_id = $1 AND left(id_hash, 16) = $2',
      [p.id, c.req.param('id')],
    );
    await audit(c, 'Session fermée', p.slug);
    return c.json({ closed: rowCount ?? 0 });
  });

  /** Révoque un jeton MCP du projet. */
  app.delete('/platform/projects/:slug/tokens/:id', async c => {
    const p = await load(c.req.param('slug'));
    if (!p) return c.json({ error: 'not_found' }, 404);
    const parsed = z.uuid().safeParse(c.req.param('id'));
    if (!parsed.success) return c.json({ error: 'invalid' }, 400);
    const { rows } = await pool.query<{ name: string }>(
      'DELETE FROM api_tokens WHERE project_id = $1 AND id = $2 RETURNING name',
      [p.id, parsed.data],
    );
    if (rows[0]) await audit(c, 'Jeton MCP révoqué', p.slug, rows[0].name);
    return c.json({ revoked: rows.length });
  });

  /** Active ou désactive la partie Réalisation du projet. */
  app.patch('/platform/projects/:slug/settings', async c => {
    const p = await load(c.req.param('slug'));
    if (!p) return c.json({ error: 'not_found' }, 404);
    const input = z.object({ delivery: z.boolean() }).safeParse(await c.req.json().catch(() => null));
    if (!input.success) return c.json({ error: 'invalid' }, 400);
    const s = await getSettings(p.id);
    await saveSettings(
      p.id,
      c.get('user')!.id,
      { ...s, delivery: { ...s.delivery, enabled: input.data.delivery } },
      { delivery: { enabled: input.data.delivery } },
    );
    await audit(c, input.data.delivery ? 'Réalisation activée' : 'Réalisation désactivée', p.slug);
    return c.json({ ok: true });
  });

  /**
   * Duplique un projet : nouveau projet avec les mêmes réglages et, si demandé, tout le contenu
   * (US, ateliers, risques, tickets…). Les membres, les fichiers joints, les discussions et
   * l'historique ne sont pas copiés.
   */
  app.post('/platform/projects/:slug/duplicate', async c => {
    const p = await load(c.req.param('slug'));
    if (!p) return c.json({ error: 'not_found' }, 404);
    const input = z
      .object({
        slug: z.string().trim().toLowerCase().regex(SLUG_PATTERN),
        title: z.string().trim().min(1).max(120),
        admin: z.email().max(200),
        content: z.boolean().default(true),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!input.success) return c.json({ error: 'invalid', message: 'Nom, adresse ou e-mail invalide.' }, 400);
    const { slug, title, admin, content } = input.data;
    if (RESERVED.has(slug) || (await findProject(slug)))
      return c.json(
        { error: 'slug_taken', message: `L’adresse « ${slug} » est déjà prise ou réservée.` },
        409,
      );
    const id = await createProject(slug, title, p.subtitle);
    const source = await pool.query<{ settings: unknown }>('SELECT settings FROM projects WHERE id = $1', [
      p.id,
    ]);
    await pool.query('UPDATE projects SET settings = $2, planning = $3 WHERE id = $1', [
      id,
      source.rows[0].settings,
      content ? p.planning : null,
    ]);
    await addMember(id, admin, 'admin', '', c.get('user')!.id);
    let copied = 'réglages seulement';
    if (content) {
      const data: Partial<WorkspaceData> = await getWorkspace(p.id, p.planning);
      const report = await importSnapshot(id, data, c.get('user')!.id);
      copied = report.details.join(' ');
    }
    await audit(c, 'Projet dupliqué', p.slug, `vers ${slug} · ${copied}`);
    return c.json({ slug, url: originFor(slug), copied }, 201);
  });

  app.get('/platform/audit', async c => {
    const { rows } = await pool.query<{
      at: Date;
      actor: string;
      action: string;
      target: string;
      detail: string;
    }>('SELECT at, actor, action, target, detail FROM platform_audit ORDER BY at DESC LIMIT 300');
    const list: PlatformAudit[] = rows.map(r => ({ ...r, at: r.at.toISOString() }));
    return c.json(list);
  });

  /** Teste la connexion au relais SMTP, sans rien envoyer. */
  app.post('/platform/status/mail/verify', async c => c.json(await verifyMail()));

  /** Envoie un e-mail d'essai à l'adresse indiquée (par défaut : la sienne). */
  app.post('/platform/status/mail/test', async c => {
    const input = z
      .object({ to: z.email().max(200).optional() })
      .safeParse(await c.req.json().catch(() => ({})));
    const to = (input.success && input.data.to) || c.get('user')!.email;
    try {
      await sendTestMail(to, originOf(c));
      await audit(c, 'E-mail d’essai envoyé', to);
      return c.json({
        ok: true,
        message: env.mail.host
          ? `E-mail d’essai envoyé à ${to}.`
          : 'SMTP_HOST est vide : le message est écrit dans les logs.',
      });
    } catch (e) {
      return c.json({ ok: false, message: (e as Error).message });
    }
  });

  app.get('/platform/status', async c => {
    const tables = await pool.query<{ name: string; rows: string; bytes: string }>(
      `SELECT relname AS name, n_live_tup AS rows, pg_total_relation_size(relid) AS bytes
         FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC`,
    );
    const migrations = await pool.query<{ name: string; applied_at: Date }>(
      'SELECT name, applied_at FROM schema_migrations ORDER BY name DESC',
    );
    const entities = await pool.query<{ kind: string; n: number }>(
      'SELECT kind, count(*)::int AS n FROM entities GROUP BY kind ORDER BY n DESC',
    );
    const stores = await pool.query<{ store: string; files: number; bytes: string }>(
      `SELECT CASE WHEN data->>'store' = 'local' THEN 'Serveur de l’application' ELSE 'Stockage externe' END AS store,
              count(*)::int AS files, coalesce(sum((data->>'size')::bigint), 0) AS bytes
         FROM entities WHERE kind = 'attachment' GROUP BY 1`,
    );
    const jobs = await pool.query<{ name: string; ran_on: Date }>(
      'SELECT name, ran_on FROM job_runs ORDER BY name',
    );
    const version = await pool.query<{ v: string }>(`SELECT current_setting('server_version') AS v`);
    const memory = process.memoryUsage();
    const live = onlineNow();
    const status: PlatformStatus = {
      services: {
        mail: {
          configured: !!env.mail.host,
          host: env.mail.host,
          port: env.mail.port,
          secure: env.mail.secure,
          user: env.mail.user,
          from: env.mail.from,
        },
        push: {
          enabled: pushEnabled,
          publicKey: env.push.publicKey ? `${env.push.publicKey.slice(0, 12)}…` : '',
          subject: env.push.subject,
          devices: await n('SELECT count(*) AS n FROM push_subscriptions'),
        },
        secrets: canEncrypt(),
        ai: {
          model: env.ai.model,
          effort: env.ai.effort,
          projectsWithKey: await n('SELECT count(*) AS n FROM ai_keys'),
        },
        storage: {
          root: storageRoot(),
          stores: stores.rows.map(r => ({ store: r.store, files: r.files, bytes: Number(r.bytes) })),
          backends: await n('SELECT count(*) AS n FROM storage_backends'),
        },
      },
      runtime: {
        version: (process.env.SOURCE_COMMIT ?? '').slice(0, 12),
        node: process.version,
        platform: `${process.platform} ${process.arch}`,
        pid: process.pid,
        startedAt,
        uptimeSeconds: Math.round(process.uptime()),
        memoryRss: memory.rss,
        memoryHeap: memory.heapUsed,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        now: new Date().toISOString(),
      },
      config: [
        { key: 'PROJECT_HOSTS', value: env.projectHosts.join(', ') },
        { key: 'PLATFORM_HOST', value: env.platformHosts.join(', ') },
        { key: 'PUBLIC_ORIGIN', value: env.notify.origin || '(déduit de PROJECT_HOSTS, en https)' },
        { key: 'DEFAULT_PROJECT', value: env.defaultProject || '(aucun)' },
        { key: 'SUPERADMIN_EMAILS', value: `${env.superadmins.length} adresse(s)` },
        { key: 'SESSION_DAYS', value: String(env.sessionDays) },
        { key: 'LOGIN_TOKEN_MINUTES', value: String(env.loginTokenMinutes) },
        { key: 'COOKIE_SECURE', value: env.cookieSecure },
        { key: 'NOTIFY_QUIET_MINUTES', value: String(env.notify.quietMinutes) },
        { key: 'NOTIFY_DIGEST_HOUR', value: `${env.notify.digestHour} h (heure du serveur)` },
        { key: 'AI_MODEL / AI_EFFORT', value: `${env.ai.model} / ${env.ai.effort}` },
      ],
      database: {
        version: version.rows[0].v,
        bytes: await n('SELECT pg_database_size(current_database()) AS n'),
        pool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount },
        tables: tables.rows.map(r => ({ name: r.name, rows: Number(r.rows), bytes: Number(r.bytes) })),
        migrations: migrations.rows.map(r => ({ name: r.name, appliedAt: r.applied_at.toISOString() })),
        entities: entities.rows,
      },
      activity: {
        events24h: await n(`SELECT count(*) AS n FROM events WHERE at > now() - interval '24 hours'`),
        events7d: await n(`SELECT count(*) AS n FROM events WHERE at > now() - interval '7 days'`),
        activeUsers7d: await n(
          `SELECT count(DISTINCT user_id) AS n FROM events WHERE at > now() - interval '7 days' AND user_id IS NOT NULL`,
        ),
        logins7d: await n(`SELECT count(*) AS n FROM users WHERE last_login_at > now() - interval '7 days'`),
        sessionsProjects: await n(
          'SELECT count(*) AS n FROM sessions WHERE project_id IS NOT NULL AND expires_at > now()',
        ),
        sessionsConsole: await n(
          'SELECT count(*) AS n FROM sessions WHERE project_id IS NULL AND expires_at > now()',
        ),
        onlineTabs: live.tabs,
        onlineUsers: live.users.length,
      },
      queues: {
        mailPending: await n(
          'SELECT count(*) AS n FROM notifications WHERE emailed_at IS NULL AND read_at IS NULL',
        ),
        notificationsUnread: await n('SELECT count(*) AS n FROM notifications WHERE read_at IS NULL'),
        loginLinksValid: await n(
          'SELECT count(*) AS n FROM login_tokens WHERE used_at IS NULL AND expires_at > now()',
        ),
        jobs: jobs.rows.map(r => ({ name: r.name, ranOn: r.ran_on.toISOString().slice(0, 10) })),
      },
    };
    return c.json(status);
  });
}
