-- XCR8 migration ledger baseline.
-- Scope: establish application-owned migration history without re-running
-- migrations that are already represented in production.
--
-- Apply once with a privileged database migration connection.
-- This file does NOT execute migrations 001 or 002; it only records their
-- already-existing production state.

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version varchar(32) PRIMARY KEY,
  name varchar(180) NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.schema_migrations (version, name)
VALUES
  ('001', 'pulse_usage'),
  ('002', 'schema_reliability')
ON CONFLICT (version) DO NOTHING;
