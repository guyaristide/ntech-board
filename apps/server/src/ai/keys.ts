import { pool } from '../db';
import { decrypt, encrypt } from '../files/crypto';

/**
 * Clé de l'API Claude de chaque projet : chaque client paie et maîtrise sa propre consommation.
 * Chiffrée en base ; elle ne sort de ce module que vers le client Anthropic.
 */

export class AiUnavailable extends Error {}

export interface AiKeyStatus {
  configured: boolean;
  /** Quatre derniers caractères, pour reconnaître la clé. */
  hint: string;
  updatedBy: string;
  updatedAt: string | null;
}

export async function aiKeyStatus(projectId: string): Promise<AiKeyStatus> {
  const { rows } = await pool.query<{ hint: string; updated_by: string; updated_at: Date }>(
    'SELECT hint, updated_by, updated_at FROM ai_keys WHERE project_id = $1',
    [projectId],
  );
  const r = rows[0];
  return r
    ? { configured: true, hint: r.hint, updatedBy: r.updated_by, updatedAt: r.updated_at.toISOString() }
    : { configured: false, hint: '', updatedBy: '', updatedAt: null };
}

/** La clé du projet, en clair ; lève AiUnavailable si elle manque ou ne se déchiffre plus. */
export async function aiKey(projectId: string) {
  const { rows } = await pool.query<{ secret: string }>('SELECT secret FROM ai_keys WHERE project_id = $1', [
    projectId,
  ]);
  if (!rows[0])
    throw new AiUnavailable(
      'Analyse indisponible : aucune clé Claude n’est enregistrée pour ce projet (Réglages du projet).',
    );
  try {
    return decrypt(rows[0].secret);
  } catch {
    throw new AiUnavailable(
      'Clé Claude illisible (SECRETS_KEY a changé ?) : un administrateur doit la saisir de nouveau.',
    );
  }
}

export async function saveAiKey(projectId: string, key: string, by: string) {
  await pool.query(
    `INSERT INTO ai_keys (project_id, secret, hint, updated_by) VALUES ($1, $2, $3, $4)
     ON CONFLICT (project_id) DO UPDATE SET secret = $2, hint = $3, updated_by = $4, updated_at = now()`,
    [projectId, encrypt(key), key.slice(-4), by],
  );
}

export async function deleteAiKey(projectId: string) {
  await pool.query('DELETE FROM ai_keys WHERE project_id = $1', [projectId]);
}
