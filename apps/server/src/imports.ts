import {
  newParty,
  type Diligence,
  type Epic,
  type ImportReport,
  type Party,
  type Phase,
  type Story,
  type Workshop,
  type WorkspaceData,
} from '@board/shared';
import { pool, tx } from './db';
import type { RawRaci, RawRisks } from './importers/governance';
import type { RawPlanning } from './importers/planning';
import {
  enrichStory,
  mergePlanning,
  storyFromRaw,
  symmetricLinks,
  type RawStories,
  type StoryEnrichment,
} from './merge';
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

/**
 * Import de contenus identifiés (phases, risques) : nouveaux ajoutés, jamais modifiés dans
 * l'outil remplacés, modifiés conservés. Ceux qui ne figurent pas dans le fichier restent en place.
 */
async function importEntities<T extends { id: string }>(
  projectId: string,
  kind: 'phase' | 'risk' | 'diligence' | 'party',
  items: T[],
  userId: string | null,
  prepare: (item: T, current: Phase | null) => T = item => item,
): Promise<ImportReport> {
  const report: ImportReport = { added: 0, updated: 0, kept: 0, removed: 0, details: [] };
  await tx(async c => {
    const existing = new Map(
      (
        await c.query<{ id: string; revision: number }>(
          `SELECT id, revision FROM entities WHERE project_id = $1 AND kind = $2 FOR UPDATE`,
          [projectId, kind],
        )
      ).rows.map(r => [r.id, r]),
    );
    const current =
      (
        await c.query<{ data: Phase }>(
          `SELECT data FROM entities WHERE project_id = $1 AND kind = 'phase' AND data->>'status' = 'En cours'
            ORDER BY position LIMIT 1`,
          [projectId],
        )
      ).rows[0]?.data ?? null;
    for (const [i, item] of items.entries()) {
      const prev = existing.get(item.id);
      if (prev && prev.revision > 0) {
        report.kept++;
        continue;
      }
      await c.query(
        `INSERT INTO entities (project_id, kind, id, data, position) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (project_id, kind, id) DO UPDATE SET data = EXCLUDED.data, position = EXCLUDED.position, updated_at = now()`,
        [projectId, kind, item.id, prepare(item, current), i],
      );
      if (prev) report.updated++;
      else report.added++;
    }
    await c.query(
      `INSERT INTO events (project_id, kind, entity_id, action, patch, user_id) VALUES ($1, 'project', '-', $2, $3, $4)`,
      [projectId, `import-${kind}s`, JSON.stringify(report), userId],
    );
    await notify(c, projectId, 'reload', `import-${kind}s`, userId);
  });
  return report;
}

/** Import des phases et de leur matrice RACI. */
export async function importPhases(projectId: string, raw: RawRaci, userId: string | null) {
  if (!Array.isArray(raw.phases) || !raw.phases.length) throw new Error('Format attendu : { phases: [] }');
  const report = await importEntities(projectId, 'phase', raw.phases, userId);
  report.details.push(
    `${raw.phases.length} phases, ${raw.phases.reduce((n, p) => n + p.raci.length, 0)} lignes RACI : ${report.added} ajoutées, ${report.updated} mises à jour, ${report.kept} conservées car modifiées dans l'outil.`,
  );
  return report;
}

/** Import du registre des risques ; une revue sans phase est rattachée à la phase en cours. */
export async function importRisks(projectId: string, raw: RawRisks, userId: string | null) {
  if (!Array.isArray(raw.risks) || !raw.risks.length) throw new Error('Format attendu : { risks: [] }');
  const report = await importEntities(projectId, 'risk', raw.risks, userId, (r, current) => ({
    ...r,
    reviews: r.reviews.map(v => ({ ...v, phase: v.phase || current?.id || '' })),
  }));
  report.details.push(
    `${raw.risks.length} risques, ${raw.risks.reduce((n, r) => n + r.actions.length, 0)} actions : ${report.added} ajoutés, ${report.updated} mis à jour, ${report.kept} conservés car modifiés dans l'outil.`,
  );
  return report;
}

/** Fichier de cadrage : diligences issues des ateliers, compléments des US, parties prenantes. */
export interface RawCadrage {
  parties?: Party[];
  diligences?: Diligence[];
  stories?: StoryEnrichment[];
}

/**
 * Import d'un fichier de cadrage. Diligences : comme les risques (modifiées dans l'outil, conservées).
 * US : description et plateformes posées seulement si elles sont vides, liaisons ajoutées des deux
 * côtés ; rien de ce qui a été saisi n'est remplacé.
 */
