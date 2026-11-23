-- Sauvegardes par projet : le fichier est sur le disque (STORAGE_DIR/backups/projects), la table en
-- garde le catalogue. Une sauvegarde survit à la suppression de son projet (project_id devient NULL).
CREATE TABLE backups (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid REFERENCES projects (id) ON DELETE SET NULL,
  project_slug  text NOT NULL,
  project_title text NOT NULL,
  reason        text NOT NULL,
  note          text NOT NULL DEFAULT '',
  size          integer NOT NULL,
  checksum      text NOT NULL,
  counts        jsonb NOT NULL DEFAULT '{}',
  created_by    uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  verified_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX backups_project_idx ON backups (project_id, created_at DESC);
