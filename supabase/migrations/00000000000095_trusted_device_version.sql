-- Lets a user invalidate every "remember this device" 2FA cookie at once
-- (e.g. lost device, shared computer) without needing a per-device table.
-- Bumping this column makes all previously-issued trusted-device tokens for
-- the user fail verification, since the version is signed into the token.
ALTER TABLE users ADD COLUMN trusted_device_version integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION increment_trusted_device_version(p_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE users SET trusted_device_version = trusted_device_version + 1 WHERE id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION increment_trusted_device_version(uuid) TO service_role;
