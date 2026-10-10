import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseArgs } from 'node:util';
import { ROLES, type Role } from '@board/shared';
import { migrate, pool } from './db';
import { importPlanning, importStories } from './imports';
import { parsePlanning, type RawPlanning } from './importers/planning';
import type { RawStories } from './merge';
import { addMember, createProject, listMembers, listProjects, projectIdOf } from './projects';

/**
 * Administration en ligne de commande (en local : npm run cli -- <commande> ;
 * dans le conteneur : node apps/server/dist/cli.js <commande>). Voir docs/EXPLOITATION.md.
 */
const HELP = `Commandes :
  migrate                                          Applique les migrations
  project:create <slug> --title "…" [--subtitle "…"] [--admin email]
  project:list
  member:add <slug> <email> [--role admin|editor|viewer] [--name "…"]
  member:list <slug>
  import:stories <slug> <fichier.json>             Backlog { epics, stories }
  import:planning <slug> <fichier.xlsx|.json>      Planning des ateliers
`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    title: { type: 'string' },
    subtitle: { type: 'string' },
    admin: { type: 'string' },
    role: { type: 'string', default: 'editor' },
    name: { type: 'string', default: '' },
  },
});
const [command, ...args] = positionals;

async function run() {
  await migrate();
  switch (command) {
    case 'migrate':
      return;
    case 'project:create': {
      const [slug] = args;
      if (!slug || !values.title) throw new Error('Usage : project:create <slug> --title "…"');
      const id = await createProject(slug, values.title, values.subtitle ?? '');
      if (values.admin) await addMember(id, values.admin, 'admin');
      console.log(`Projet « ${slug} » créé${values.admin ? `, administrateur ${values.admin}` : ''}.`);
      return;
    }
    case 'project:list':
      console.table(await listProjects());
      return;
    case 'member:add': {
      const [slug, email] = args;
      const role = values.role as Role;
      if (!slug || !email || !ROLES.includes(role))
        throw new Error('Usage : member:add <slug> <email> [--role admin|editor|viewer]');
      await addMember(await projectIdOf(slug), email, role, values.name);
      console.log(`${email} ajouté à ${slug} (${role}).`);
      return;
    }
    case 'member:list':
      console.table(await listMembers(await projectIdOf(args[0])));
      return;
    case 'import:stories': {
      const [slug, file] = args;
      const report = await importStories(
        await projectIdOf(slug),
        JSON.parse(readFileSync(file, 'utf8')) as RawStories,
        null,
      );
      console.log(report.details.join('\n'));
      return;
    }
    case 'import:planning': {
      const [slug, file] = args;
      const planning: RawPlanning = file.endsWith('.json')
        ? (JSON.parse(readFileSync(file, 'utf8')) as RawPlanning)
        : await parsePlanning(readFileSync(file), basename(file));
      const report = await importPlanning(await projectIdOf(slug), planning, null);
      console.log(report.details.join('\n'));
      return;
    }
    default:
      console.log(HELP);
  }
}

run()
  .catch(e => {
    console.error(`Erreur : ${(e as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
