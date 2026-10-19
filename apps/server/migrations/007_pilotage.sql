-- Pilotage : relevé quotidien de chaque sprint en cours, pour le burndown.
-- Un relevé par jour, mis à jour à chaque modification de ticket ; « final » : pris à la clôture,
-- avant que les tickets non terminés quittent le sprint, il n'est plus remplacé.
CREATE TABLE sprint_days (
  project_id  uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  sprint      text NOT NULL,
  day         date NOT NULL,
  total       numeric NOT NULL,
  done        numeric NOT NULL,
  count       integer NOT NULL,
  done_count  integer NOT NULL,
  final       boolean NOT NULL DEFAULT false,
  at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, sprint, day)
);
