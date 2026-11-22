-- Notifications : une ligne par chose à faire savoir à une personne, dans un projet.
-- Plusieurs événements rapprochés sur le même sujet (group_key) sont regroupés dans la même ligne.
CREATE TABLE notifications (
  id          bigserial PRIMARY KEY,
  project_id  uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type        text NOT NULL,
  target_kind text NOT NULL DEFAULT '',
  target_id   text NOT NULL DEFAULT '',
  group_key   text NOT NULL,
  title       text NOT NULL,
  body        text NOT NULL DEFAULT '',
  path        text NOT NULL DEFAULT '/',
  actor_id    uuid REFERENCES users (id) ON DELETE SET NULL,
  actor_name  text NOT NULL DEFAULT '',
  -- État de départ d'un changement (étape d'un ticket) : un retour à cet état annule la notification.
  data        jsonb NOT NULL DEFAULT '{}',
  count       integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  read_at     timestamptz,
  -- Envois hors de l'application (étapes suivantes : e-mail, notification système).
  emailed_at  timestamptz,
  pushed_at   timestamptz
);
CREATE INDEX notifications_feed_idx ON notifications (project_id, user_id, updated_at DESC);
CREATE INDEX notifications_group_idx ON notifications (project_id, user_id, group_key) WHERE read_at IS NULL;

-- Suivi d'un élément : abonné (prévenu de ce qui s'y passe) ou en sourdine (jamais prévenu).
CREATE TABLE subscriptions (
  project_id  uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  target_kind text NOT NULL,
  target_id   text NOT NULL,
  state       text NOT NULL CHECK (state IN ('following', 'muted')),
  -- Pourquoi la personne suit : author, commenter, assignee, mentioned, manual.
  reason      text NOT NULL DEFAULT 'manual',
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id, target_kind, target_id)
);
CREATE INDEX subscriptions_target_idx ON subscriptions (project_id, target_kind, target_id) WHERE state = 'following';
