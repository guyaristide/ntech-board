-- Sources externes : échanges reçus (« source ») et propositions de l'IA à relire (« proposal »).
ALTER TABLE entities DROP CONSTRAINT entities_kind_check;
ALTER TABLE entities ADD CONSTRAINT entities_kind_check
  CHECK (kind IN ('story', 'epic', 'workshop', 'reference', 'phase', 'risk', 'diligence', 'party',
                  'release', 'sprint', 'ticket', 'campaign', 'attachment', 'source', 'proposal'));