export async function importCadrage(projectId: string, raw: RawCadrage, userId: string | null) {
  if (!Array.isArray(raw.diligences) && !Array.isArray(raw.stories) && !Array.isArray(raw.parties))
    throw new Error('Format attendu : { parties: [], diligences: [], stories: [] }');
  const details: string[] = [];
  const report: ImportReport = { added: 0, updated: 0, kept: 0, removed: 0, details };
  if (raw.parties?.length) {
    const r = await importEntities(projectId, 'party', raw.parties, userId, p => newParty(p.id, p.type, p));
    report.added += r.added;
    report.updated += r.updated;
    report.kept += r.kept;
    details.push(
      `${raw.parties.length} parties prenantes : ${r.added} ajoutées, ${r.updated} mises à jour, ${r.kept} conservées car modifiées dans l'outil.`,
    );
  }
  if (raw.diligences?.length) {
    const r = await importEntities(projectId, 'diligence', raw.diligences, userId);
    report.added += r.added;
    report.updated += r.updated;
    report.kept += r.kept;
    details.push(
      `${raw.diligences.length} diligences : ${r.added} ajoutées, ${r.updated} mises à jour, ${r.kept} conservées car modifiées dans l'outil.`,
    );
  }
  if (raw.stories?.length) {
    const links = symmetricLinks(raw.stories);
    const byId = new Map(raw.stories.map(e => [e.id, e]));
    for (const id of links.keys()) if (!byId.has(id)) byId.set(id, { id });
    let enriched = 0;
    const unknown: string[] = [];
    await tx(async c => {
      const { rows } = await c.query<{ id: string; data: Story }>(
        `SELECT id, data FROM entities WHERE project_id = $1 AND kind = 'story' FOR UPDATE`,
        [projectId],
      );
      const current = new Map(rows.map(r => [r.id, r.data]));
      for (const e of byId.values()) {
        const story = current.get(e.id);
        if (!story) {
          unknown.push(e.id);
          continue;
        }
        const next = enrichStory(story, { ...e, links: links.get(e.id) ?? [] });
        if (!next) continue;
        enriched++;
        // La révision augmente : un import de backlog ultérieur ne remplacera plus cette US.
        await c.query(
          `UPDATE entities SET data = $3, revision = revision + 1, updated_at = now(), updated_by = $4
            WHERE project_id = $1 AND kind = 'story' AND id = $2`,
          [projectId, e.id, next, userId],
        );
      }
      await c.query(
        `INSERT INTO events (project_id, kind, entity_id, action, patch, user_id) VALUES ($1, 'project', '-', 'import-cadrage', $2, $3)`,
        [projectId, JSON.stringify({ enriched, unknown }), userId],
      );
      await notify(c, projectId, 'reload', 'import-cadrage', userId);
    });
    details.push(
      `${enriched} US complétées (description, plateformes ou liaisons)${unknown.length ? ` ; inconnues, ignorées : ${unknown.join(', ')}` : ''}.`,
    );
  }
  return report;
}

/**
 * Restaure un export complet (Administration › Export) dans un projet vide : sert à reproduire
 * un tableau de production en local. Refusé si le projet contient déjà des US.
 */
export async function importSnapshot(projectId: string, raw: Partial<WorkspaceData>, userId: string | null) {
  const groups: [string, { id: string }[] | undefined][] = [
    ['reference', raw.references],
    ['epic', raw.epics],
    ['story', raw.stories],
    ['workshop', raw.workshops],
    ['phase', raw.phases],
    ['risk', raw.risks],
    ['diligence', raw.diligences],
    ['party', raw.parties],
    ['release', raw.releases],
    ['sprint', raw.sprints],
    ['ticket', raw.tickets],
  ];
  const report: ImportReport = { added: 0, updated: 0, kept: 0, removed: 0, details: [] };
  await tx(async c => {
    const { rows } = await c.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM entities WHERE project_id = $1 AND kind = 'story'`,
      [projectId],
    );
    if (rows[0].n) throw new Error('Le projet contient déjà des US : restauration refusée.');
    for (const [kind, items] of groups)
      for (const [i, item] of (items ?? []).entries()) {
        await c.query(
          `INSERT INTO entities (project_id, kind, id, data, position, revision) VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (project_id, kind, id) DO UPDATE SET data = EXCLUDED.data, position = EXCLUDED.position`,
          [projectId, kind, item.id, item, i, kind === 'reference' ? 0 : 1],
        );
        report.added++;
      }
    if (raw.planning)
      await c.query('UPDATE projects SET planning = $2 WHERE id = $1', [projectId, raw.planning]);
    await c.query(
      `INSERT INTO events (project_id, kind, entity_id, action, patch, user_id) VALUES ($1, 'project', '-', 'import-snapshot', $2, $3)`,
      [projectId, JSON.stringify({ added: report.added }), userId],
    );
    await notify(c, projectId, 'reload', 'import-snapshot', userId);
  });
  report.details.push(`${report.added} contenus restaurés.`);
  return report;
}
