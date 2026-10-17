-- Référentiel des parties prenantes (organisations, personnes, rôles), stocké comme les autres contenus,
-- et réglages du projet (partie Réalisation, types d'organisations).
ALTER TABLE entities DROP CONSTRAINT entities_kind_check;
ALTER TABLE entities ADD CONSTRAINT entities_kind_check
  CHECK (kind IN ('story', 'epic', 'workshop', 'reference', 'phase', 'risk', 'diligence', 'party'));
ALTER TABLE projects ADD COLUMN settings jsonb NOT NULL DEFAULT '{}'::jsonb;
