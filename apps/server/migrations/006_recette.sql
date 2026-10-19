-- Recette : campagnes (résultats par cas de test, verdicts du client), stockées comme les autres contenus.
ALTER TABLE entities DROP CONSTRAINT entities_kind_check;
ALTER TABLE entities ADD CONSTRAINT entities_kind_check
  CHECK (kind IN ('story', 'epic', 'workshop', 'reference', 'phase', 'risk', 'diligence', 'party',
                  'release', 'sprint', 'ticket', 'campaign'));
