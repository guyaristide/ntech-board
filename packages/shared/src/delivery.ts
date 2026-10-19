import type { Party, ProjectSettings } from './parties';
import type { Block, Comment } from './types';

/**
 * Partie Réalisation : versions (jalons de livraison), sprints et tickets. Une US validée au cadrage
 * passe en réalisation sous la forme d'un ticket de type « US » qui garde le lien vers elle.
 */
export type ReleaseStatus = 'Prévue' | 'En cours' | 'Livrée' | 'Abandonnée';
export const RELEASE_STATUSES: ReleaseStatus[] = ['Prévue', 'En cours', 'Livrée', 'Abandonnée'];

export interface Release {
  id: string;
  name: string;
  goal: string;
  start: string | null;
  /** Date de livraison visée. */
  end: string | null;
  status: ReleaseStatus;
  /** Versions du cadrage couvertes (« MVP ») : les US de ces versions y sont rangées par défaut. */
  versions: string[];
  notes: Block[];
}

export type SprintStatus = 'planned' | 'active' | 'closed';
export const SPRINT_STATUS_LABEL: Record<SprintStatus, string> = {
  planned: 'Prévu',
  active: 'En cours',
  closed: 'Clos',
};

export interface Sprint {
  id: string;
  name: string;
  goal: string;
  start: string | null;
  end: string | null;
  status: SprintStatus;
  /** Capacité de l'équipe pour le sprint, dans l'unité d'estimation du projet. */
  capacity: number | null;
  release: string;
  review: Block[];
  retro: Block[];
  closedAt: string | null;
  /** À la clôture : estimation des tickets terminés, et tickets reportés. */
  velocity: number | null;
  carried: string[];
}

/** Liaison entre tickets ; chaque liaison est enregistrée des deux côtés. */
export type TicketLinkType = 'blocks' | 'blockedBy' | 'relates' | 'duplicates';
export const TICKET_LINK_TYPES: TicketLinkType[] = ['blockedBy', 'blocks', 'relates', 'duplicates'];
export const TICKET_LINK_LABEL: Record<TicketLinkType, string> = {
  blockedBy: 'Bloqué par',
  blocks: 'Bloque',
  relates: 'Voir aussi',
  duplicates: 'Doublon de',
};
export const TICKET_LINK_INVERSE: Record<TicketLinkType, TicketLinkType> = {
  blockedBy: 'blocks',
  blocks: 'blockedBy',
  relates: 'relates',
  duplicates: 'duplicates',
};
export interface TicketLink {
  ticket: string;
  type: TicketLinkType;
}

export interface Ticket {
  /** Clé lisible : ETO-12. */
  id: string;
  /** Type de ticket, parmi ceux des réglages (« story » pour une US). */
  type: string;
  title: string;
  /** US du cadrage dont le ticket assure la réalisation. */
  story: string;
  parent: string;
  /** Étape du workflow (identifiant, réglages du projet). */
  status: string;
  estimate: number | null;
  release: string;
  /** Sprint, ou vide : le ticket est au backlog. */
  sprint: string;
  /** Ordre dans le backlog : plus petit = plus prioritaire. */
  rank: number;
  /** Critères « prêt » cochés (identifiants, réglages du projet). */
  ready: string[];
  /** Partie prenante responsable (identifiant d'une personne ou d'un rôle). */
  assignee: string;
  links: TicketLink[];
  description: Block[];
  comments: Comment[];
  createdAt: string;
  updatedAt: string;
}

/** Ticket complété des champs apparus depuis sa création (liaisons, lot 3). */
export const withTicketDefaults = (t: Ticket): Ticket => ({ ...t, links: t.links ?? [] });

/** Bloqué : lié par « Bloqué par » à un ticket qui n'est pas terminé. */
export const isBlocked = (settings: ProjectSettings, tickets: Ticket[], t: Ticket) =>
  t.links.some(l => {
    if (l.type !== 'blockedBy') return false;
    const other = tickets.find(x => x.id === l.ticket);
    return !!other && !isDone(settings, other);
  });

/**
 * Parties qui désignent le membre : sa fiche de personne (reliée à son compte) et les rôles qu'elle
 * tient. Sert à « Mes tickets ».
 */
