-- Growth admin creation is authenticated by the existing admin access-code system,
-- which does not identify a row in public.users. Keep source creation audit fields nullable
-- until admin identities are introduced.
ALTER TABLE growth_campaigns
    ALTER COLUMN created_by_user_id DROP NOT NULL;

ALTER TABLE influencer_referrals
    ALTER COLUMN created_by_user_id DROP NOT NULL;
