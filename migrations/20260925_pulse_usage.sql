-- Pulse usage and cost cockpit, migration 001.
-- Apply with a privileged server/database migration connection. Browser roles receive no access.

CREATE TABLE IF NOT EXISTS pulse_cost_policy (
  id integer PRIMARY KEY,
  revision integer NOT NULL,
  config jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS pulse_ai_requests (
  id varchar(64) PRIMARY KEY,
  user_id integer NOT NULL,
  feature varchar(80) NOT NULL,
  status varchar(20) NOT NULL,
  duration_ms integer,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS pulse_ai_attempts (
  id varchar(64) PRIMARY KEY,
  request_id varchar(64) NOT NULL,
  user_id integer NOT NULL,
  feature varchar(80) NOT NULL,
  provider varchar(32) NOT NULL,
  model varchar(120) NOT NULL,
  fallback integer NOT NULL,
  status varchar(20) NOT NULL,
  input_tokens bigint,
  output_tokens bigint,
  characters bigint,
  images integer,
  duration_ms integer,
  cost_micros bigint,
  reserved_micros bigint NOT NULL,
  price_snapshot jsonb NOT NULL,
  cost_basis varchar(32),
  error_type varchar(80),
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS pulse_value_events (
  id varchar(160) PRIMARY KEY,
  request_id varchar(64),
  user_id integer NOT NULL,
  feature varchar(80) NOT NULL,
  event varchar(20) NOT NULL,
  source varchar(32) NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_pulse_attempts_time_user ON pulse_ai_attempts (created_at, user_id);
CREATE INDEX IF NOT EXISTS ix_pulse_attempts_request ON pulse_ai_attempts (request_id);
CREATE INDEX IF NOT EXISTS ix_pulse_requests_time_user ON pulse_ai_requests (created_at, user_id);
CREATE INDEX IF NOT EXISTS ix_pulse_value_time_user ON pulse_value_events (created_at, user_id);

INSERT INTO pulse_cost_policy (id, revision, config)
VALUES (1, 0, '{"mode":"observe","prices":{},"limits":{},"user_limits":{},"feature_limits":{},"max_output_tokens":2048,"max_input_bytes":64000}'::jsonb)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE pulse_cost_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE pulse_ai_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE pulse_ai_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pulse_value_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE pulse_cost_policy, pulse_ai_requests, pulse_ai_attempts, pulse_value_events FROM anon, authenticated;
