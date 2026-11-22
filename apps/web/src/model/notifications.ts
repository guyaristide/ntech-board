import { create } from 'zustand';
import type {
  AppNotification,
  FollowState,
  NotificationFeed,
  NotificationPrefs,
  Person,
} from '@board/shared';
import { api } from './api';

/**
 * Notifications de la personne connectée et annuaire des membres à mentionner. La liste est rechargée
 * à chaque signal du serveur (temps réel), jamais devinée côté navigateur.
 */
interface State {
  items: AppNotification[];
  unread: number;
  people: Person[];
  /** Panneau des notifications ouvert. */
  open: boolean;
  setOpen: (open: boolean) => void;
  load: () => Promise<void>;
  loadPeople: () => Promise<void>;
  read: (what: { all: true } | { ids: string[] } | { target: { kind: string; id: string } }) => Promise<void>;
}

export const useNotifications = create<State>((set, get) => {
  const apply = (feed: NotificationFeed) => set({ items: feed.items, unread: feed.unread });
  return {
    items: [],
    unread: 0,
    people: [],
    open: false,
    setOpen: open => set({ open }),
    load: () => api.get<NotificationFeed>('/notifications').then(apply, () => undefined),
    loadPeople: async () => {
      if (!get().people.length)
        await api.get<Person[]>('/people').then(
          people => set({ people }),
          () => undefined,
        );
    },
    read: what => api.post<NotificationFeed>('/notifications/read', what).then(apply, () => undefined),
  };
});

export const prefs = {
  get: () => api.get<NotificationPrefs>('/notifications/prefs'),
  save: (value: NotificationPrefs) => api.put<NotificationPrefs>('/notifications/prefs', value),
};

export const follow = {
  get: (kind: string, id: string) =>
    api.get<{ state: FollowState }>(`/follow/${kind}/${encodeURIComponent(id)}`).then(r => r.state),
  set: (kind: string, id: string, state: FollowState) =>
    api
      .put<{ state: FollowState }>(`/follow/${kind}/${encodeURIComponent(id)}`, { state })
      .then(r => r.state),
};
