-- Account deletion retains payment audit events without retaining a user link.
-- Safe to re-run on PostgreSQL and tolerant of fresh databases where the ORM
-- creates payment_events later using the nullable model definition.
DO $$
BEGIN
    IF to_regclass('public.payment_events') IS NOT NULL THEN
        ALTER TABLE public.payment_events ALTER COLUMN user_id DROP NOT NULL;
    END IF;
END
$$;
