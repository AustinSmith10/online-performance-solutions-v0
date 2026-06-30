-- Soft-delete flag for user accounts.
-- Deactivated users remain in the DB so audit history and FK references are
-- preserved; they just cannot log in. Admins can restore them.

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Index for filtering active users in list queries
CREATE INDEX IF NOT EXISTS users_is_active_idx ON users (is_active);
