-- Partie Réalisation : versions, sprints et tickets, stockés comme les autres contenus.
ALTER TABLE entities DROP CONSTRAINT entities_kind_check;
ALTER TABLE entities ADD CONSTRAINT entities_kind_check
  CHECK (kind IN ('story', 'epic', 'workshop', 'reference', 'phase', 'risk', 'diligence', 'party',
                  'release', 'sprint', 'ticket'));
