import type { Role } from './api';
import type { Block, Diligence, Phase, Risk, Workshop } from './types';

/**
 * Référentiel des parties prenantes du projet : organisations, personnes et rôles (« Lead Chef de
 * projet »), auxquels renvoient le RACI, les risques, les diligences et les séquences d'atelier.
 * Ces champs restent du texte ; une partie est reconnue par son nom, son sigle ou ses alias.
 */
export type PartyType = 'organization' | 'person' | 'role';
export const PARTY_TYPES: PartyType[] = ['organization', 'person', 'role'];
export const PARTY_LABEL: Record<PartyType, string> = {
  organization: 'Organisation',
  person: 'Personne',
  role: 'Rôle',
};
export const PARTY_PREFIX: Record<PartyType, string> = { organization: 'ORG-', person: 'PER-', role: 'ROL-' };

export interface Party {
  id: string;
  type: PartyType;
  name: string;
  /** Sigle d'une organisation (« MTL »), reconnu comme le nom. */
  short: string;
  /** Type d'organisation, parmi ceux des réglages du projet (« Maîtrise d’ouvrage »). */
  category: string;
  /** Personne ou rôle : organisation de rattachement (identifiant). */
  organization: string;
  /** Rôle : personne qui le tient (identifiant), vide tant qu'elle n'est pas désignée. */
  holder: string;
  /** Personne : fonction (« Directeur du tourisme »). */
  function: string;
  email: string;
  phone: string;
  /** Personne : compte du tableau, pour la visibilité par organisation. */
  userId: string | null;
  /** Autres écritures rencontrées (« Lead CP »), reconnues comme le nom. */
  aliases: string[];
  notes: Block[];
}

export const newParty = (id: string, type: PartyType, patch: Partial<Party> = {}): Party => ({
  id,
  type,
  name: '',
  short: '',
  category: '',
  organization: '',
  holder: '',
  function: '',
  email: '',
  phone: '',
  userId: null,
  aliases: [],
  notes: [],
  ...patch,
});

// --- Réglages du projet -----------------------------------------------------------------

export type Estimation = 'points' | 'days' | 'hours' | 'none';
export const ESTIMATION_LABEL: Record<Estimation, string> = {
  points: 'Points',
  days: 'Jours',
  hours: 'Heures',
  none: 'Pas d’estimation',
};
export type StepCategory = 'todo' | 'doing' | 'done';
export const STEP_CATEGORY_LABEL: Record<StepCategory, string> = {
  todo: 'À faire',
  doing: 'En cours',
  done: 'Terminé',
};
export interface WorkflowStep {
  id: string;
  name: string;
  category: StepCategory;
}
export interface TicketType {
  id: string;
  name: string;
}

/** Partie « Réalisation » : suivi des sprints et des tickets, activé et réglé projet par projet. */
export interface DeliverySettings {
  enabled: boolean;
  /** Préfixe des clés de tickets (« ETO » donne ETO-12). */
  key: string;
  /** Durée par défaut d'un sprint, en semaines ; modifiable sprint par sprint. */
  sprintWeeks: number;
  estimation: Estimation;
  workflow: WorkflowStep[];
  ticketTypes: TicketType[];
  /** Critères qu'un ticket doit remplir pour entrer dans un sprint (« prêt »). */
  readiness: TicketType[];
  /**
   * Qui voit la partie : les rôles cités, les membres rattachés aux organisations citées, et les
   * membres autorisés un par un ; un membre exclu ne la voit pas. Les administrateurs la voient toujours.
   */
  visibility: { roles: Role[]; organizations: string[]; allow: string[]; deny: string[] };
}

/** Périmètre de risque : son libellé et le préfixe de ses identifiants (« Projet », R12). */
export interface RiskScope {
  name: string;
  prefix: string;
}

export interface ProjectSettings {
  organizationTypes: string[];
  /** Versions ou lots du cadrage, dans l'ordre (« Hors périmètre » s'y ajoute toujours). */
  versions: string[];
  /** Acteurs proposés pour les US, en plus de ceux déjà saisis. */
  actors: string[];
  /** Nom du document de référence : « Cahier des charges », « Expression de besoin »… */
  referenceDocument: string;
  riskScopes: RiskScope[];
  /** Accès MCP (jetons personnels) : rôles autorisés ; les administrateurs le sont toujours. */
  mcp: { roles: Role[] };
  delivery: DeliverySettings;
}