export function partiesOfUser(parties: Party[], userId: string | null) {
  if (!userId) return [];
  const persons = parties.filter(p => p.type === 'person' && p.userId === userId).map(p => p.id);
  const roles = parties.filter(p => p.type === 'role' && persons.includes(p.holder)).map(p => p.id);
  return [...persons, ...roles];
}

export const DELIVERY_KINDS = ['release', 'sprint', 'ticket', 'campaign'] as const;
export type DeliveryKind = (typeof DELIVERY_KINDS)[number];
export const isDeliveryKind = (kind: string): kind is DeliveryKind =>
  (DELIVERY_KINDS as readonly string[]).includes(kind);

/** Unité courte d'estimation : « 5 pts », « 3 j », « 6 h ». */
export const UNIT: Record<string, string> = { points: 'pts', days: 'j', hours: 'h', none: '' };
export const amount = (n: number, settings: ProjectSettings) =>
  `${Number.isInteger(n) ? n : n.toFixed(1)} ${UNIT[settings.delivery.estimation]}`.trim();

/** Catégorie d'une étape : à faire, en cours, terminé (première étape si l'identifiant est inconnu). */
export const stepOf = (settings: ProjectSettings, status: string) =>
  settings.delivery.workflow.find(s => s.id === status) ?? settings.delivery.workflow[0];
export const isDone = (settings: ProjectSettings, t: Ticket) => stepOf(settings, t.status)?.category === 'done';

/** Ticket prêt : tous les critères cochés, et estimé si le projet estime. */
export const isReady = (settings: ProjectSettings, t: Ticket) =>
  settings.delivery.readiness.every(c => t.ready.includes(c.id)) &&
  (settings.delivery.estimation === 'none' || t.estimate !== null);

/** Somme des estimations ; les tickets non estimés comptent pour zéro et sont dénombrés à part. */
export function load(tickets: Ticket[]) {
  return {
    total: tickets.reduce((n, t) => n + (t.estimate ?? 0), 0),
    unestimated: tickets.filter(t => t.estimate === null).length,
  };
}

/** Avancement : estimation terminée sur estimation totale, et nombre de tickets terminés. */
export function progress(settings: ProjectSettings, tickets: Ticket[]) {
  const done = tickets.filter(t => isDone(settings, t));
  return {
    done: load(done).total,
    total: load(tickets).total,
    count: tickets.length,
    doneCount: done.length,
  };
}

const day = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const at = (s: string) => new Date(`${s}T12:00:00Z`);

/**
 * Dates d'un nouveau sprint : du lundi qui suit la fin du dernier sprint (ou la semaine en cours)
 * au vendredi de sa dernière semaine.
 */
export function nextSprintDates(sprints: Sprint[], weeks: number, today = iso(new Date())) {
  const mondayFrom = (d: Date) => new Date(d.getTime() + ((8 - d.getUTCDay()) % 7) * day);
  const last = sprints
    .map(s => s.end)
    .filter((e): e is string => !!e)
    .sort()
    .at(-1);
  let start: Date;
  if (last && last >= today) start = mondayFrom(new Date(at(last).getTime() + day));
  else {
    const t = at(today);
    const dow = t.getUTCDay();
    start = dow === 0 || dow === 6 ? mondayFrom(t) : new Date(t.getTime() - (dow - 1) * day);
  }
  return { start: iso(start), end: iso(new Date(start.getTime() + (weeks * 7 - 3) * day)) };
}

/** Jours ouvrés restants d'un sprint (lundi à vendredi), aujourd'hui compris, à partir de son début s'il est à venir. */
export function workdaysLeft(end: string | null, today = iso(new Date()), start: string | null = null) {
  const from = start && start > today ? start : today;
  if (!end || end < from) return 0;
  let n = 0;
  for (let d = at(from); iso(d) <= end; d = new Date(d.getTime() + day)) if (d.getUTCDay() % 6) n++;
  return n;
}

/** Tickets triés par priorité (rang). */
export const byRank = (a: Ticket, b: Ticket) => a.rank - b.rank;

