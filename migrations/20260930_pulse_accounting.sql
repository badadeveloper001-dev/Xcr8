-- Pulse accurate provider accounting, migration 003.
-- Adds provider usage details required for cache-aware and request-level cost accounting.

ALTER TABLE pulse_ai_attempts ADD COLUMN IF NOT EXISTS cache_hit_tokens bigint;
ALTER TABLE pulse_ai_attempts ADD COLUMN IF NOT EXISTS cache_miss_tokens bigint;
ALTER TABLE pulse_ai_attempts ADD COLUMN IF NOT EXISTS billing_period varchar(16);
CREATE INDEX IF NOT EXISTS ix_pulse_attempts_provider_model_time ON pulse_ai_attempts (provider, model, created_at);
