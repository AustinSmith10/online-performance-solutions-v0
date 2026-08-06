-- Two fixes needed for the ops/admin project-detail pages' scoped Realtime
-- subscriptions (RealtimeSubscriptionRefresher) to actually deliver events:

-- 1. project_files and field_flags were never added to the supabase_realtime
--    publication (only projects/notifications/stakeholder_reviews were, back
--    in 00000000000044_enable_realtime.sql) — postgres_changes subscriptions
--    to them silently never fire, regardless of RLS.
ALTER PUBLICATION supabase_realtime ADD TABLE project_files;
ALTER PUBLICATION supabase_realtime ADD TABLE field_flags;

-- 2. The consultant SELECT policy on stakeholder_reviews joins back to
--    projects via a correlated EXISTS subquery. Per Supabase's own Realtime
--    Authorization docs, this shape is unreliable for postgres_changes：
--    evaluating it re-triggers projects' own RLS policies during the
--    Realtime authorization check. That policy was written purely as a
--    defensive backstop for direct client access (all real app reads went
--    through the service-role admin client) — it only became load-bearing
--    once browser-side Realtime subscriptions were added. Move the lookup
--    into a SECURITY DEFINER function, which bypasses projects' RLS instead
--    of re-evaluating it, matching Supabase's documented workaround.
CREATE OR REPLACE FUNCTION consultant_owns_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = p_project_id
      AND projects.assigned_consultant_id = auth.uid()
  );
$$;

DROP POLICY "Consultants can read reviews for their assigned projects" ON stakeholder_reviews;

CREATE POLICY "Consultants can read reviews for their assigned projects" ON stakeholder_reviews
  FOR SELECT TO authenticated
  USING (consultant_owns_project(project_id));
