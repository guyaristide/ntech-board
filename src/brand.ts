/**
 * Identité de l'instance : chaque projet déployé (etourisme-board, pfo-board…) fixe son nom
 * par variables d'environnement au build, l'éditeur reste NTECH SARL (Neiba Technologies).
 */
export const BRAND = {
  board: import.meta.env.VITE_BOARD_TITLE || 'Cadrage eTourisme',
  project: import.meta.env.VITE_BOARD_PROJECT || 'eTourisme SGAT',
  publisher: 'Neiba Technologies',
  company: 'NTECH SARL',
  logo: '/brand/neiba-technologies.png',
  site: 'https://neiba-technologies.com',
};
