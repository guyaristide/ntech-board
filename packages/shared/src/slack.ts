/**
 * Slack, dans les deux sens : familles d'événements publiées dans un canal, et commande « /board »
 * tapée dans Slack. Types partagés et analyse de la commande.
 */

export const SLACK_EVENT_GROUPS = ['tickets', 'sprints', 'risks', 'comments', 'diligences'] as const;
export type SlackEventGroup = (typeof SLACK_EVENT_GROUPS)[number];
export const SLACK_EVENT_LABEL: Record<SlackEventGroup, { name: string; hint: string }> = {
  tickets: { name: 'Tickets', hint: 'Création et changement d’étape' },
  sprints: { name: 'Sprints et versions', hint: 'Sprint démarré ou clos, version livrée' },
  risks: { name: 'Risques', hint: 'Un risque devient critique' },
  comments: { name: 'Discussions', hint: 'Nouveau message dans un fil' },
  diligences: { name: 'Diligences', hint: 'Changement de statut' },
};

/** État de la liaison Slack d'un projet, sans aucun secret. */
export interface SlackStatus {
  /** Le serveur peut chiffrer les secrets (SECRETS_KEY présente). */
  canEncrypt: boolean;
  /** Webhook entrant enregistré : fin de son adresse, pour le reconnaître. */
  webhook: string;
  events: SlackEventGroup[];
  lastError: string;
  lastSentAt: string | null;
  /** Secret de signature enregistré : la commande /board est acceptée. */
  commands: boolean;
  /** Adresse à saisir dans Slack comme « Request URL » de la commande. */
  commandUrl: string;
  /** Comptes Slack reliés à un membre du projet. */
  linked: { slackName: string; name: string; linkedAt: string }[];
  updatedBy: string;
  updatedAt: string | null;
}

/** Demande de liaison d'un compte Slack, telle que la page de confirmation l'affiche. */
export interface SlackLinkRequest {
  slackName: string;
  project: string;
}

export type SlackCommand =
  | { name: 'help' }
  | { name: 'create'; title: string }
  | { name: 'search'; query: string }
  | { name: 'show'; id: string }
  | { name: 'mine' }
  | { name: 'status'; id: string; step: string }
  | { name: 'comment'; id: string; text: string }
  | { name: 'note'; text: string }
  | { name: 'unlink' };

const ID = /^[A-Za-z][A-Za-z0-9]*(-[A-Za-z0-9]+)+$/;
const plain = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * Analyse le texte tapé après « /board ». Les verbes sont en français, avec leurs équivalents
 * anglais ; un identifiant seul (« ETO-12 ») affiche l'élément.
 */
export function parseSlackCommand(input: string): SlackCommand {
  const text = input.trim().replace(/\s+/g, ' ');
  if (!text) return { name: 'help' };
  const [first, ...restWords] = text.split(' ');
  const verb = plain(first);
  const rest = restWords.join(' ');
  const [second, ...tail] = restWords;
  if (['aide', 'help', '?'].includes(verb)) return { name: 'help' };
  if (['ticket', 'creer', 'create', 'nouveau', 'new'].includes(verb))
    return rest ? { name: 'create', title: rest } : { name: 'help' };
  if (['chercher', 'cherche', 'search', 'rechercher', 'find'].includes(verb))
    return rest ? { name: 'search', query: rest } : { name: 'help' };
  if (['voir', 'show', 'view'].includes(verb) && second) return { name: 'show', id: second };
  if (['mes', 'mine', 'my'].includes(verb)) return { name: 'mine' };
  if (['statut', 'status', 'etape', 'step', 'passer', 'move'].includes(verb) && second && tail.length)
    return { name: 'status', id: second, step: tail.join(' ') };
  if (['commenter', 'comment', 'repondre', 'reply'].includes(verb) && second && tail.length)
    return { name: 'comment', id: second, text: tail.join(' ') };
  if (['note', 'noter', 'deposer', 'echange'].includes(verb))
    return rest ? { name: 'note', text: rest } : { name: 'help' };
  if (['delier', 'unlink', 'deconnecter'].includes(verb)) return { name: 'unlink' };
  if (ID.test(first) && !rest) return { name: 'show', id: first };
  return { name: 'search', query: text };
}

/** Échappe un texte pour Slack (mrkdwn) : seuls &, < et > sont à neutraliser. */
export const slackEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Lien Slack : « <adresse|texte> ». */
export const slackLink = (url: string, text: string) => `<${url}|${slackEscape(text).replace(/\|/g, '/')}>`;
