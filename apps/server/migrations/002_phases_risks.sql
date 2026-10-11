-- Phases du projet (avec leur matrice RACI) et registre des risques, stockés comme les autres contenus.
ALTER TABLE entities DROP CONSTRAINT entities_kind_check;
ALTER TABLE entities ADD CONSTRAINT entities_kind_check
  CHECK (kind IN ('story', 'epic', 'workshop', 'reference', 'phase', 'risk'));
