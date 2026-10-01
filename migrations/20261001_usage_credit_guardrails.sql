-- XCR8 usage-credit guardrails foundation
-- Safe, additive migration. Existing usage/subscription data is preserved.
-- The usage service will begin using subscription billing periods in the next phase.

ALTER TABLE usage_periods
    ALTER COLUMN period_key TYPE VARCHAR(64);

ALTER TABLE usage_periods
    ADD COLUMN IF NOT EXISTS period_start TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS period_end TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS subscription_id VARCHAR(160);

ALTER TABLE usage_ledger
    ALTER COLUMN period_key TYPE VARCHAR(64);

ALTER TABLE usage_ledger
    ALTER COLUMN estimated_external_cost TYPE NUMERIC(20, 8)
    USING estimated_external_cost::numeric;

ALTER TABLE usage_ledger
    ADD COLUMN IF NOT EXISTS workspace_id INTEGER,
    ADD COLUMN IF NOT EXISTS subscription_id VARCHAR(160),
    ADD COLUMN IF NOT EXISTS feature_type VARCHAR(64),
    ADD COLUMN IF NOT EXISTS provider VARCHAR(80),
    ADD COLUMN IF NOT EXISTS model VARCHAR(160),
    ADD COLUMN IF NOT EXISTS estimated_external_cost NUMERIC(20, 8);

-- Backfill legacy calendar-month periods without deleting or rewriting usage.
UPDATE usage_periods
SET
    period_start = to_timestamp(period_key || '-01', 'YYYY-MM-DD'),
    period_end = to_timestamp(period_key || '-01', 'YYYY-MM-DD') + INTERVAL '1 month'
WHERE period_start IS NULL
  AND period_key ~ '^[0-9]{4}-[0-9]{2}$';

-- Preserve the current subscription identity where it already exists in billing metadata.
UPDATE usage_periods p
SET subscription_id = NULLIF(u.billing_meta ->> 'subscription_id', '')
FROM users u
WHERE u.id = p.user_id
  AND p.subscription_id IS NULL;

UPDATE usage_ledger
SET feature_type = event_type
WHERE feature_type IS NULL;

CREATE INDEX IF NOT EXISTS ix_usage_periods_billing_window
    ON usage_periods (user_id, period_start, period_end);

CREATE INDEX IF NOT EXISTS ix_usage_periods_subscription
    ON usage_periods (subscription_id);

CREATE INDEX IF NOT EXISTS ix_usage_ledger_workspace
    ON usage_ledger (workspace_id);

CREATE INDEX IF NOT EXISTS ix_usage_ledger_subscription
    ON usage_ledger (subscription_id);

CREATE INDEX IF NOT EXISTS ix_usage_ledger_feature
    ON usage_ledger (feature_type);

CREATE INDEX IF NOT EXISTS ix_usage_ledger_provider_model
    ON usage_ledger (provider, model);

CREATE INDEX IF NOT EXISTS ix_usage_ledger_created_status
    ON usage_ledger (created_at, status);


DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_usage_ledger_workspace'
    ) THEN
        ALTER TABLE usage_ledger
            ADD CONSTRAINT fk_usage_ledger_workspace
            FOREIGN KEY (workspace_id) REFERENCES workspaces(id);
    END IF;
END $$;
