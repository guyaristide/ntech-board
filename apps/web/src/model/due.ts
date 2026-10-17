/** Échéances saisies en date ISO ou en texte libre (risques, actions, diligences). */

/** « 2026-11-09 » devient « 9 nov. 2026 » ; un texte libre (« Continu ») reste tel quel. */
export const dueLabel = (due: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(due)
    ? new Date(`${due}T12:00:00`).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : due;

/** Échéance dépassée (à n'afficher que pour un élément encore ouvert). */
export const overdue = (due: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(due) && due < new Date().toISOString().slice(0, 10);
