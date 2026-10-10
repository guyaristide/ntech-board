import { create } from 'zustand';
import { nowIso, uid } from './ids';
import { mergeSeed, seedWorkspace } from './seed';
import type { Block, Comment, Epic, Question, Session, Story, Workshop, Workspace } from './types';

export type SaveState = 'loading' | 'saved' | 'saving' | 'error' | 'local';
const API = '/api/workspace';
const LOCAL_KEY = 'cadrage.workspace';
const AUTHOR_KEY = 'cadrage.author';

interface State extends Workspace {
  ready: boolean;
  save: SaveState;
  author: string;
  load: () => Promise<void>;
  setAuthor: (name: string) => void;
  updateStory: (id: string, patch: Partial<Story>) => void;
  createStory: (epic: string, patch?: Partial<Story>) => string;
  deleteStory: (id: string) => void;
  duplicateStory: (id: string) => string | undefined;
  commentStory: (id: string, text: string) => void;
  updateEpic: (id: string, patch: Partial<Epic>) => void;
  updateWorkshop: (id: string, patch: Partial<Workshop>) => void;
  updateSession: (workshop: string, code: string, patch: Partial<Session>) => void;
  updateQuestion: (workshop: string, code: string, questionId: string, patch: Partial<Question>) => void;
  addQuestion: (workshop: string, code: string, text: string) => void;
  commentWorkshop: (id: string, text: string) => void;
  replace: (workspace: Workspace) => void;
  reset: () => void;
}

const snapshot = (s: Workspace): Workspace => ({
  version: 1,
  planning: s.planning,
  references: s.references,
  epics: s.epics,
  stories: s.stories,
  workshops: s.workshops,
});

const readAuthor = () => {
  try {
    return localStorage.getItem(AUTHOR_KEY) ?? '';
  } catch {
    return '';
  }
};

const comment = (author: string, text: string): Comment => ({
  id: uid(),
  author: author || 'Anonyme',
  at: nowIso(),
  text,
});

