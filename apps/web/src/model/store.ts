import { create } from 'zustand';
import { canSeeDelivery, withSettingsDefaults, withStoryDefaults, withTicketDefaults } from '@board/shared';
import { EMPTY, KEY, normalize } from './entities';
import type {
  Comment,
  Diligence,
  Epic,
  EntityKind,
  Phase as ProjectPhase,
  PresenceEntry,
  Question,
  RaciRow,
  Risk,
  RiskAction,
  ServerEvent,
  Session,
  SessionInfo,
  Story,
  LinkType,
  Party,
  PartyType,
  ProjectSettings,
  Workshop,
  WorkspaceData,
} from '@board/shared';
import { api, ApiError, clientId } from './api';

export type Phase = 'loading' | 'login' | 'ready' | 'notfound' | 'error';
export type SaveState = 'saved' | 'saving' | 'error' | 'offline';

interface State extends WorkspaceData {
  phase: Phase;
  session: SessionInfo | null;
  save: SaveState;
  presence: PresenceEntry[];
  init: () => Promise<void>;
  load: () => Promise<void>;
  logout: () => Promise<void>;
  rename: (name: string) => Promise<void>;
  updateStory: (id: string, patch: Partial<Story>) => void;
  createStory: (epic: string, patch?: Partial<Story>) => Promise<string>;
  deleteStory: (id: string) => Promise<void>;
  duplicateStory: (id: string) => Promise<string>;
  commentStory: (id: string, text: string) => Promise<void>;
  updateEpic: (id: string, patch: Pick<Epic, 'body'>) => void;
  updateWorkshop: (id: string, patch: Partial<Pick<Workshop, 'notes' | 'pvStatus'>>) => void;
  updateSession: (workshop: string, code: string, patch: Pick<Session, 'notes'>) => void;
  updateQuestion: (workshop: string, code: string, questionId: string, patch: Partial<Question>) => void;
  addQuestion: (workshop: string, code: string, text: string) => Promise<void>;
  commentWorkshop: (id: string, text: string) => Promise<void>;
  createPhase: (title: string, copyFrom?: string) => Promise<string>;
  updatePhase: (id: string, patch: Partial<Omit<ProjectPhase, 'id' | 'raci' | 'comments'>>) => void;
  deletePhase: (id: string) => Promise<void>;
  addRaciRow: (phase: string, after?: string) => Promise<void>;
  updateRaciRow: (phase: string, row: string, patch: Partial<RaciRow>) => void;
  deleteRaciRow: (phase: string, row: string) => Promise<void>;
  commentPhase: (id: string, text: string) => Promise<void>;
  createRisk: (prefix: 'R' | 'RG-') => Promise<string>;
  updateRisk: (id: string, patch: Partial<Omit<Risk, 'id' | 'actions' | 'reviews' | 'comments'>>) => void;
  deleteRisk: (id: string) => Promise<void>;
  reviewRisk: (id: string, phase: string, comment: string) => Promise<void>;
  addRiskAction: (id: string) => Promise<void>;
  updateRiskAction: (id: string, action: string, patch: Partial<RiskAction>) => void;
  deleteRiskAction: (id: string, action: string) => Promise<void>;
  commentRisk: (id: string, text: string) => Promise<void>;
  linkStories: (id: string, other: string, type: LinkType) => Promise<void>;
  unlinkStories: (id: string, other: string) => Promise<void>;
  createDiligence: (patch?: Partial<Diligence>) => Promise<string>;
  updateDiligence: (id: string, patch: Partial<Omit<Diligence, 'id' | 'comments'>>) => void;
  deleteDiligence: (id: string) => Promise<void>;
  commentDiligence: (id: string, text: string) => Promise<void>;
  createParty: (type: PartyType, patch?: Partial<Party>) => Promise<string>;
  updateParty: (id: string, patch: Partial<Omit<Party, 'id' | 'type'>>) => void;
  deleteParty: (id: string) => Promise<void>;
  updateSettings: (patch: Partial<ProjectSettings>) => Promise<void>;
}

