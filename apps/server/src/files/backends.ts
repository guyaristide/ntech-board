import { S3_FLAVORS, type S3Flavor, type StorageBackendView, type StorageProvider } from '@board/shared';
import { pool } from '../db';
import { decrypt, encrypt } from './crypto';
import { cloudinaryDriver, localDriver, s3Driver, type Driver } from './drivers';

/**
 * Stockages configurés d'un projet. La configuration publique (nom du cloud, bucket, adresse…) est
 * en clair ; le secret (clé secrète) est chiffré et ne sort jamais de ce module, sauf vers le pilote.
 */

interface Row {
  id: string;
  project_id: string;
  provider: StorageProvider;
  name: string;
  config: Record<string, string | boolean>;
  secret: string | null;
  delivery: 'proxy' | 'direct';
}

export const LOCAL = 'local';

/** Champs publics acceptés pour chaque fournisseur (le reste est ignoré). */
export const PUBLIC_FIELDS: Record<StorageProvider, string[]> = {
  cloudinary: ['cloudName', 'apiKey'],
  s3: ['flavor', 'endpoint', 'region', 'bucket', 'accessKeyId', 'pathStyle'],
};

const pick = (provider: StorageProvider, config: Record<string, unknown>) =>
  Object.fromEntries(
    PUBLIC_FIELDS[provider]
      .filter(k => config[k] !== undefined)
      .map(k => [k, typeof config[k] === 'boolean' ? config[k] : String(config[k]).trim()]),
  ) as Record<string, string | boolean>;

export async function listBackends(projectId: string): Promise<StorageBackendView[]> {
  const { rows } = await pool.query<Row & { files: string; bytes: string }>(
    `SELECT b.*,
            (SELECT count(*) FROM entities e WHERE e.project_id = b.project_id AND e.kind = 'attachment' AND e.data->>'store' = b.id::text) AS files,
            (SELECT coalesce(sum((e.data->>'size')::bigint), 0) FROM entities e WHERE e.project_id = b.project_id AND e.kind = 'attachment' AND e.data->>'store' = b.id::text) AS bytes
       FROM storage_backends b WHERE b.project_id = $1 ORDER BY b.created_at`,
    [projectId],
  );
  return rows.map(r => ({
    id: r.id,
    provider: r.provider,
    name: r.name,
    config: r.config,
    hasSecret: !!r.secret,
    delivery: r.delivery,
    files: Number(r.files),
    bytes: Number(r.bytes),
  }));
}

/** Fichiers gardés par le stockage local du projet. */
export async function localUsage(projectId: string) {
  const { rows } = await pool.query<{ files: string; bytes: string }>(
    `SELECT count(*) AS files, coalesce(sum((data->>'size')::bigint), 0) AS bytes
       FROM entities WHERE project_id = $1 AND kind = 'attachment' AND data->>'store' = 'local'`,
    [projectId],
  );
  return { files: Number(rows[0].files), bytes: Number(rows[0].bytes) };
}

export interface BackendInput {
  provider: StorageProvider;
  name: string;
  config: Record<string, unknown>;
  /** Absent : secret inchangé ; chaîne : nouveau secret. */
  secret?: string;
  delivery: 'proxy' | 'direct';
}

export async function createBackend(projectId: string, input: BackendInput) {
  const config = pick(input.provider, input.config);
  if (input.provider === 's3')
    config.pathStyle ??= S3_FLAVORS[(config.flavor as S3Flavor) ?? 'other']?.pathStyle ?? true;
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO storage_backends (project_id, provider, name, config, secret, delivery)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [
      projectId,
      input.provider,
      input.name,
      config,
      input.secret ? encrypt(input.secret) : null,
      input.delivery,
    ],
  );
  return rows[0].id;
}

export async function updateBackend(
  projectId: string,
  id: string,
  input: Partial<Omit<BackendInput, 'provider'>>,
) {
  const row = await getRow(projectId, id);
  if (!row) return false;
  const config = input.config ? pick(row.provider, { ...row.config, ...input.config }) : row.config;
  await pool.query(
    `UPDATE storage_backends SET name = $3, config = $4, secret = $5, delivery = $6, updated_at = now()
      WHERE project_id = $1 AND id = $2`,
    [
      projectId,
      id,
      input.name ?? row.name,
      config,
      input.secret ? encrypt(input.secret) : row.secret,
      input.delivery ?? row.delivery,
    ],
  );
  return true;
}

export async function deleteBackend(projectId: string, id: string) {
  await pool.query('DELETE FROM storage_backends WHERE project_id = $1 AND id = $2', [projectId, id]);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getRow(projectId: string, id: string) {
  if (!UUID.test(id)) return null;
  const { rows } = await pool.query<Row>('SELECT * FROM storage_backends WHERE project_id = $1 AND id = $2', [
    projectId,
    id,
  ]);
  return rows[0] ?? null;
}

export class StoreUnavailable extends Error {}

/** Pilote d'un stockage du projet, avec le mode de téléchargement choisi. */
export async function driverFor(
  projectId: string,
  store: string,
): Promise<{ driver: Driver; direct: boolean }> {
  if (store === LOCAL) return { driver: localDriver(), direct: false };
  const row = await getRow(projectId, store);
  if (!row) throw new StoreUnavailable('Ce stockage n’existe plus.');
  if (!row.secret) throw new StoreUnavailable(`La clé secrète de « ${row.name} » n’est pas renseignée.`);
  const secret = decrypt(row.secret);
  const c = row.config;
  const driver =
    row.provider === 'cloudinary'
      ? cloudinaryDriver({
          cloudName: String(c.cloudName ?? ''),
          apiKey: String(c.apiKey ?? ''),
          apiSecret: secret,
        })
      : s3Driver({
          endpoint: String(c.endpoint ?? ''),
          region: String(c.region ?? ''),
          bucket: String(c.bucket ?? ''),
          accessKeyId: String(c.accessKeyId ?? ''),
          secretAccessKey: secret,
          pathStyle: c.pathStyle !== false,
        });
  return { driver, direct: row.delivery === 'direct' };
}
