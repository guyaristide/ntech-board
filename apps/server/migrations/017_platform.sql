-- Console de la plateforme (super-administrateurs), servie sur un hôte sans projet.
-- Une session ou un lien de connexion sans projet appartient à la console.
ALTER TABLE sessions ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE login_tokens ALTER COLUMN project_id DROP NOT NULL;

-- Super-administrateurs désignés depuis la console. Ceux de la variable SUPERADMIN_EMAILS n'y
-- figurent pas : ils viennent de la configuration du serveur et ne se retirent pas d'ici.
CREATE TABLE platform_admins (
  email    text PRIMARY KEY,
  added_by text NOT NULL DEFAULT '',
  added_at timestamptz NOT NULL DEFAULT now(),
  CHECK (email = lower(email))
);
