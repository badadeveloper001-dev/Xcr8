-- Pulse accurate provider accounting, migration 003.
-- Adds provider usage details required for cache-aware and request-level cost accounting.

ALTER TABLE pulse_ai_attempts ADD COLUMN IF NOT EXISTS cache_hit_tokens bigint;
ALTER TABLE pulse_ai_attempts ADD COLUMN IF NOT EXISTS cache_miss_tokens bigint;
ALTER TABLE pulse_ai_attempts ADD COLUMN IF NOT EXISTS billing_period varchar(16);
CREATE INDEX IF NOT EXISTS ix_pulse_attempts_provider_model_time ON pulse_ai_attempts (provider, model, created_at);

-- Seed the current configured model rates for the models Xcr8 currently routes to.
-- These values are versioned here so accounting is reproducible for this migration.
UPDATE pulse_cost_policy
SET revision = revision + 1,
    config = jsonb_set(
      config,
      '{prices}',
      COALESCE(config->'prices', '{}'::jsonb) || '{
        "openai/gpt-5.4-mini": {
          "input_per_million": 0.75,
          "input_cache_hit_per_million": 0.075,
          "output_per_million": 4.5,
          "source": "https://developers.openai.com/api/docs/models/gpt-5.4-mini",
          "effective_date": "2026-09-30"
        },
        "openai/gpt-5.4": {
          "input_per_million": 2.5,
          "input_cache_hit_per_million": 0.25,
          "output_per_million": 15,
          "source": "https://developers.openai.com/api/docs/models/gpt-5.4",
          "effective_date": "2026-09-30"
        },
        "openai/gpt-4o-mini": {
          "input_per_million": 0.15,
          "input_cache_hit_per_million": 0.075,
          "output_per_million": 0.6,
          "source": "https://developers.openai.com/api/docs/models/gpt-4o-mini",
          "effective_date": "2026-09-30"
        },
        "deepseek/deepseek-v4-flash": {
          "input_cache_hit_per_million": 0.003,
          "input_cache_miss_per_million": 0.15,
          "input_cache_hit_peak_per_million": 0.006,
          "input_cache_miss_peak_per_million": 0.3,
          "output_per_million": 0.6,
          "output_peak_per_million": 1.2,
          "source": "https://api-docs.deepseek.com/quick_start/pricing/",
          "effective_date": "2026-09-30"
        }
      }'::jsonb
    )
WHERE id = 1;
