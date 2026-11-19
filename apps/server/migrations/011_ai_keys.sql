-- Clé de l'API Claude propre à chaque projet (analyse des échanges, écran « À relire »).
-- Chiffrée en AES-256-GCM avec SECRETS_KEY ; seuls les 4 derniers caractères sont gardés en clair.
CREATE TABLE ai_keys (
  project_id  uuid PRIMARY KEY REFERENCES projects (id) ON DELETE CASCADE,
  secret      text NOT NULL,
  hint        text NOT NULL,
  updated_by  text NOT NULL DEFAULT '',
  updated_at  timestamptz NOT NULL DEFAULT now()
);
