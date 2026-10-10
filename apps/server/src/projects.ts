import type { Member, Role } from '@board/shared';
import { pool, tx } from './db';
import { forgetProject } from './tenancy';

export async function createProject(slug: string, title: string, subtitle = '') {
  const { rows } = await pool.query<{ id: string }>(
    'INSERT INTO projects (slug, title, subtitle) VALUES ($1, $2, $3) RETURNING id',
    [slug, title, subtitle],
  );
  forgetProject(slug);
  return rows[0].id;
}

export async function updateProject(id: string, slug: string, patch: { title?: string; subtitle?: string }) {
  await pool.query(
    'UPDATE projects SET title = COALESCE($2, title), subtitle = COALESCE($3, subtitle) WHERE id = $1',
    [id, patch.title ?? null, patch.subtitle ?? null],
  );
  forgetProject(slug);
}

export async function listProjects() {
  const { rows } = await pool.query<{
    slug: string;
    title: string;
    members: number;
    stories: number;
    created_at: Date;
  }>(
    `SELECT p.slug, p.title, p.created_at,
            (SELECT count(*)::int FROM memberships m WHERE m.project_id = p.id) AS members,
            (SELECT count(*)::int FROM entities e WHERE e.project_id = p.id AND e.kind = 'story') AS stories
       FROM projects p ORDER BY p.created_at`,
  );
  return rows;
}

export async function projectIdOf(slug: string) {
  const { rows } = await pool.query<{ id: string }>('SELECT id FROM projects WHERE slug = $1', [slug]);
  if (!rows[0]) throw new Error(`Projet inconnu : ${slug}`);
  return rows[0].id;
}

/** Crée l'utilisateur s'il n'existe pas (e-mail insensible à la casse) et renvoie son id. */
export async function ensureUser(email: string, name = '') {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, name) VALUES ($1, $2)
     ON CONFLICT ((lower(email))) DO UPDATE SET name = CASE WHEN users.name = '' THEN EXCLUDED.name ELSE users.name END
     RETURNING id`,
    [email.trim().toLowerCase(), name.trim()],
  );
  return rows[0].id;
}

export async function addMember(
  projectId: string,
  email: string,
  role: Role,
  name = '',
  invitedBy: string | null = null,
) {
  return tx(async c => {
    const userId = await ensureUser(email, name);
    await c.query(
      `INSERT INTO memberships (project_id, user_id, role, invited_by) VALUES ($1, $2, $3, $4)
       ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [projectId, userId, role, invitedBy],
    );
    return userId;
  });
}

export async function listMembers(projectId: string): Promise<Member[]> {
  const { rows } = await pool.query<Member>(
    `SELECT u.id AS "userId", u.email, u.name, m.role, m.invited_at AS "invitedAt", u.last_login_at AS "lastLoginAt"
       FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.project_id = $1 ORDER BY m.role, u.email`,
    [projectId],
  );
  return rows;
}

export async function setRole(projectId: string, userId: string, role: Role) {
  await pool.query('UPDATE memberships SET role = $3 WHERE project_id = $1 AND user_id = $2', [
    projectId,
    userId,
    role,
  ]);
}

export async function removeMember(projectId: string, userId: string) {
  await tx(async c => {
    await c.query('DELETE FROM memberships WHERE project_id = $1 AND user_id = $2', [projectId, userId]);
    await c.query('DELETE FROM sessions WHERE project_id = $1 AND user_id = $2', [projectId, userId]);
  });
}

/** Nombre d'administrateurs restants : on n'enlève pas le dernier. */
export async function adminCount(projectId: string) {
  const { rows } = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM memberships WHERE project_id = $1 AND role = 'admin'`,
    [projectId],
  );
  return rows[0].n;
}
