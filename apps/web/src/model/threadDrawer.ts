import { create } from 'zustand';
import type { ThreadKind } from '@board/shared';

/**
 * Fil ouvert dans le tiroir latéral : celui d'une ligne de liste ou d'une pièce jointe, pour discuter
 * sans quitter la page. `title` nomme l'élément ; `href`, s'il y en a un, ouvre sa fiche.
 */
export interface ThreadTarget {
  kind: ThreadKind;
  id: string;
  title: string;
  href?: string;
  /** Afficher aussi les pièces jointes de l'élément (éléments sans fiche). */
  files?: boolean;
}

/** Ouvrir un fil depuis le tiroir (le fichier d'une partie prenante) garde le précédent pour y revenir. */
export const useThreadDrawer = create<{
  target: ThreadTarget | null;
  previous: ThreadTarget[];
  open: (target: ThreadTarget) => void;
  back: () => void;
  close: () => void;
}>(set => ({
  target: null,
  previous: [],
  open: target => set(s => ({ target, previous: s.target ? [...s.previous, s.target] : [] })),
  back: () => set(s => ({ target: s.previous.at(-1) ?? null, previous: s.previous.slice(0, -1) })),
  close: () => set({ target: null, previous: [] }),
}));
