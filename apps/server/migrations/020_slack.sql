-- Slack, dans les deux sens. Vers Slack : un webhook entrant par projet (chiffré), les familles
-- d'événements à publier, et une file d'attente qui regroupe les changements en rafale. Depuis Slack :
-- le secret de signature de l'application (chiffré), et les comptes Slack reliés aux membres.
CREATE TABLE slack_integrations (
  project_id      uuid PRIMARY KEY REFERENCES projects (id) ON DELETE CASCADE,
  webhook         text NOT NULL DEFAULT '',
  webhook_hint    text NOT NULL DEFAULT '',
  signing_secret  text NOT NULL DEFAULT '',
  events          text[] NOT NULL DEFAULT '{tickets,sprints,risks,comments}',
  last_error      text NOT NULL DEFAULT '',
  last_sent_at    timestamptz,
  updated_by      text NOT NULL DEFAULT '',
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE slack_outbox (
  id          bigserial PRIMARY KEY,
  project_id  uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  group_key   text NOT NULL,
  payload     jsonb NOT NULL,
  send_after  timestamptz NOT NULL,
  attempts    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, group_key)
);
CREATE INDEX slack_outbox_due_idx ON slack_outbox (send_after);

CREATE TABLE slack_users (
  project_id  uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  team_id     text NOT NULL,
  slack_user  text NOT NULL,
  slack_name  text NOT NULL DEFAULT '',
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  linked_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, team_id, slack_user)
);

CREATE TABLE slack_link_tokens (
  token_hash  text PRIMARY KEY,
  project_id  uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  team_id     text NOT NULL,
  slack_user  text NOT NULL,
  slack_name  text NOT NULL DEFAULT '',
  expires_at  timestamptz NOT NULL
);