export const DEFAULT_SETTINGS: ProjectSettings = {
  organizationTypes: ['Maîtrise d’ouvrage', 'Maîtrise d’œuvre', 'Partenaire', 'Sous-traitant', 'Autorité'],
  versions: ['MVP', 'V1', 'V2'],
  actors: [],
  referenceDocument: 'Cahier des charges',
  riskScopes: [{ name: 'Projet', prefix: 'R' }],
  mcp: { roles: ['admin'] },
  delivery: {
    enabled: false,
    key: '',
    sprintWeeks: 2,
    estimation: 'points',
    workflow: [
      { id: 'todo', name: 'À faire', category: 'todo' },
      { id: 'doing', name: 'En cours', category: 'doing' },
      { id: 'review', name: 'En revue', category: 'doing' },
      { id: 'testing', name: 'En recette', category: 'doing' },
      { id: 'done', name: 'Terminé', category: 'done' },
    ],
    ticketTypes: [
      { id: 'story', name: 'US' },
      { id: 'task', name: 'Tâche' },
      { id: 'subtask', name: 'Sous-tâche' },
      { id: 'bug', name: 'Bug' },
      { id: 'spike', name: 'Étude' },
    ],
    readiness: [
      { id: 'criteria', name: 'Critères d’acceptation rédigés' },
      { id: 'design', name: 'Maquettes ou parcours disponibles' },
      { id: 'dependencies', name: 'Dépendances levées' },
      { id: 'questions', name: 'Questions tranchées' },
    ],
    visibility: { roles: ['admin', 'editor', 'viewer'], organizations: [], allow: [], deny: [] },
  },
};

/** Réglages enregistrés, complétés des valeurs par défaut (projets créés avant les réglages). */
export const withSettingsDefaults = (s: Partial<ProjectSettings> | null | undefined): ProjectSettings => ({
  ...DEFAULT_SETTINGS,
  ...s,
  delivery: {
    ...DEFAULT_SETTINGS.delivery,
    ...s?.delivery,
    visibility: { ...DEFAULT_SETTINGS.delivery.visibility, ...s?.delivery?.visibility },
  },
});

/**
 * Réglages repris d'un autre projet : tout, sauf ce qui n'a de sens que dans le projet d'origine
 * (clé des tickets, organisations et membres nommés dans la visibilité de la Réalisation).
 */
export const settingsTemplate = (from: ProjectSettings): ProjectSettings => {
  const s = withSettingsDefaults(from);
  return {
    ...s,
    delivery: {
      ...s.delivery,
      key: '',
      visibility: { ...s.delivery.visibility, organizations: [], allow: [], deny: [] },
    },
  };
};

/** Le membre peut-il utiliser le MCP (créer des jetons, s'en servir) ? Toujours vrai pour un administrateur. */
export const canUseMcp = (settings: ProjectSettings, role: Role | null) =>
  !!role && (role === 'admin' || settings.mcp.roles.includes(role));

/** Version des US écartées du périmètre : toujours proposée, en dernier. */
export const OUT_OF_SCOPE = 'Hors périmètre';

/** Versions proposées : celles des réglages, puis « Hors périmètre ». */
export const versionsOf = (settings: ProjectSettings) => [
  ...settings.versions.filter(v => v !== OUT_OF_SCOPE),
  OUT_OF_SCOPE,
];

/** Acteurs proposés : ceux des réglages, puis ceux déjà saisis dans les US. */
export const actorsOf = (settings: ProjectSettings, stories: { actor: string }[]) =>
  [...new Set([...settings.actors, ...stories.map(s => s.actor)])].filter(Boolean);

/**
 * Périmètres de risque : ceux des réglages, puis ceux déjà présents dans le registre (préfixe tiré
 * de l'identifiant, R12 → R, RG-04 → RG-), pour qu'un import ne perde aucun bouton de création.
 */
export function riskScopesOf(settings: ProjectSettings, risks: { id: string; scope: string }[]) {
  const scopes = [...settings.riskScopes];
  for (const r of risks) {
    const prefix = r.id.match(/^([A-Z]+-?)\d+$/)?.[1];
    if (prefix && r.scope && !scopes.some(s => s.prefix === prefix || s.name === r.scope))
      scopes.push({ name: r.scope, prefix });
  }
  return scopes;
}

/** Le membre voit-il la partie Réalisation ? */
export function canSeeDelivery(
  settings: ProjectSettings,
  member: { role: Role | null; userId: string | null },
  parties: Party[],
) {
  const d = settings.delivery;
  if (!member.role || !d.enabled) return false;
  if (member.role === 'admin') return true;
  const v = d.visibility;
  if (member.userId && v.deny.includes(member.userId)) return false;
  if (member.userId && v.allow.includes(member.userId)) return true;
  if (v.roles.includes(member.role)) return true;
  const orgs = parties
    .filter(p => p.type === 'person' && p.userId && p.userId === member.userId)
    .map(p => p.organization);
  return orgs.some(o => v.organizations.includes(o));
}

