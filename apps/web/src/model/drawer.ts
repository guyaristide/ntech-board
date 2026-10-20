import { create } from 'zustand';

/**
 * Tiroir d'aperçu d'une US liée : l'US d'origine (dont on parcourt les liaisons) et l'historique des
 * US affichées, pour revenir en arrière sans quitter la page.
 */
interface DrawerState {
  origin: string | null;
  stack: string[];
  open: (origin: string, story: string) => void;
  show: (story: string) => void;
  back: () => void;
  close: () => void;
}

export const useDrawer = create<DrawerState>(set => ({
  origin: null,
  stack: [],
  open: (origin, story) => set({ origin, stack: [story] }),
  show: story => set(s => (s.stack.at(-1) === story ? s : { stack: [...s.stack, story] })),
  back: () => set(s => ({ stack: s.stack.slice(0, -1) })),
  close: () => set({ origin: null, stack: [] }),
}));
