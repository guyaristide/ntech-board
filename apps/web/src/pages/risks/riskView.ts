import { riskLevel, riskScore, type Cotation, type Phase, type Risk } from '@board/shared';

export type Basis = 'initial' | 'residual';
export const BASIS_LABEL: Record<Basis, string> = { initial: 'Initiale', residual: 'Résiduelle' };

/**
 * Cotation d'un risque telle qu'elle était à une phase : celle de la dernière revue consignée
 * dans cette phase ou une phase antérieure. Sans phase, la cotation actuelle. Null si aucune revue.
 */
export function cotationAt(risk: Risk, basis: Basis, phases: Phase[], phase: string | null): Cotation | null {
  if (!phase) return risk[basis];
  const limit = phases.findIndex(p => p.id === phase);
  const reviews = risk.reviews.filter(r => {
    const at = phases.findIndex(p => p.id === r.phase);
    return at >= 0 && at <= limit;
  });
  const last = reviews.sort((a, b) => a.at.localeCompare(b.at)).at(-1);
  return last ? last[basis] : null;
}

export const scoreOf = (c: Cotation | null) => (c ? riskScore(c) : null);
export const levelOf = (c: Cotation | null) => riskLevel(scoreOf(c));

/** « 2026-11-09 » devient « 9 nov. 2026 » ; un texte libre (« Continu ») reste tel quel. */
export const dueLabel = (due: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(due)
    ? new Date(`${due}T12:00:00`).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : due;

/** Échéance dépassée pour une action ou un risque encore ouvert. */
export const overdue = (due: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(due) && due < new Date().toISOString().slice(0, 10);
