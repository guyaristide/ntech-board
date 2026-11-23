/**
 * Sauvegardes d'un projet : copies datées de tout son contenu, gardées sur le serveur, prises chaque
 * nuit et avant toute action destructrice. Types partagés et règle de conservation.
 */

/** Ce qui a déclenché la sauvegarde. */
export type BackupReason = 'scheduled' | 'manual' | 'before-restore' | 'before-delete';
export const BACKUP_REASON_LABEL: Record<BackupReason, string> = {
  scheduled: 'Automatique',
  manual: 'Manuelle',
  'before-restore': 'Avant une restauration',
  'before-delete': 'Avant la suppression du projet',
};

export interface BackupInfo {
  id: string;
  projectSlug: string;
  projectTitle: string;
  /** Le projet n'existe plus : la sauvegarde ne se restaure que dans un nouveau projet. */
  orphan: boolean;
  reason: BackupReason;
  note: string;
  /** Taille du fichier compressé, en octets. */
  size: number;
  /** Nombre d'éléments par type (« stories », « tickets »…) et membres. */
  counts: Record<string, number>;
  by: string;
  createdAt: string;
  /** Dernière nuit où le contenu du projet était encore identique à cette sauvegarde. */
  verifiedAt: string;
}

/** Règle de conservation des sauvegardes automatiques, et des sauvegardes de sécurité. */
export interface BackupPolicy {
  /** Heure (du serveur) de la sauvegarde quotidienne. */
  hour: number;
  /** Jours pendant lesquels toutes les sauvegardes automatiques sont gardées. */
  daily: number;
  /** Semaines pendant lesquelles on garde ensuite la dernière de chaque semaine. */
  weekly: number;
  /** Mois pendant lesquels on garde ensuite la dernière de chaque mois. */
  monthly: number;
  /** Jours de conservation des sauvegardes prises avant une restauration ou une suppression. */
  safetyDays: number;
}

export interface BackupList {
  backups: BackupInfo[];
  policy: BackupPolicy;
}

const DAY = 86_400_000;
const weekOf = (iso: string) => {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

/**
 * Sauvegardes d'un même projet à supprimer. Les manuelles ne sont jamais supprimées d'office ; la
 * plus récente des automatiques non plus. Les automatiques sont toutes gardées `daily` jours, puis
 * la dernière de chaque semaine pendant `weekly` semaines, puis la dernière de chaque mois pendant
 * `monthly` mois.
 */
export function backupsToPrune(
  list: Pick<BackupInfo, 'id' | 'reason' | 'createdAt'>[],
  policy: BackupPolicy,
  now = new Date().toISOString(),
): string[] {
  const age = (b: { createdAt: string }) => (Date.parse(now) - Date.parse(b.createdAt)) / DAY;
  const out = list
    .filter(
      b => (b.reason === 'before-restore' || b.reason === 'before-delete') && age(b) > policy.safetyDays,
    )
    .map(b => b.id);
  const scheduled = list
    .filter(b => b.reason === 'scheduled')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const kept = new Set<string>();
  scheduled.forEach((b, i) => {
    const days = age(b);
    if (i === 0 || days <= policy.daily) return;
    const slot =
      days <= policy.daily + policy.weekly * 7
        ? `w${weekOf(b.createdAt)}`
        : days <= policy.daily + policy.weekly * 7 + policy.monthly * 31
          ? `m${b.createdAt.slice(0, 7)}`
          : null;
    // Parcours du plus récent au plus ancien : le premier rencontré d'une période est son dernier.
    if (slot && !kept.has(slot)) kept.add(slot);
    else out.push(b.id);
  });
  return out;
}
