-- XCR8 schema reliability migration 002.
-- Scope: move schema changes currently performed at application startup/request time
-- into an explicit, idempotent migration.
--
-- Apply with a privileged database migration connection.
-- This migration is intentionally limited to the runtime DDL currently used by
-- the workspace/profile-scope feature. It does not replace the legacy
-- Base.metadata.create_all() for the rest of the application schema yet.

-- 1. PostgreSQL enum additions currently performed during backend startup.
ALTER TYPE platform ADD VALUE IF NOT EXISTS 'threads';
ALTER TYPE plantier ADD VALUE IF NOT EXISTS 'starter';
ALTER TYPE plantier ADD VALUE IF NOT EXISTS 'business';

-- 2. Managed creator-profile tables currently created by the workspace route.
CREATE TABLE IF NOT EXISTS workspaces (
  id integer PRIMARY KEY,
  name varchar(180) NOT NULL,
  slug varchar(120) NOT NULL UNIQUE,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_workspaces_name ON workspaces (name);
CREATE INDEX IF NOT EXISTS ix_workspaces_slug ON workspaces (slug);

CREATE TABLE IF NOT EXISTS workspace_memberships (
  id integer PRIMARY KEY,
  workspace_id integer NOT NULL REFERENCES workspaces(id),
  user_id integer NOT NULL REFERENCES users(id),
  role varchar(32) NOT NULL,
  is_owner boolean NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_workspace_memberships_workspace_id
  ON workspace_memberships (workspace_id);
CREATE INDEX IF NOT EXISTS ix_workspace_memberships_user_id
  ON workspace_memberships (user_id);

-- 3. workspace_id columns/indexes currently added by profile_scope.py.
ALTER TABLE connected_platforms
  ADD COLUMN IF NOT EXISTS workspace_id integer REFERENCES workspaces(id);
CREATE INDEX IF NOT EXISTS ix_connected_platforms_workspace_id
  ON connected_platforms (workspace_id);

ALTER TABLE content_posts
  ADD COLUMN IF NOT EXISTS workspace_id integer REFERENCES workspaces(id);
CREATE INDEX IF NOT EXISTS ix_content_posts_workspace_id
  ON content_posts (workspace_id);

ALTER TABLE scheduled_posts
  ADD COLUMN IF NOT EXISTS workspace_id integer REFERENCES workspaces(id);
CREATE INDEX IF NOT EXISTS ix_scheduled_posts_workspace_id
  ON scheduled_posts (workspace_id);

ALTER TABLE creator_memory
  ADD COLUMN IF NOT EXISTS workspace_id integer REFERENCES workspaces(id);
CREATE INDEX IF NOT EXISTS ix_creator_memory_workspace_id
  ON creator_memory (workspace_id);

ALTER TABLE analytics_snapshots
  ADD COLUMN IF NOT EXISTS workspace_id integer REFERENCES workspaces(id);
CREATE INDEX IF NOT EXISTS ix_analytics_snapshots_workspace_id
  ON analytics_snapshots (workspace_id);

ALTER TABLE trend_signal_events
  ADD COLUMN IF NOT EXISTS workspace_id integer REFERENCES workspaces(id);
CREATE INDEX IF NOT EXISTS ix_trend_signal_events_workspace_id
  ON trend_signal_events (workspace_id);

ALTER TABLE intelligence_feedback
  ADD COLUMN IF NOT EXISTS workspace_id integer REFERENCES workspaces(id);
CREATE INDEX IF NOT EXISTS ix_intelligence_feedback_workspace_id
  ON intelligence_feedback (workspace_id);

ALTER TABLE intelligence_notifications
  ADD COLUMN IF NOT EXISTS workspace_id integer REFERENCES workspaces(id);
CREATE INDEX IF NOT EXISTS ix_intelligence_notifications_workspace_id
  ON intelligence_notifications (workspace_id);
