import type { Epic, ImportReport, Story, Workshop } from '@board/shared';
import { pool, tx } from './db';
import type { RawPlanning } from './importers/planning';
import { mergePlanning, storyFromRaw, type RawStories } from './merge';
import { notify } from './repo';
import { forgetProject } from './tenancy';

/**
 * Import du backlog (format seeds/<projet>/stories.json) :
 * - US et épiques nouvelles : ajoutées ;
 * - US jamais modifiées dans l'outil (révision 0) : remplacées par la version du fichier ;
 * - US modifiées : conservées telles quelles. Les notes d'épique sont toujours gardées.
 */
export async function importStories(
  projectId: string,
  raw: RawStories,
  userId: string | null,
): Promise<ImportReport> {
  if (!Array.isArray(raw.epics) || !Array.isArray(raw.stories))
    throw new Error('Format attendu : { epics: [], stories: [] }');
  const at = new Date().toISOString();
  const report: ImportReport = { added: 0, updated: 0, kept: 0, removed: 0, details: [] };
  await tx(async c => {
    const existing = new Map(
      (
        await c.query<{ kind: string; id: string; revision: number; data: Epic | Story }>(
          `SELECT kind, id, revision, data FROM entities WHERE project_id = $1 AND kind IN ('epic', 'story') FOR UPDATE`,
          [projectId],
        )
      ).rows.map(r => [`${r.kind}:${r.id}`, r]),
    );
    for (const [i, e] of raw.epics.entries()) {
      const prev = existing.get(`epic:${e.id}`);
      const data: Epic = { ...e, body: (prev?.data as Epic | undefined)?.body ?? [] };
      await c.query(
        `INSERT INTO entities (project_id, kind, id, data, position) VALUES ($1, 'epic', $2, $3, $4)
         ON CONFLICT (project_id, kind, id) DO UPDATE SET data = EXCLUDED.data, position = EXCLUDED.position, updated_at = now()`,
        [projectId, e.id, data, i],
      );
    }
    for (const [i, s] of raw.stories.entries()) {
      const prev = existing.get(`story:${s.id}`);
      if (prev && prev.revision > 0) {
        report.kept++;
        continue;
      }
      await c.query(
        `INSERT INTO entities (project_id, kind, id, data, position) VALUES ($1, 'story', $2, $3, $4)
         ON CONFLICT (project_id, kind, id) DO UPDATE SET data = EXCLUDED.data, position = EXCLUDED.position, updated_at = now()`,
        [projectId, s.id, storyFromRaw(s, (prev?.data as Story | undefined)?.createdAt ?? at), i],
      );
      if (prev) report.updated++;
      else report.added++;
    }
    await c.query(
      `INSERT INTO events (project_id, kind, entity_id, action, patch, user_id) VALUES ($1, 'project', '-', 'import-stories', $2, $3)`,
      [projectId, JSON.stringify(report), userId],
    );
    await notify(c, projectId, 'reload', 'import-stories', userId);
  });
  report.details.push(
    `${raw.epics.length} épiques ; ${report.added} US ajoutées, ${report.updated} mises à jour, ${report.kept} conservées car modifiées dans l'outil.`,
  );
  return report;
}

/** Import du planning des ateliers : fiches du cahier des charges remplacées, programme fusionné (voir merge.ts). */
export async function importPlanning(
  projectId: string,
  planning: RawPlanning,
  userId: string | null,
): Promise<ImportReport> {
  if (!planning.workshops.length) throw new Error('Aucun atelier trouvé dans le planning.');
  const report: ImportReport = { added: 0, updated: 0, kept: 0, removed: 0, details: [] };
  await tx(async c => {
    const previous = (
      await c.query<{ data: Workshop }>(
        `SELECT data FROM entities WHERE project_id = $1 AND kind = 'workshop' ORDER BY position FOR UPDATE`,
        [projectId],
      )
    ).rows.map(r => r.data);
    const { workshops, orphaned } = mergePlanning(previous, planning);
    await c.query(`DELETE FROM entities WHERE project_id = $1 AND kind IN ('workshop', 'reference')`, [
      projectId,
    ]);
    for (const [i, w] of workshops.entries())
      await c.query(
        `INSERT INTO entities (project_id, kind, id, data, position, revision) VALUES ($1, 'workshop', $2, $3, $4, 0)`,
        [projectId, w.id, w, i],
      );
    for (const [i, r] of planning.references.entries())
      await c.query(
        `INSERT INTO entities (project_id, kind, id, data, position) VALUES ($1, 'reference', $2, $3, $4)`,
        [projectId, r.id, r, i],
      );
    await c.query('UPDATE projects SET planning = $2 WHERE id = $1', [projectId, planning.source]);
    report.added = workshops.length - orphaned;
    report.kept = orphaned;
    report.details.push(
      `${planning.workshops.length} ateliers, ${planning.workshops.reduce((n, w) => n + w.sessions.length, 0)} séquences, ${planning.references.length} fiches du cahier des charges.`,
      ...(orphaned
        ? [`${orphaned} atelier(s) enrichi(s) absent(s) du nouveau planning, conservé(s) sous « ancien-… ».`]
        : []),
    );
    await c.query(
      `INSERT INTO events (project_id, kind, entity_id, action, patch, user_id) VALUES ($1, 'project', '-', 'import-planning', $2, $3)`,
      [projectId, JSON.stringify({ source: planning.source, ...report }), userId],
    );
    await notify(c, projectId, 'reload', 'import-planning', userId);
  });
  const { rows } = await pool.query<{ slug: string }>('SELECT slug FROM projects WHERE id = $1', [projectId]);
  if (rows[0]) forgetProject(rows[0].slug);
  return report;
}
