import type { Story, StoryLink, Target } from './types';

/**
 * US complétée des champs apparus après sa création (description, plateformes, liaisons) :
 * les US enregistrées avant le 17/10/2026 ne les portent pas.
 */
export const withStoryDefaults = (s: Story): Story => ({
  ...s,
  description: s.description ?? '',
  targets: s.targets ?? [],
  links: s.links ?? [],
});

/** « PMS › Réservations », ou la plateforme seule quand le module n'est pas précisé. */
export const targetLabel = (t: Target) => (t.module ? `${t.platform} › ${t.module}` : t.platform);
export const sameTarget = (a: Target, b: Target) => a.platform === b.platform && a.module === b.module;

/** Ajoute ou remplace la liaison vers une US (une seule liaison par couple d'US). */
export const putLink = (links: StoryLink[], link: StoryLink): StoryLink[] => [
  ...links.filter(l => l.story !== link.story),
  link,
];

/**
 * US qui décrivent la même fonctionnalité que celle-ci, de proche en proche : si A et B sont
 * la même fonctionnalité, et B et C aussi, A, B et C forment un seul groupe. Doublons compris.
 */
export function featureGroup(stories: Story[], id: string): string[] {
  const byId = new Map(stories.map(s => [s.id, s]));
  const seen = new Set([id]);
  const queue = [id];
  while (queue.length) {
    const current = byId.get(queue.shift()!);
    for (const l of current?.links ?? [])
      if ((l.type === 'same' || l.type === 'duplicate') && !seen.has(l.story) && byId.has(l.story)) {
        seen.add(l.story);
        queue.push(l.story);
      }
  }
  seen.delete(id);
  return [...seen];
}
