-- Fils de discussion : messages (« comment ») rattachés à n'importe quel élément ou pièce jointe.
ALTER TABLE entities DROP CONSTRAINT entities_kind_check;
ALTER TABLE entities ADD CONSTRAINT entities_kind_check
  CHECK (kind IN ('story', 'epic', 'workshop', 'reference', 'phase', 'risk', 'diligence', 'party',
                  'release', 'sprint', 'ticket', 'campaign', 'attachment', 'source', 'proposal',
                  'comment'));

-- Recherche du fil d'un élément.
CREATE INDEX entities_comment_target_idx ON entities (project_id, (data->'target'->>'kind'), (data->'target'->>'id'))
  WHERE kind = 'comment';

-- Reprise des anciens commentaires, rangés dans les éléments (US, ateliers, phases, risques,
-- diligences, tickets) : un message par commentaire, signé du nom d'origine, à sa date.
WITH old AS (
  SELECT e.project_id, e.kind AS target_kind, e.id AS target_id, c.value AS c, c.ord,
         'CM-' || substr(md5(e.project_id::text || e.kind || e.id || c.ord::text || coalesce(c.value->>'id', '')), 1, 12) AS new_id
    FROM entities e
   CROSS JOIN LATERAL jsonb_array_elements(e.data->'comments') WITH ORDINALITY AS c(value, ord)
   WHERE e.kind IN ('story', 'workshop', 'phase', 'risk', 'diligence', 'ticket')
     AND jsonb_typeof(e.data->'comments') = 'array'
)
INSERT INTO entities (project_id, kind, id, data, position, revision)
SELECT project_id, 'comment', new_id,
       jsonb_build_object(
         'id', new_id,
         'target', jsonb_build_object('kind', target_kind, 'id', target_id),
         'replyTo', '',
         'author', '',
         'authorName', coalesce(c->>'author', ''),
         'text', coalesce(c->>'text', ''),
         'at', coalesce(c->>'at', to_json(now())#>>'{}'),
         'editedAt', null,
         'deleted', false
       ),
       ord, 1
  FROM old
ON CONFLICT DO NOTHING;

UPDATE entities SET data = jsonb_set(data, '{comments}', '[]'::jsonb)
 WHERE kind IN ('story', 'workshop', 'phase', 'risk', 'diligence', 'ticket')
   AND jsonb_typeof(data->'comments') = 'array'
   AND jsonb_array_length(data->'comments') > 0;
