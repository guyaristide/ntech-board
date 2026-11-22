-- Journal des actions faites depuis la console de la plateforme : qui, quoi, sur quoi, quand.
CREATE TABLE platform_audit (
  id     bigserial PRIMARY KEY,
  at     timestamptz NOT NULL DEFAULT now(),
  actor  text NOT NULL,
  action text NOT NULL,
  target text NOT NULL DEFAULT '',
  detail text NOT NULL DEFAULT ''
);
CREATE INDEX platform_audit_at_idx ON platform_audit (at DESC);
