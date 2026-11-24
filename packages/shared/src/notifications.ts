import type { ThreadKind } from './threads';

/**
 * Notifications : ce qu'une personne doit savoir sans avoir à le chercher (on la mentionne, on lui
 * attribue un ticket, on répond sur ce qu'elle suit, la vie du projet). Montrées dans l'application,
 * puis par e-mail et en notification système selon ses préférences.
 */
export const NOTIFICATION_TYPES = [
  'mention',
  'reply',
  'comment',
  'assigned',
  'status',
  'sprint',
  'proposal',
  'member',
  'risk',
  'due',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Familles proposées dans les préférences. */
export const NOTIFICATION_GROUPS = {
  mentions: { label: 'Mentions et réponses', types: ['mention', 'reply'] },
  assigned: { label: 'Ce qui m’est attribué', types: ['assigned', 'status', 'due'] },
  following: { label: 'Ce que je suis', types: ['comment'] },
  project: { label: 'Vie du projet', types: ['sprint', 'proposal', 'member', 'risk'] },
} as const satisfies Record<string, { label: string; types: readonly NotificationType[] }>;
export type NotificationGroup = keyof typeof NOTIFICATION_GROUPS;
export const groupOf = (type: NotificationType) =>
  (Object.keys(NOTIFICATION_GROUPS) as NotificationGroup[]).find(g =>
    (NOTIFICATION_GROUPS[g].types as readonly string[]).includes(type),
  )!;

/** Rythme des e-mails : tout de suite, dans le récapitulatif quotidien, ou jamais. */
export const EMAIL_MODES = ['instant', 'digest', 'off'] as const;
export type EmailMode = (typeof EMAIL_MODES)[number];
export const EMAIL_MODE_LABEL: Record<EmailMode, string> = {
  instant: 'Tout de suite',
  digest: 'Récapitulatif quotidien',
  off: 'Jamais',
};

export interface NotificationPrefs {
  email: Record<NotificationGroup, EmailMode>;
  /** Notification système (téléphone, ordinateur), famille par famille. */
  push: Record<NotificationGroup, boolean>;
}

/** Par défaut : tout de suite pour ce qui me vise, en récapitulatif pour le reste. */
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  email: { mentions: 'instant', assigned: 'instant', following: 'digest', project: 'digest' },
  push: { mentions: true, assigned: true, following: false, project: false },
};

export const withPrefDefaults = (p?: Partial<NotificationPrefs> | null): NotificationPrefs => ({
  email: { ...DEFAULT_NOTIFICATION_PREFS.email, ...p?.email },
  push: { ...DEFAULT_NOTIFICATION_PREFS.push, ...p?.push },
});

export interface AppNotification {
  id: string;
  type: NotificationType;
  /** Élément concerné ; vide pour une notification du projet. */
  target: { kind: string; id: string };
  title: string;
  body: string;
  /** Adresse à ouvrir dans l'application. */
  path: string;
  actorName: string;
  /** Nombre d'événements regroupés (plusieurs changements rapprochés n'en font qu'une). */
  count: number;
  createdAt: string;
  updatedAt: string;
  readAt: string | null;
}

export interface NotificationFeed {
  items: AppNotification[];
  unread: number;
}

/** Suivi d'un élément : abonné (on est prévenu), en sourdine (jamais), ou rien de particulier. */
export type FollowState = 'following' | 'muted' | 'none';

/** Personne mentionnable : un membre du projet. */
export interface Person {
  userId: string;
  name: string;
}

/** Adresse de la fiche d'un élément, pour ouvrir une notification. */
export function pathOf(kind: ThreadKind | string, id: string): string {
  const e = encodeURIComponent(id);
  switch (kind) {
    case 'story':
      return `/us/${e}`;
    case 'epic':
      return `/epic/${e}`;
    case 'workshop':
      return `/atelier/${e}`;
    case 'risk':
      return `/risque/${e}`;
    case 'diligence':
      return `/diligence/${e}`;
    case 'ticket':
      return `/realisation/ticket/${e}`;
    case 'sprint':
      return `/realisation/sprint/${e}`;
    case 'finding':
      return `/realisation/retour/${e}`;
    case 'campaign':
      return `/realisation/recette/${e}`;
    case 'release':
      return '/realisation/versions';
    case 'phase':
      return `/raci?phase=${e}`;
    case 'reference':
      return '/references';
    case 'party':
      return '/parties';
    default:
      return '/';
  }
}

/** Mentions d'un texte : les personnes dont « @Nom » y figure (le nom le plus long d'abord). */
export function mentionsIn(text: string, people: Person[]): string[] {
  const found = new Set<string>();
  let rest = text;
  for (const p of [...people].sort((a, b) => b.name.length - a.name.length)) {
    if (!p.name) continue;
    const token = `@${p.name}`;
    if (rest.includes(token)) {
      found.add(p.userId);
      rest = rest.split(token).join(' ');
    }
  }
  return [...found];
}
