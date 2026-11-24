-- Retours de recette (« finding ») : anomalies, demandes d'évolution, questions et remarques
-- rattachées à une campagne, qualifiées, corrigées par un ticket, retestées puis closes.
ALTER TABLE entities DROP CONSTRAINT entities_kind_check;
ALTER TABLE entities ADD CONSTRAINT entities_kind_check
  CHECK (kind IN ('story', 'epic', 'workshop', 'reference', 'phase', 'risk', 'diligence', 'party',
                  'release', 'sprint', 'ticket', 'campaign', 'attachment', 'source', 'proposal',
                  'comment', 'finding'));

-- Retours d'un ticket : relus à chaque changement d'étape d'un ticket.
CREATE INDEX entities_finding_ticket_idx ON entities (project_id, (data->>'ticket')) WHERE kind = 'finding';
