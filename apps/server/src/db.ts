import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { env } from './env';

export const pool = new pg.Pool({ connectionString: env.databaseUrl, max: 10 });

export type Tx = pg.PoolClient;

/** Exécute fn dans une transaction ; annule en cas d'erreur. */
export async function tx<T>(fn: (client: Tx) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

const here = dirname(fileURLToPath(import.meta.url));
/** Dossier des migrations : à côté des sources en dev, copié à côté du bundle en production. */
const migrationsDir = () =>
  [resolve(here, '../migrations'), resolve(here, 'migrations')].find(d => {
    try {
      readdirSync(d);
      return true;
    } catch {
      return false;
    }
  }) ?? resolve(here, '../migrations');

/** Applique les migrations SQL manquantes, dans l'ordre, sous verrou (plusieurs instances possibles). */
export async function migrate(
  log = (m: string) => console.log(`${new Date().toISOString()} [migration] ${m}`),
) {
  const dir = migrationsDir();
  const files = readdirSync(dir)
    .filter(f => f.endsWith('.sql'))
    .sort();
  await tx(async c => {
    await c.query('SELECT pg_advisory_xact_lock(727274)');
    await c.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const done = new Set(
      (await c.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map(r => r.name),
    );
    for (const f of files) {
      if (done.has(f)) continue;
      await c.query(readFileSync(join(dir, f), 'utf8'));
      await c.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
      log(`Migration appliquée : ${f}`);
    }
  });
}
