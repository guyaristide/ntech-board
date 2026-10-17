import type { Story } from '@board/shared';

// Mots trop fréquents dans les US pour distinguer deux fonctionnalités.
const STOP = new Set(
  `le la les un une des du de d l au aux et ou en a à pour par sur dans avec sans son sa ses mon ma mes
   leur leurs qui que quand afin je veux etre être avoir est sont ce cette ces se ne pas plus tout tous
   touriste operateur opérateur systeme système administrateur plateforme utilisateur sgat`
    .split(/\s+/)
    .filter(Boolean),
);
const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Mots significatifs d'une US, ramenés à leur racine grossière (« réservations » → « reserva »). */
export const wordsOf = (s: Pick<Story, 'title' | 'iWant'>) =>
  new Set(
    norm(`${s.title} ${s.iWant}`)
      .split(/[^a-z0-9]+/)
      .filter(w => w.length > 2 && !STOP.has(w))
      .map(w => w.slice(0, 7)),
  );

/** Part des mots en commun (indice de Jaccard), de 0 à 1. */
export const likeness = (a: Set<string>, b: Set<string>) => {
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const w of a) if (b.has(w)) common++;
  return common / (a.size + b.size - common);
};

/**
 * US qui ressemblent à celle-ci, d'autres épiques d'abord : c'est là que se trouvent les doublons
 * entre cas d'usage (UC) et exigences (EX). Celles déjà liées sont écartées.
 */
export function similarStories(stories: Story[], story: Story, limit = 5, threshold = 0.25) {
  const mine = wordsOf(story);
  const linked = new Set(story.links.map(l => l.story));
  return stories
    .filter(s => s.id !== story.id && !linked.has(s.id))
    .map(s => ({ story: s, score: likeness(mine, wordsOf(s)) + (s.epic === story.epic ? -0.05 : 0) }))
    .filter(x => x.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
