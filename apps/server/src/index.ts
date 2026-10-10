import { serve } from '@hono/node-server';
import { createApp } from './app';
import { migrate, pool } from './db';
import { env } from './env';
import { log, warn } from './log';
import { checkMail } from './mail';
import { listProjects } from './projects';
import { storageRoot } from './storage';
import { listen } from './realtime';
import { ensureStorage } from './storage';

await migrate();
ensureStorage();
void checkMail();
await listen();

const server = serve({ fetch: createApp().fetch, port: env.port }, info =>
  log(
    'démarrage',
    `NTECH Board à l'écoute sur le port ${info.port} (hôtes : ${env.projectHosts.join(', ')})`,
  ),
);

// Résumé de configuration, utile pour diagnostiquer un déploiement.
const projects = await listProjects();
log(
  'démarrage',
  `${projects.length} projet(s) : ${projects.map(p => `${p.slug} (${p.members} membre(s), ${p.stories} US)`).join(' ; ') || 'aucun, créez-en un avec project:create'}`,
);
log('démarrage', `super-administrateurs : ${env.superadmins.join(', ') || 'aucun (SUPERADMIN_EMAILS vide)'}`);
if (env.defaultProject && !projects.some(p => p.slug === env.defaultProject))
  warn(
    'démarrage',
    `DEFAULT_PROJECT « ${env.defaultProject} » ne correspond à aucun projet : laissez-le vide, ou indiquez un slug (ex. etourisme).`,
  );
log(
  'démarrage',
  `projet par défaut : ${env.defaultProject || 'aucun'} · stockage : ${storageRoot()} · sessions : ${env.sessionDays} j`,
);

// Arrêt propre (redéploiement Coolify) : on ferme les connexions avant de quitter.
const stop = () => {
  server.close();
  void pool.end().finally(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