/**
 * Rang d'un ticket déposé avant `before` dans une liste (à la fin si `before` est vide) : le milieu
 * entre ses voisins, sans renuméroter les autres.
 */
export function rankAt(list: Ticket[], before: string | null, moving: string) {
  const others = list.filter(t => t.id !== moving).sort(byRank);
  const i = before ? others.findIndex(t => t.id === before) : -1;
  if (i < 0) return (others.at(-1)?.rank ?? 0) + 1;
  const prev = i > 0 ? others[i - 1].rank : others[i].rank - 2;
  return (prev + others[i].rank) / 2;
}

// --- Recette -----------------------------------------------------------------------------

/**
 * Mode de recette, choisi par campagne : interne (l'équipe teste), client (le client teste dans
 * l'outil et donne son verdict par US), PV seul (l'équipe teste, le PV est signé hors outil), mixte
 * (l'équipe teste, puis le client valide chaque US).
 */
export type CampaignMode = 'internal' | 'client' | 'pv' | 'mixed';
export const CAMPAIGN_MODE_LABEL: Record<CampaignMode, string> = {
  internal: 'Recette interne',
  client: 'Recette par le client dans l’outil',
  pv: 'PV seul, signé hors outil',
  mixed: 'Recette interne, puis validation du client',
};
export type CampaignStatus = 'En préparation' | 'En cours' | 'Terminée';
export const CAMPAIGN_STATUSES: CampaignStatus[] = ['En préparation', 'En cours', 'Terminée'];

export type TestStatus = '' | 'ok' | 'ko' | 'reserve' | 'na';
export const TEST_STATUS_LABEL: Record<Exclude<TestStatus, ''>, string> = {
  ok: 'OK',
  ko: 'KO',
  reserve: 'Réserve',
  na: 'Non applicable',
};
export interface TestResult {
  status: TestStatus;
  comment: string;
  by: string;
  at: string;
  /** Bug ouvert à partir de ce résultat (clé de ticket). */
  bug: string;
}
export type VerdictStatus = '' | 'accepted' | 'refused';
export const VERDICT_LABEL: Record<Exclude<VerdictStatus, ''>, string> = {
  accepted: 'Acceptée',
  refused: 'Refusée',
};
export interface Verdict {
  status: VerdictStatus;
  comment: string;
  by: string;
  at: string;
}

export interface Campaign {
  id: string;
  name: string;
  release: string;
  mode: CampaignMode;
  status: CampaignStatus;
  start: string | null;
  end: string | null;
  /** US recettées (identifiants du cadrage). */
  scope: string[];
  /** Résultat par cas de test : clé « US:critère ». */
  results: Record<string, TestResult>;
  /** Verdict du client par US (modes client et mixte). */
  verdicts: Record<string, Verdict>;
  /** Signataires du PV : parties prenantes (personnes ou rôles). */
  signatories: string[];
  notes: Block[];
}

export const caseKey = (story: string, criterion: string) => `${story}:${criterion}`;
/** Le client donne son verdict par US. */
export const hasVerdicts = (mode: CampaignMode) => mode === 'client' || mode === 'mixed';

/** Bilan d'une liste de résultats : nombre de cas par résultat, et cas non encore passés. */
export function testSummary(results: TestStatus[]) {
  const count = (s: TestStatus) => results.filter(r => r === s).length;
  return { total: results.length, ok: count('ok'), ko: count('ko'), reserve: count('reserve'), na: count('na'), todo: count('') };
}

/**
 * Cas de test d'une campagne : les critères d'acceptation des US du périmètre, avec leur résultat.
 * Un critère ajouté après le lancement apparaît comme non passé ; un critère supprimé disparaît.
 */
export function casesOf(campaign: Campaign, stories: { id: string; acceptance: { id: string; text: string }[] }[]) {
  const byId = new Map(stories.map(s => [s.id, s]));
  return campaign.scope.flatMap(id =>
    (byId.get(id)?.acceptance ?? []).map(c => ({
      story: id,
      criterion: c,
      key: caseKey(id, c.id),
      result: campaign.results[caseKey(id, c.id)],
    })),
  );
}
