-- Stockages de fichiers d'un projet (Cloudinary, MinIO, Amazon S3…), pour les pièces jointes.
-- Le serveur local (STORAGE_DIR) est toujours disponible et n'a pas de ligne ici.
-- Les secrets (clé secrète Cloudinary, clé d'accès S3) sont chiffrés en AES-256-GCM avec SECRETS_KEY.
CREATE TABLE storage_backends (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  provider    text NOT NULL CHECK (provider IN ('cloudinary', 's3')),
  name        text NOT NULL,
  config      jsonb NOT NULL DEFAULT '{}',
  secret      text,
  delivery    text NOT NULL DEFAULT 'proxy' CHECK (delivery IN ('proxy', 'direct')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX storage_backends_project_idx ON storage_backends (project_id);

-- Pièces jointes : une entité « attachment » par fichier (métadonnées ; le contenu est dans le stockage).
ALTER TABLE entities DROP CONSTRAINT entities_kind_check;
ALTER TABLE entities ADD CONSTRAINT entities_kind_check
  CHECK (kind IN ('story', 'epic', 'workshop', 'reference', 'phase', 'risk', 'diligence', 'party',
                  'release', 'sprint', 'ticket', 'campaign', 'attachment'));
