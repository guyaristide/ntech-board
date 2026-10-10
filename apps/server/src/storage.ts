import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { env } from './env';

/**
 * Stockage de fichiers (volume persistant monté sur STORAGE_DIR) :
 *   imports/<projet>/   fichiers importés, horodatés (planning .xlsx, backlog .json)
 *   backups/            sauvegardes de la base (scripts de deploy/)
 */
export const storageRoot = () => resolve(env.storageDir);

export function ensureStorage() {
  for (const dir of ['imports', 'backups']) mkdirSync(join(storageRoot(), dir), { recursive: true });
}

export async function saveUpload(project: string, name: string, content: Buffer) {
  const dir = join(storageRoot(), 'imports', project);
  mkdirSync(dir, { recursive: true });
  const safe = name.replace(/[^\w.\- ]+/g, '_').slice(-120);
  writeFileSync(join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}_${safe}`), content);
}
