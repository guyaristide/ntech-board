import { randomUUID } from 'node:crypto';
import {
  normalizePvStatus,
  type Epic,
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
  'acceptance' | 'status' | 'body' | 'comments' | 'createdAt' | 'updatedAt'
> & {
  acceptance: string[];
};
export type RawEpic = Omit<Epic, 'body'>;
export interface RawStories {
  epics: RawEpic[];
  stories: RawStory[];
}

export const uid = () => randomUUID().slice(0, 8);

export const storyFromRaw = (s: RawStory, at: string): Story => ({
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
