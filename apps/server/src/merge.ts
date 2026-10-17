import { randomUUID } from 'node:crypto';
import {
  LINK_INVERSE,
  normalizePvStatus,
  putLink,
  sameTarget,
  withStoryDefaults,
  type Epic,
  type StoryLink,
  type Target,
  type Question,
  type Session,
  type Story,
  type Workshop,
} from '@board/shared';
import type { RawPlanning, RawWorkshop } from './importers/planning';

/**
 * Règles d'import, sans base de données (testées dans test/merge.test.ts).
 * Principe : un nouvel import n'efface jamais ce qui a été saisi dans l'outil.
 */
export type RawStory = Omit<
  Story,
  | 'acceptance'
  | 'status'
  | 'body'
  | 'comments'
  | 'createdAt'
  | 'updatedAt'
  | 'description'
  | 'targets'
  | 'links'
> & {
  acceptance: string[];
} & Partial<Pick<Story, 'description' | 'targets' | 'links'>>;
export type RawEpic = Omit<Epic, 'body'>;
export interface RawStories {
  epics: RawEpic[];
  stories: RawStory[];
}

export const uid = () => randomUUID().slice(0, 8);

export const storyFromRaw = (s: RawStory, at: string): Story => ({
  description: '',
  targets: [],
  links: [],
  ...s,
  derived: !!s.derived,
  acceptance: s.acceptance.map(text => ({ id: uid(), text, done: false })),
  status: s.version === 'Hors périmètre' ? 'Écartée' : 'À cadrer',
  body: [],
  comments: [],
  createdAt: at,
  updatedAt: at,
});

export const workshopFromRaw = (w: RawWorkshop): Workshop => ({
  ...w,
  pvStatus: normalizePvStatus(w.pvStatus),
  sessions: w.sessions.map(s => ({
    ...s,
    questions: s.questions.map(text => ({ id: uid(), text, answer: '', status: 'Ouvert' as const })),
    notes: [],
  })),
  notes: [],
  comments: [],
});

const norm = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Reporte réponses, points ajoutés à la main et notes de séance sur la nouvelle version d'une séquence. */
export function carrySession(next: Session, prev: Session | undefined): Session {
  if (!prev) return next;
  const known = new Map(prev.questions.map(q => [norm(q.text), q]));
  const questions: Question[] = next.questions.map(q => {
    const old = known.get(norm(q.text));
    return old ? { ...q, id: old.id, answer: old.answer, status: old.status } : q;
  });
  const fresh = new Set(next.questions.map(q => norm(q.text)));
  const kept = prev.questions.filter(
    q => !fresh.has(norm(q.text)) && (q.custom || q.answer || q.status !== 'Ouvert'),
  );
  return { ...next, questions: [...questions, ...kept], notes: prev.notes };
}

const enriched = (w: Workshop) =>
  w.notes.length > 0 ||
  w.comments.length > 0 ||
  w.sessions.some(s => s.notes.length || s.questions.some(q => q.answer || q.custom));

/**
 * Nouveau programme à partir du planning importé et de l'existant : structure reprise du classeur,
 * enrichissements conservés quand l'atelier (ou la séquence) garde son intitulé ; un atelier enrichi
 * qui disparaît est gardé sous « ancien-Jx ».
 */
export function mergePlanning(previous: Workshop[], planning: RawPlanning) {
  const prevSessions = new Map(previous.flatMap(w => w.sessions.map(s => [norm(s.title), s] as const)));
  const workshops = planning.workshops.map(workshopFromRaw).map(w => {
    const prev = previous.find(p => p.id === w.id && norm(p.title) === norm(w.title));
    return {
      ...w,
      notes: prev?.notes ?? [],
      comments: prev?.comments ?? [],
      pvStatus: prev?.pvStatus ?? w.pvStatus,
      sessions: w.sessions.map(s =>
        carrySession(s, prev?.sessions.find(p => p.code === s.code) ?? prevSessions.get(norm(s.title))),
      ),
    };
  });
  const orphaned = previous
    .filter(p => !p.id.startsWith('ancien-'))
    .filter(p => !workshops.some(w => w.id === p.id && norm(w.title) === norm(p.title)))
    .filter(enriched)
    .map(p => ({ ...p, id: `ancien-${p.id}`, phase: 'Ancienne version du planning' }));
  const archived = previous.filter(p => p.id.startsWith('ancien-') && !orphaned.some(o => o.id === p.id));
  return { workshops: [...workshops, ...orphaned, ...archived], orphaned: orphaned.length };
}

/** Complément d'une US apporté par un fichier de cadrage (description, plateformes, liaisons). */
export interface StoryEnrichment {
  id: string;
  description?: string;
  targets?: Target[];
  links?: StoryLink[];
}

/**
 * Applique un complément sans rien écraser : la description et les plateformes ne sont posées que
 * si l'US n'en a pas encore ; les liaisons s'ajoutent à celles qui existent (celle déjà posée sur un
 * couple d'US est gardée). Renvoie null si rien ne change.
 */
export function enrichStory(current: Story, e: StoryEnrichment): Story | null {
  const s = withStoryDefaults(current);
  const description = !s.description.trim() && e.description?.trim() ? e.description.trim() : s.description;
  const targets = !s.targets.length && e.targets?.length ? dedupeTargets(e.targets) : s.targets;
  const links = (e.links ?? [])
    .filter(l => l.story !== s.id && !s.links.some(x => x.story === l.story))
    .reduce(putLink, s.links);
  const changed = description !== s.description || targets !== s.targets || links.length !== s.links.length;
  return changed ? { ...s, description, targets, links } : null;
}

const dedupeTargets = (targets: Target[]) =>
  targets.filter((t, i) => targets.findIndex(x => sameTarget(x, t)) === i);

/**
 * Liaisons d'un fichier de cadrage, rendues symétriques : chaque liaison A → B ajoute B → A avec
 * le type inverse, sauf si le fichier en décrit déjà une pour ce couple.
 */
export function symmetricLinks(items: StoryEnrichment[]): Map<string, StoryLink[]> {
  const out = new Map<string, StoryLink[]>();
  const add = (from: string, link: StoryLink) => {
    const list = out.get(from) ?? [];
    if (!list.some(l => l.story === link.story)) out.set(from, [...list, link]);
  };
  for (const e of items) for (const l of e.links ?? []) add(e.id, l);
  for (const e of items)
    for (const l of e.links ?? []) add(l.story, { story: e.id, type: LINK_INVERSE[l.type] });
  return out;
}
