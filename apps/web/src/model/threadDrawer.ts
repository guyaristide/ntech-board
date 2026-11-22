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
}

export const useThreadDrawer = create<{
  target: ThreadTarget | null;
  open: (target: ThreadTarget) => void;
  close: () => void;
}>(set => ({
  target: null,
  open: target => set({ target }),
  close: () => set({ target: null }),
}));