/**
 * Écritures différées : les frappes successives sur un même champ sont regroupées (400 ms)
 * puis envoyées en un seul PATCH. Tant qu'une écriture est en attente ou en vol pour une entité,
 * les mises à jour reçues des autres sont ignorées pour elle ; la réponse du serveur, qui
 * fusionne les champs, les réintègre ensuite.
 */
const queue = new Map<
  string,
  {
    entity: string;
    payload: Record<string, unknown>;
    send: (p: Record<string, unknown>) => Promise<unknown>;
    timer: ReturnType<typeof setTimeout>;
  }
>();
const inflight = new Map<string, number>();
const busy = (entity: string) =>
  (inflight.get(entity) ?? 0) > 0 || [...queue.values()].some(q => q.entity === entity);

/** Outils d'écriture du store, pour les actions définies à part (model/delivery.ts). */
export let ops: {
  send: <T>(kind: EntityKind, id: string, call: () => Promise<T>) => Promise<T>;
  defer: (
    key: string,
    kind: EntityKind,
    id: string,
    payload: Record<string, unknown>,
    call: (p: Record<string, unknown>) => Promise<unknown>,
  ) => void;
  replace: (kind: EntityKind, id: string, received: unknown | null) => void;
  local: (kind: EntityKind, id: string, change: (x: never) => unknown) => void;
};

