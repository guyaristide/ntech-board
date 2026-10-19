-- Jetons personnels d'accès (serveur MCP, scripts) : un jeton vaut son membre sur un projet,
-- avec son rôle, sans jamais les pouvoirs de super-administrateur. Seul le hash SHA-256 est conservé.
CREATE TABLE api_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name          text NOT NULL,
  token_hash    text NOT NULL UNIQUE,
  prefix        text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz,
  expires_at    timestamptz
);
CREATE INDEX api_tokens_user_idx ON api_tokens (project_id, user_id);