// --- Reprise de l'existant ---------------------------------------------------------------

const norm = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();

/** Valeurs d'attente, qui ne désignent personne. */
const PLACEHOLDERS = new Set(['', 'a designer', 'a confirmer', 'a definir', 'tbd', 'nc', '-', '—']);

/** Index nom, sigle et alias → partie. */
export function partyIndex(parties: Party[]) {
  const index = new Map<string, Party>();
  for (const p of parties)
    for (const name of [p.name, p.short, ...p.aliases]) if (norm(name)) index.set(norm(name), p);
  return (text: string) => index.get(norm(text)) ?? null;
}

/**
 * Découpe une mention composée (« Cybastion et Lead Chef de projet », « NTECH SARL, agrégateur »).
 * Un morceau qui commence par un article ou une préposition prolonge le précédent : « Ministère du
 * Tourisme et des Loisirs » reste entier.
 */
export function splitMention(text: string): string[] {
  const tokens = text.split(/(\s*(?:,|;|\/|\+|\bet\b)\s*)/);
  const parts: string[] = [];
  for (let i = 0; i < tokens.length; i += 2) {
    const part = tokens[i].trim();
    if (!part) continue;
    if (parts.length && /^(?:de|du|des|la|le|les)\s|^[ld][’']/i.test(part))
      parts[parts.length - 1] += tokens[i - 1] + part;
    else parts.push(part);
  }
  return parts;
}

/** Où une mention apparaît : « Risque R04 · propriétaire ». */
export interface MentionPlace {
  label: string;
  path: string;
}
export interface Mention {
  text: string;
  places: MentionPlace[];
  party: Party | null;
}

/**
 * Mentions de parties prenantes dans le projet (RACI, risques, diligences, séquences), chacune avec
 * la partie qu'elle désigne, ou aucune. Une mention composée est d'abord cherchée entière, puis
 * morceau par morceau.
 */
export function mentionsOf(
  data: { phases: Phase[]; risks: Risk[]; diligences: Diligence[]; workshops: Workshop[] },
  parties: Party[],
): Mention[] {
  const find = partyIndex(parties);
  const all = new Map<string, Mention>();
  const add = (text: string, place: MentionPlace) => {
    if (PLACEHOLDERS.has(norm(text))) return;
    const pieces = find(text) ? [text] : splitMention(text);
    for (const piece of pieces) {
      if (PLACEHOLDERS.has(norm(piece))) continue;
      const key = norm(piece);
      const m = all.get(key) ?? { text: piece.trim(), places: [], party: find(piece) };
      if (!m.places.some(p => p.label === place.label)) m.places.push(place);
      all.set(key, m);
    }
  };
  for (const p of data.phases)
    for (const a of p.actors) add(a.name, { label: `RACI ${p.id} · acteur`, path: `/raci?phase=${p.id}` });
  for (const r of data.risks) {
    const path = `/risque/${r.id}`;
    add(r.owner, { label: `Risque ${r.id} · propriétaire`, path });
    add(r.actionOwner, { label: `Risque ${r.id} · responsable de l’action`, path });
    add(r.authority, { label: `Risque ${r.id} · autorité`, path });
    for (const a of r.actions) add(a.owner, { label: `Risque ${r.id} · action`, path });
  }
  for (const d of data.diligences) {
    const path = `/diligence/${d.id}`;
    add(d.owner, { label: `Diligence ${d.id} · responsable`, path });
    add(d.partners, { label: `Diligence ${d.id} · associée`, path });
  }
  for (const w of data.workshops)
    for (const s of w.sessions)
      add(s.owner, { label: `Séquence ${s.code} · porteur`, path: `/atelier/${w.id}` });
  return [...all.values()].sort(
    (a, b) => b.places.length - a.places.length || a.text.localeCompare(b.text, 'fr'),
  );
}

/** Noms proposés dans les listes de choix : le référentiel d'abord, puis les autres valeurs déjà saisies. */
export const partyNames = (parties: Party[], others: string[] = []) => {
  const find = partyIndex(parties);
  const known = parties.filter(p => p.name).map(p => p.name);
  const rest = others.map(o => o.trim()).filter(o => o && !find(o) && !PLACEHOLDERS.has(norm(o)));
  return [
    ...new Set([
      ...known.sort((a, b) => a.localeCompare(b, 'fr')),
      ...rest.sort((a, b) => a.localeCompare(b, 'fr')),
    ]),
  ];
};