export const useWorkspace = create<State>((set, get) => {
  const replace = <K extends EntityKind>(kind: K, id: string, received: unknown | null) =>
    set(s => {
      const data = normalize(kind, received);
      const list = s[KEY[kind]] as { id: string }[];
      if (data === null) return { [KEY[kind]]: list.filter(x => x.id !== id) } as Partial<State>;
      const exists = list.some(x => x.id === id);
      return {
        [KEY[kind]]: exists ? list.map(x => (x.id === id ? data : x)) : [...list, data],
      } as Partial<State>;
    });

  const local = <K extends EntityKind>(kind: K, id: string, change: (x: never) => unknown) =>
    set(
      s =>
        ({
          [KEY[kind]]: (s[KEY[kind]] as { id: string }[]).map(x => (x.id === id ? change(x as never) : x)),
        }) as Partial<State>,
    );

  const settle = () => {
    if (get().save === 'error') return;
    set({ save: queue.size || [...inflight.values()].some(n => n > 0) ? 'saving' : 'saved' });
  };

  const failed = (e: unknown) => {
    if (e instanceof ApiError && e.status === 401) set({ phase: 'login' });
    set({ save: e instanceof TypeError ? 'offline' : 'error' });
  };

  /** Envoie une écriture et remplace l'entité par la version du serveur si rien d'autre n'est en attente. */
  const send = async <T>(kind: EntityKind, id: string, call: () => Promise<T>): Promise<T> => {
    const entity = `${kind}:${id}`;
    inflight.set(entity, (inflight.get(entity) ?? 0) + 1);
    set({ save: 'saving' });
    try {
      const result = await call();
      inflight.set(entity, (inflight.get(entity) ?? 1) - 1);
      if (!busy(entity) && result && typeof result === 'object' && 'id' in result) replace(kind, id, result);
      if (get().save === 'error' || get().save === 'offline') set({ save: 'saved' });
      settle();
      return result;
    } catch (e) {
      inflight.set(entity, (inflight.get(entity) ?? 1) - 1);
      failed(e);
      throw e;
    }
  };

  const defer = (
    key: string,
    kind: EntityKind,
    id: string,
    payload: Record<string, unknown>,
    call: (p: Record<string, unknown>) => Promise<unknown>,
  ) => {
    const entity = `${kind}:${id}`;
    const prev = queue.get(key);
    if (prev) clearTimeout(prev.timer);
    const merged = { ...prev?.payload, ...payload };
    const timer = setTimeout(() => {
      queue.delete(key);
      void send(kind, id, () => call(merged)).catch(() => undefined);
    }, 400);
    queue.set(key, { entity, payload: merged, send: call, timer });
    set({ save: 'saving' });
  };

  let events: EventSource | null = null;
  const connect = () => {
    events?.close();
    let first = true;
    events = new EventSource(`/api/events?client=${clientId}`);
    events.addEventListener('ready', () => {
      // Après une coupure, on recharge pour rattraper ce qui a changé entre-temps.
      if (!first) void get().load();
      first = false;
      if (get().save === 'offline') set({ save: 'saved' });
    });
    events.onmessage = msg => {
      const event = JSON.parse(msg.data) as ServerEvent;
      if (event.type === 'presence') set({ presence: event.users });
      else if (event.type === 'reload') void get().load();
      else if (!busy(`${event.kind}:${event.id}`)) replace(event.kind, event.id, event.data);
    };
    events.onerror = () => {
      if (events?.readyState === EventSource.CLOSED) setTimeout(connect, 3000);
    };
  };

  const comment = (author: string, text: string): Comment => ({
    id: 'local',
    author,
    at: new Date().toISOString(),
    text,
  });
  const me = () => get().session?.user?.name || get().session?.user?.email || '';
  const onSession = (w: Workshop, code: string, change: (s: Session) => Session): Workshop => ({
    ...w,
    sessions: w.sessions.map(s => (s.code === code ? change(s) : s)),
  });

  ops = { send, defer, replace, local };

  return {
    ...EMPTY,
    phase: 'loading',
    session: null,
    save: 'saved',
    presence: [],

    init: async () => {
      try {
        const session = await api.get<SessionInfo>('/session');
        set({ session });
        if (!session.user) return set({ phase: 'login' });
        await get().load();
        connect();
        set({ phase: 'ready' });
      } catch (e) {
        set({ phase: e instanceof ApiError && e.code === 'project_not_found' ? 'notfound' : 'error' });
      }
    },

    load: async () => {
      try {
        const data = await api.get<WorkspaceData>('/workspace');
        // Un serveur pas encore mis à jour ne renvoie pas les diligences ni les parties prenantes.
        set({
          ...data,
          stories: data.stories.map(withStoryDefaults),
          diligences: data.diligences ?? [],
          parties: data.parties ?? [],
          releases: data.releases ?? [],
          sprints: data.sprints ?? [],
          tickets: (data.tickets ?? []).map(withTicketDefaults),
          campaigns: data.campaigns ?? [],
          settings: withSettingsDefaults(data.settings),
        });
      } catch (e) {
        failed(e);
      }
    },

    logout: async () => {
      await api.post('/auth/logout');
      events?.close();
      set({ ...EMPTY, phase: 'login', session: { ...get().session!, user: null, role: null } });
    },

    rename: async name => {
      const user = await api.patch<SessionInfo['user']>('/me', { name });
      set(s => ({ session: s.session ? { ...s.session, user } : s.session }));
    },

    updateStory: (id, patch) => {
      local('story', id, (s: Story) => ({ ...s, ...patch, updatedAt: new Date().toISOString() }));
      defer(`story:${id}`, 'story', id, patch, p => api.patch(`/stories/${id}`, p));
    },

    createStory: async (epic, patch) => {
      const story = await send('story', 'new', () => api.post<Story>('/stories', { epic, patch }));
      replace('story', story.id, story);
      return story.id;
    },

    deleteStory: async id => {
      await send('story', id, () => api.delete(`/stories/${id}`));
      replace('story', id, null);
    },

    duplicateStory: async id => {
      const story = await send('story', 'new', () => api.post<Story>(`/stories/${id}/duplicate`));
      replace('story', story.id, story);
      return story.id;
    },

    commentStory: async (id, text) => {
      local('story', id, (s: Story) => ({ ...s, comments: [...s.comments, comment(me(), text)] }));
      await send('story', id, () => api.post<Story>(`/stories/${id}/comments`, { text }));
    },

    updateEpic: (id, patch) => {
      local('epic', id, (e: Epic) => ({ ...e, ...patch }));
      defer(`epic:${id}`, 'epic', id, patch, p => api.patch(`/epics/${id}`, p));
    },

    updateWorkshop: (id, patch) => {
      local('workshop', id, (w: Workshop) => ({ ...w, ...patch }));
      defer(`workshop:${id}`, 'workshop', id, patch, p => api.patch(`/workshops/${id}`, p));
    },

    updateSession: (workshop, code, patch) => {
      local('workshop', workshop, (w: Workshop) => onSession(w, code, s => ({ ...s, ...patch })));
      defer(`session:${workshop}:${code}`, 'workshop', workshop, patch, p =>
        api.patch(`/workshops/${workshop}/sessions/${encodeURIComponent(code)}`, p),
      );
    },

    updateQuestion: (workshop, code, questionId, patch) => {
      local('workshop', workshop, (w: Workshop) =>
        onSession(w, code, s => ({
          ...s,
          questions: s.questions.map(q => (q.id === questionId ? { ...q, ...patch } : q)),
        })),
      );
      defer(`question:${workshop}:${code}:${questionId}`, 'workshop', workshop, patch, p =>
        api.patch(`/workshops/${workshop}/sessions/${encodeURIComponent(code)}/questions/${questionId}`, p),
      );
    },

    addQuestion: async (workshop, code, text) => {
      await send('workshop', workshop, () =>
        api.post<Workshop>(`/workshops/${workshop}/sessions/${encodeURIComponent(code)}/questions`, { text }),
      );
    },

    commentWorkshop: async (id, text) => {
      local('workshop', id, (w: Workshop) => ({ ...w, comments: [...w.comments, comment(me(), text)] }));
      await send('workshop', id, () => api.post<Workshop>(`/workshops/${id}/comments`, { text }));
    },

    createPhase: async (title, copyFrom) => {
      const phase = await send('phase', 'new', () => api.post<ProjectPhase>('/phases', { title, copyFrom }));
      replace('phase', phase.id, phase);
      return phase.id;
    },

    updatePhase: (id, patch) => {
      local('phase', id, (p: ProjectPhase) => ({ ...p, ...patch }));
      defer(`phase:${id}`, 'phase', id, patch, p => api.patch(`/phases/${id}`, p));
    },

    deletePhase: async id => {
      await send('phase', id, () => api.delete(`/phases/${id}`));
      replace('phase', id, null);
    },

    addRaciRow: async (phase, after) => {
      await send('phase', phase, () => api.post<ProjectPhase>(`/phases/${phase}/raci`, { after }));
    },

    updateRaciRow: (phase, row, patch) => {
      local('phase', phase, (p: ProjectPhase) => ({
        ...p,
        raci: p.raci.map(r => (r.id === row ? { ...r, ...patch, cells: { ...r.cells, ...patch.cells } } : r)),
      }));
      // Les cellules d'une ligne sont regroupées : plusieurs clics partent en un seul envoi.
      const prev = queue.get(`raci:${phase}:${row}`)?.payload.cells as RaciRow['cells'] | undefined;
      const payload = patch.cells ? { ...patch, cells: { ...prev, ...patch.cells } } : patch;
      defer(`raci:${phase}:${row}`, 'phase', phase, payload, p =>
        api.patch(`/phases/${phase}/raci/${row}`, p),
      );
    },

    deleteRaciRow: async (phase, row) => {
      local('phase', phase, (p: ProjectPhase) => ({ ...p, raci: p.raci.filter(r => r.id !== row) }));
      await send('phase', phase, () => api.delete<ProjectPhase>(`/phases/${phase}/raci/${row}`));
    },

    commentPhase: async (id, text) => {
      local('phase', id, (p: ProjectPhase) => ({ ...p, comments: [...p.comments, comment(me(), text)] }));
      await send('phase', id, () => api.post<ProjectPhase>(`/phases/${id}/comments`, { text }));
    },

    createRisk: async prefix => {
      const risk = await send('risk', 'new', () => api.post<Risk>('/risks', { prefix }));
      replace('risk', risk.id, risk);
      return risk.id;
    },

    updateRisk: (id, patch) => {
      local('risk', id, (r: Risk) => ({ ...r, ...patch }));
      defer(`risk:${id}`, 'risk', id, patch, p => api.patch(`/risks/${id}`, p));
    },

    deleteRisk: async id => {
      await send('risk', id, () => api.delete(`/risks/${id}`));
      replace('risk', id, null);
    },

    reviewRisk: async (id, phase, text) => {
      await send('risk', id, () => api.post<Risk>(`/risks/${id}/reviews`, { phase, comment: text }));
    },

    addRiskAction: async id => {
      await send('risk', id, () => api.post<Risk>(`/risks/${id}/actions`, {}));
    },

    updateRiskAction: (id, action, patch) => {
      local('risk', id, (r: Risk) => ({
        ...r,
        actions: r.actions.map(a => (a.id === action ? { ...a, ...patch } : a)),
      }));
      defer(`risk-action:${id}:${action}`, 'risk', id, patch, p =>
        api.patch(`/risks/${id}/actions/${action}`, p),
      );
    },

    deleteRiskAction: async (id, action) => {
      local('risk', id, (r: Risk) => ({ ...r, actions: r.actions.filter(a => a.id !== action) }));
      await send('risk', id, () => api.delete<Risk>(`/risks/${id}/actions/${action}`));
    },

    commentRisk: async (id, text) => {
      local('risk', id, (r: Risk) => ({ ...r, comments: [...r.comments, comment(me(), text)] }));
      await send('risk', id, () => api.post<Risk>(`/risks/${id}/comments`, { text }));
    },

    // L'autre US reçoit la liaison inverse par le flux temps réel, comme chez les autres membres.
    linkStories: async (id, other, type) => {
      await send('story', id, () => api.post<Story>(`/stories/${id}/links`, { story: other, type }));
    },

    unlinkStories: async (id, other) => {
      local('story', id, (s: Story) => ({ ...s, links: s.links.filter(l => l.story !== other) }));
      await send('story', id, () => api.delete<Story>(`/stories/${id}/links/${other}`));
    },

    createDiligence: async patch => {
      const d = await send('diligence', 'new', () => api.post<Diligence>('/diligences', { patch }));
      replace('diligence', d.id, d);
      return d.id;
    },

    updateDiligence: (id, patch) => {
      local('diligence', id, (d: Diligence) => ({ ...d, ...patch }));
      defer(`diligence:${id}`, 'diligence', id, patch, p => api.patch(`/diligences/${id}`, p));
    },

    deleteDiligence: async id => {
      await send('diligence', id, () => api.delete(`/diligences/${id}`));
      replace('diligence', id, null);
    },

    commentDiligence: async (id, text) => {
      local('diligence', id, (d: Diligence) => ({ ...d, comments: [...d.comments, comment(me(), text)] }));
      await send('diligence', id, () => api.post<Diligence>(`/diligences/${id}/comments`, { text }));
    },

    createParty: async (type, patch) => {
      const p = await send('party', 'new', () => api.post<Party>('/parties', { type, patch }));
      replace('party', p.id, p);
      return p.id;
    },

    updateParty: (id, patch) => {
      local('party', id, (p: Party) => ({ ...p, ...patch }));
      defer(`party:${id}`, 'party', id, patch, p => api.patch(`/parties/${id}`, p));
    },

    deleteParty: async id => {
      await send('party', id, () => api.delete(`/parties/${id}`));
      replace('party', id, null);
    },

    // Les autres navigateurs rechargent le tableau à réception des nouveaux réglages.
    updateSettings: async patch => {
      set({ save: 'saving' });
      try {
        set({ settings: await api.patch<ProjectSettings>('/settings', patch), save: 'saved' });
      } catch (e) {
        failed(e);
        throw e;
      }
    },
  };
});

/** Vrai si l'utilisateur peut modifier (éditeur ou administrateur). */
export const useCanEdit = () =>
  useWorkspace(s => s.session?.role === 'editor' || s.session?.role === 'admin');
export const useIsAdmin = () => useWorkspace(s => s.session?.role === 'admin');
/** Vrai si l'utilisateur voit la partie Réalisation, selon les réglages du projet. */
export const useSeesDelivery = () =>
  useWorkspace(s =>
    canSeeDelivery(s.settings, { role: s.session?.role ?? null, userId: s.session?.user?.id ?? null }, s.parties),
  );

// Écritures en attente : envoyées immédiatement si l'onglet se ferme.
window.addEventListener('pagehide', () => {
  for (const [key, q] of queue) {
    clearTimeout(q.timer);
    queue.delete(key);
    void q.send(q.payload);
  }
});
