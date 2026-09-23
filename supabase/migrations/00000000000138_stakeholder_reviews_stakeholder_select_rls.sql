-- Issue #196: stakeholder_reviews had RLS policies for service_role,
-- super_admin, and consultants (migration 00000000000030) only — no policy
-- let the `stakeholder` role SELECT it at all. That meant Supabase
-- Realtime's postgres_changes subscription (RealtimeRefresh, mounted in
-- app/(client)/layout.tsx) never fired for stakeholders on this table, so
-- their view of their own review status depended entirely on the 45s
-- fallback poll — the root cause of the "requires refreshing" pattern
-- reported across the stakeholder portal.
--
-- Mirrors the existing consultant-scoped policy's join pattern, matching on
-- the stakeholder's own email instead of an assigned_consultant_id — both
-- `users.email` and `stakeholder_reviews.stakeholder_email` are enforced
-- lowercase (migration 00000000000128), so a plain equality is safe.

CREATE POLICY "Stakeholders can read their own reviews" ON stakeholder_reviews
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'stakeholder'
        AND users.email = stakeholder_reviews.stakeholder_email
    )
  );
