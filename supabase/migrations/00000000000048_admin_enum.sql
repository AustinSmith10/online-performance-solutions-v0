-- Add 'admin' to the user_role enum.
-- Must be committed in its own transaction before any RLS policy can reference
-- the new value — PostgreSQL rejects same-transaction use of a new enum member.
-- Policy updates live in the following migration (00000000000049_admin_role_policies.sql).

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'admin' AFTER 'super_admin';
