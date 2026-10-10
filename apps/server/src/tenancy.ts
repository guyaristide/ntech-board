import { env } from './env';
import { hostPatterns, slugFromHost } from './hosts';
import { pool } from './db';

export interface Project {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  planning: string | null;
}

const patterns = hostPatterns(env.projectHosts);
export const projectSlug = (host: string | undefined) => slugFromHost(host, patterns, env.defaultProject);

const cache = new Map<string, { project: Project | null; at: number }>();

export async function findProject(slug: string): Promise<Project | null> {
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < 10_000) return hit.project;
  const { rows } = await pool.query<Project>(
    'SELECT id, slug, title, subtitle, planning FROM projects WHERE slug = $1',
    [slug],
  );
  const project = rows[0] ?? null;
  cache.set(slug, { project, at: Date.now() });
  return project;
}

export const forgetProject = (slug: string) => cache.delete(slug);
