-- Préférences de notification d'une personne dans un projet (rythme des e-mails par famille), et
-- jeton de désabonnement (lien « ne plus recevoir d'e-mails », sans connexion).
CREATE TABLE notification_prefs (
  project_id        uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  prefs             jsonb NOT NULL DEFAULT '{}',
  unsubscribe_token text NOT NULL UNIQUE,
  PRIMARY KEY (project_id, user_id)
);

-- Tâches quotidiennes (récapitulatif, rappels d'échéance) : une seule exécution par jour, même avec
-- plusieurs instances du serveur.
CREATE TABLE job_runs (
  name   text PRIMARY KEY,
  ran_on date NOT NULL
);

-- File d'attente des e-mails : les notifications pas encore envoyées.
CREATE INDEX notifications_unsent_idx ON notifications (updated_at) WHERE emailed_at IS NULL AND read_at IS NULL;
