/** Mise en forme des valeurs exportées en CSV depuis les écrans du cadrage. */

/** Date ISO (« 2026-11-02 ») en jj/mm/aaaa ; un texte libre (« Pendant les ateliers ») est gardé. */
export const frDate = (value: string | null | undefined) => {
  const m = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (value ?? '');
};
