import storiesSeed from '../../data/seed/stories.json';
import workshopsSeed from '../../data/seed/workshops.json';
import { uid } from './ids';
import type { AgendaItem, Epic, Story, Workshop, Workspace } from './types';

type RawStory = Omit<Story, 'acceptance' | 'status' | 'body' | 'comments' | 'createdAt' | 'updatedAt'> & {
  acceptance: string[];
};
type RawEpic = Omit<Epic, 'body'>;
type RawSession = Omit<Workshop['sessions'][number], 'questions' | 'notes'> & { questions: string[] };
type RawWorkshop = Omit<Workshop, 'sessions' | 'notes' | 'comments' | 'pvStatus'> & {
  sessions: RawSession[];
  pvStatus?: string;
};

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
  return {
    version: 1,
    epics: raw.epics.map(e => ({ ...e, body: [] })),
    stories: raw.stories.map(seedStory),
    workshops: (workshopsSeed as unknown as { workshops: RawWorkshop[] }).workshops.map(seedWorkshop),
  };
}

/** Ajoute à un espace existant les éléments nouveaux du seed, sans toucher aux contenus enrichis. */
export function mergeSeed(current: Workspace): Workspace {
  const seed = seedWorkspace();
  const missing = <T extends { id: string }>(mine: T[], theirs: T[]) => {
    const ids = new Set(mine.map(x => x.id));
    return [...mine, ...theirs.filter(x => !ids.has(x.id))];
  };
  return {
    ...current,
    epics: missing(current.epics, seed.epics),
    stories: missing(current.stories, seed.stories),
    workshops: missing(current.workshops, seed.workshops),
  };
}
