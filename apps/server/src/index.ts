import { serve } from '@hono/node-server';
import { createApp } from './app';
import { migrate, pool } from './db';
import { env } from './env';
import { checkMail } from './mail';
import { listen } from './realtime';
import { ensureStorage } from './storage';

await migrate();
ensureStorage();
void checkMail();
await listen();

const server = serve({ fetch: createApp().fetch, port: env.port }, info =>
  console.log(`NTECH Board à l'écoute sur le port ${info.port} (hôtes : ${env.projectHosts.join(', ')})`),
);

// Arrêt propre (redéploiement Coolify) : on ferme les connexions avant de quitter.
const stop = () => {
  server.close();
  void pool.end().finally(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
