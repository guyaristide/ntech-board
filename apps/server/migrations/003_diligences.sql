-- Diligences issues des ateliers (qui doit produire, étudier, trancher ou fournir quoi), stockées comme les autres contenus.
ALTER TABLE entities DROP CONSTRAINT entities_kind_check;
ALTER TABLE entities ADD CONSTRAINT entities_kind_check
  CHECK (kind IN ('story', 'epic', 'workshop', 'reference', 'phase', 'risk', 'diligence'));