/** Prochain identifiant libre dans une épique : US-UC01-07. */
const nextStoryId = (stories: Story[], epic: string) => {
  const prefix = `US-${epic}-`;
  const max = stories
    .filter(s => s.id.startsWith(prefix))
    .reduce((m, s) => Math.max(m, Number(s.id.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(max + 1).padStart(2, '0')}`;
};

let loading: Promise<void> | undefined;

export const useWorkspace = create<State>((set, get) => {
  const touchStory = (id: string, fn: (s: Story) => Story) =>
    set(s => ({ stories: s.stories.map(x => (x.id === id ? { ...fn(x), updatedAt: nowIso() } : x)) }));
  const touchWorkshop = (id: string, fn: (w: Workshop) => Workshop) =>
    set(s => ({ workshops: s.workshops.map(w => (w.id === id ? fn(w) : w)) }));

  return {
    ...seedWorkspace(),
    ready: false,
    save: 'loading',
    author: readAuthor(),

    load: async () => {
      // Une seule lecture, même si React monte deux fois l'application en mode strict.
      if (loading) return loading;
      loading = (async () => {
        let data: Workspace | null = null;
        let remote = true;
        try {
          const res = await fetch(API);
          if (res.ok) data = (await res.json()) as Workspace | null;
          else remote = false;
        } catch {
          remote = false;
        }
        if (!remote) {
          try {
            const local = localStorage.getItem(LOCAL_KEY);
            if (local) data = JSON.parse(local) as Workspace;
          } catch {
            /* stockage indisponible : on repart du seed */
          }
        }
        set({ ...(data ? mergeSeed(data) : seedWorkspace()), ready: true, save: remote ? 'saved' : 'local' });
      })();
      return loading;
    },

    setAuthor: name => {
      try {
        localStorage.setItem(AUTHOR_KEY, name);
      } catch {
        /* ignoré */
      }
      set({ author: name });
    },

    updateStory: (id, patch) => touchStory(id, s => ({ ...s, ...patch })),

    createStory: (epic, patch = {}) => {
      const id = nextStoryId(get().stories, epic);
      const at = nowIso();
      const ep = get().epics.find(e => e.id === epic);
      const story: Story = {
        id,
        epic,
        title: '',
        actor: 'Touriste',
        asA: '',
        iWant: '',
        soThat: '',
        acceptance: [],
        scenario: 'nominal',
        source: '',
        version: (['MVP', 'V1', 'V2'].includes(ep?.version ?? '') ? ep?.version : 'MVP') as Story['version'],
        workshop: ep?.workshops[0] ?? '',
        priority: 'Should',
        derived: true,
        status: 'À cadrer',
        body: [],
        comments: [],
        createdAt: at,
        updatedAt: at,
        ...patch,
      };
      set(s => ({ stories: [...s.stories, story] }));
      return id;
    },

    deleteStory: id => set(s => ({ stories: s.stories.filter(x => x.id !== id) })),

    duplicateStory: id => {
      const src = get().stories.find(s => s.id === id);
      if (!src) return undefined;
      return get().createStory(src.epic, {
        ...src,
        id: undefined as never,
        title: `${src.title} (copie)`,
        acceptance: src.acceptance.map(c => ({ ...c, id: uid(), done: false })),
        body: src.body.map(b => ({ ...b, id: uid() })),
        comments: [],
        status: 'À cadrer',
      });
    },

    commentStory: (id, text) =>
      touchStory(id, s => ({ ...s, comments: [...s.comments, comment(get().author, text)] })),

    updateEpic: (id, patch) =>
      set(s => ({ epics: s.epics.map(e => (e.id === id ? { ...e, ...patch } : e)) })),

    updateWorkshop: (id, patch) => touchWorkshop(id, w => ({ ...w, ...patch })),

    updateSession: (workshop, code, patch) =>
      touchWorkshop(workshop, w => ({
        ...w,
        sessions: w.sessions.map(s => (s.code === code ? { ...s, ...patch } : s)),
      })),

    updateQuestion: (workshop, code, questionId, patch) =>
      touchWorkshop(workshop, w => ({
        ...w,
        sessions: w.sessions.map(s =>
          s.code === code
            ? { ...s, questions: s.questions.map(q => (q.id === questionId ? { ...q, ...patch } : q)) }
            : s,
        ),
      })),

    addQuestion: (workshop, code, text) =>
      touchWorkshop(workshop, w => ({
        ...w,
        sessions: w.sessions.map(s =>
          s.code === code
            ? {
                ...s,
                questions: [...s.questions, { id: uid(), text, answer: '', status: 'Ouvert', custom: true }],
              }
            : s,
        ),
      })),

    commentWorkshop: (id, text) =>
      touchWorkshop(id, w => ({ ...w, comments: [...w.comments, comment(get().author, text)] })),

    replace: workspace => set({ ...mergeSeed(workspace) }),

    reset: () => set({ ...seedWorkspace() }),
  };
});

export const emptyBlock = (type: Block['type'] = 'p'): Block => ({ id: uid(), type, text: '' });
export { snapshot };

/** Sauvegarde différée : chaque modification est écrite dans data/workspace.json (ou le navigateur à défaut). */
let timer: ReturnType<typeof setTimeout> | undefined;
useWorkspace.subscribe((state, prev) => {
  if (!state.ready || !prev.ready) return;
  if (
    state.references === prev.references &&
    state.epics === prev.epics &&
    state.stories === prev.stories &&
    state.workshops === prev.workshops
  )
    return;
  clearTimeout(timer);
  useWorkspace.setState({ save: state.save === 'local' ? 'local' : 'saving' });
  timer = setTimeout(async () => {
    const body = JSON.stringify(snapshot(useWorkspace.getState()));
    try {
      localStorage.setItem(LOCAL_KEY, body);
    } catch {
      /* quota ou stockage bloqué */
    }
    if (useWorkspace.getState().save === 'local') return;
    try {
      const res = await fetch(API, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body });
      useWorkspace.setState({ save: res.ok ? 'saved' : 'error' });
    } catch {
      useWorkspace.setState({ save: 'error' });
    }
  }, 500);
});
