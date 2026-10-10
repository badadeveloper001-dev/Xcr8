-- Account deletion retains payment audit events without retaining a user link.
-- Safe to re-run on PostgreSQL.
ALTER TABLE payment_events ALTER COLUMN user_id DROP NOT NULL;
