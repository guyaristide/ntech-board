-- NTECH Board : schéma initial.
-- Un projet = un tableau (etourisme-board, pfo-board…). Toutes les données métier portent project_id.

CREATE TABLE projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  title       text NOT NULL,
  subtitle    text NOT NULL DEFAULT '',
  planning    text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          text NOT NULL,
  name           text NOT NULL DEFAULT '',
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_login_at  timestamptz
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));

CREATE TABLE memberships (
  project_id  uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
  invited_at  timestamptz NOT NULL DEFAULT now(),
  invited_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  PRIMARY KEY (project_id, user_id)
);

-- Liens de connexion envoyés par e-mail : seul le hash SHA-256 du jeton est conservé.
CREATE TABLE login_tokens (
  token_hash  text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);
CREATE INDEX login_tokens_user_idx ON login_tokens (user_id, created_at);

CREATE TABLE sessions (
  id_hash       text PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  project_id    uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

-- Contenu des tableaux : US, épiques, ateliers et fiches du cahier des charges, en JSONB.
-- revision = 0 tant que personne ne l'a modifié : un nouvel import peut alors le remplacer.
CREATE TABLE entities (
  project_id  uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('story', 'epic', 'workshop', 'reference')),
  id          text NOT NULL,
  data        jsonb NOT NULL,
  position    integer NOT NULL DEFAULT 0,
  revision    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  PRIMARY KEY (project_id, kind, id)
);
CREATE INDEX entities_order_idx ON entities (project_id, kind, position);

-- Journal des modifications (qui, quoi, quand) : historique et audit.
CREATE TABLE events (
  id          bigserial PRIMARY KEY,
  project_id  uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  kind        text NOT NULL,
  entity_id   text NOT NULL,
  action      text NOT NULL,
  patch       jsonb,
  user_id     uuid REFERENCES users (id) ON DELETE SET NULL,
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX events_entity_idx ON events (project_id, kind, entity_id, at DESC);
