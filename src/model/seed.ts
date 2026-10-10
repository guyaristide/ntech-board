import storiesSeed from '../../data/seed/stories.json';
import workshopsSeed from '../../data/seed/workshops.json';
import { uid } from './ids';
import type { AgendaItem, Epic, Question, Reference, Session, Story, Workshop, Workspace } from './types';

type RawStory = Omit<Story, 'acceptance' | 'status' | 'body' | 'comments' | 'createdAt' | 'updatedAt'> & {
  acceptance: string[];
};
type RawEpic = Omit<Epic, 'body'>;
type RawSession = Omit<Session, 'questions' | 'notes'> & { questions: string[] };
type RawWorkshop = Omit<Workshop, 'sessions' | 'notes' | 'comments' | 'pvStatus'> & {
  sessions: RawSession[];
  pvStatus?: string;
};
type RawPlanning = { source: string; references: Reference[]; workshops: RawWorkshop[] };

const SEED_DATE = '2026-10-10T08:00:00.000Z';

export const seedStory = (s: RawStory): Story => ({
  ...s,
  acceptance: s.acceptance.map(text => ({ id: uid(), text, done: false })),
  status: s.version === 'Hors périmètre' ? 'Écartée' : 'À cadrer',
  body: [],
  comments: [],
  createdAt: SEED_DATE,
  updatedAt: SEED_DATE,
});

const seedWorkshop = (w: RawWorkshop): Workshop => ({
  ...w,
  date: w.date ?? null,
  pvDue: w.pvDue ?? null,
  deliverableDue: w.deliverableDue ?? null,
  validationDue: w.validationDue ?? null,
  pvStatus: (w.pvStatus || 'À faire') as Workshop['pvStatus'],
  prep: w.prep ?? [],
  agenda: w.agenda as AgendaItem[],
  sessions: w.sessions.map(s => ({
    ...s,
    questions: s.questions.map(text => ({ id: uid(), text, answer: '', status: 'Ouvert' as const })),
    notes: [],
  })),
  notes: [],
  comments: [],
});

export function seedWorkspace(): Workspace {
  const raw = storiesSeed as unknown as { epics: RawEpic[]; stories: RawStory[] };
  const planning = workshopsSeed as unknown as RawPlanning;
  return {
    version: 1,
    planning: planning.source,
    references: planning.references ?? [],
    epics: raw.epics.map(e => ({ ...e, body: [] })),
    stories: raw.stories.map(seedStory),
    workshops: planning.workshops.map(seedWorkshop),
  };
}

const norm = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Reporte les enrichissements d'une séquence sur sa nouvelle version : réponses aux points
 * reconnus par leur texte, points ajoutés à la main, notes de séance.
 */
function carrySession(next: Session, prev: Session | undefined): Session {
  if (!prev) return next;
  const answered = new Map(prev.questions.map(q => [norm(q.text), q]));
  const questions: Question[] = next.questions.map(q => {
    const old = answered.get(norm(q.text));
    return old ? { ...q, id: old.id, answer: old.answer, status: old.status } : q;
  });
  const known = new Set(next.questions.map(q => norm(q.text)));
  // Un point retiré du planning n'est gardé que s'il a été ajouté à la main ou déjà traité.
  const kept = prev.questions.filter(
    q => !known.has(norm(q.text)) && (q.custom || q.answer || q.status !== 'Ouvert'),
  );
  return { ...next, questions: [...questions, ...kept], notes: prev.notes };
}

/**
 * Met à jour un espace existant avec le contenu d'origine (seed) sans perdre ce qui a été saisi :
 * - programme : structure reprise du planning ; notes, commentaires, statut du PV et réponses conservés
 *   quand l'atelier ou la séquence porte le même intitulé ;
 * - US et épiques jamais modifiées : remplacées par la version du seed ; les autres sont conservées ;
 * - éléments nouveaux du seed ajoutés.
 */
export function mergeSeed(current: Workspace): Workspace {
  const seed = seedWorkspace();
  const prevWorkshops = current.workshops ?? [];
  const prevSessions = new Map(prevWorkshops.flatMap(w => w.sessions.map(s => [norm(s.title), s] as const)));
  const workshops = seed.workshops.map(w => {
    const prev = prevWorkshops.find(p => p.id === w.id && norm(p.title) === norm(w.title));
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
  // Ateliers disparus du planning mais enrichis : conservés à part pour ne rien perdre.
  const orphaned = prevWorkshops
    .filter(p => !workshops.some(w => w.id === p.id && norm(w.title) === norm(p.title)))
    .filter(
      p =>
        p.notes.length ||
        p.comments.length ||
        p.sessions.some(s => s.notes.length || s.questions.some(q => q.answer)),
    )
    .map(p => ({ ...p, id: `ancien-${p.id}`, phase: 'Ancienne version du planning' }))
    .filter(p => !workshops.some(w => w.id === p.id));

  const seedStories = new Map(seed.stories.map(s => [s.id, s]));
  const stories = current.stories.map(s =>
    s.updatedAt === s.createdAt && seedStories.has(s.id) ? seedStories.get(s.id)! : s,
  );
  const ids = new Set(stories.map(s => s.id));
  const seedEpics = new Map(seed.epics.map(e => [e.id, e]));
  const epics = current.epics.map(e => (seedEpics.has(e.id) ? { ...seedEpics.get(e.id)!, body: e.body } : e));
  const epicIds = new Set(epics.map(e => e.id));

  return {
    version: 1,
    planning: seed.planning,
    references: seed.references,
    epics: [...epics, ...seed.epics.filter(e => !epicIds.has(e.id))],
    stories: [...stories, ...seed.stories.filter(s => !ids.has(s.id))],
    workshops: [...workshops, ...orphaned],
  };
}
