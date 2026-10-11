-- Durable, encrypted recovery state for account deletion.
-- No foreign key to users: this record must survive deletion of the account.
CREATE TABLE IF NOT EXISTS public.account_deletion_jobs (
    id VARCHAR(36) PRIMARY KEY,
    user_id INTEGER NULL UNIQUE,
    status VARCHAR(32) NOT NULL DEFAULT 'requested',
    current_stage VARCHAR(64) NOT NULL DEFAULT 'queued',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NULL,
    last_attempt_at TIMESTAMPTZ NULL,
    lease_expires_at TIMESTAMPTZ NULL,
    payload_expires_at TIMESTAMPTZ NULL,
    recovery_payload_encrypted TEXT NULL,
    stage_results JSON NOT NULL DEFAULT '{}'::json,
    last_error_code VARCHAR(64) NULL,
    last_error_message TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS ix_account_deletion_jobs_status
    ON public.account_deletion_jobs (status);
CREATE INDEX IF NOT EXISTS ix_account_deletion_jobs_next_attempt_at
    ON public.account_deletion_jobs (next_attempt_at);
CREATE INDEX IF NOT EXISTS ix_account_deletion_jobs_lease_expires_at
    ON public.account_deletion_jobs (lease_expires_at);
CREATE INDEX IF NOT EXISTS ix_account_deletion_jobs_user_id
    ON public.account_deletion_jobs (user_id);
