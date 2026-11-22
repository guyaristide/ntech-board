-- Notifications système (Web Push) : un abonnement par navigateur ou appareil d'une personne, sur
-- l'adresse d'un projet. Supprimé quand le service de push le déclare expiré.
CREATE TABLE push_subscriptions (
  id         bigserial PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  endpoint   text NOT NULL UNIQUE,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  user_agent text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_subscriptions_user_idx ON push_subscriptions (project_id, user_id);
