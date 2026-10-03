-- Phase 4: persist verified payment economics for revenue attribution.
ALTER TABLE payment_events
    ADD COLUMN IF NOT EXISTS currency VARCHAR(8),
    ADD COLUMN IF NOT EXISTS amount_minor BIGINT,
    ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(16);

CREATE INDEX IF NOT EXISTS idx_payment_events_user_created
    ON payment_events (user_id, processed_at);
