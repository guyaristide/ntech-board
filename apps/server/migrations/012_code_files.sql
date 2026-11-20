-- Fichiers techniques (JSON, YAML, XML, SQL, logs, code…) acceptés en pièces jointes : la famille
-- « code » est ajoutée aux projets qui avaient enregistré leur liste de types acceptés. Les projets
-- sans liste enregistrée suivent les réglages par défaut, qui l'incluent déjà.
UPDATE projects
   SET settings = jsonb_set(settings, '{files,categories}', (settings #> '{files,categories}') || '"code"')
 WHERE jsonb_typeof(settings #> '{files,categories}') = 'array'
   AND NOT (settings #> '{files,categories}') ? 'code';
