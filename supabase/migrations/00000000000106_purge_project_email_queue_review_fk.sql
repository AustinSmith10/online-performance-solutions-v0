-- purge_project (migration 94) nullifies inbound_email_queue.proposed_project_id /
-- resolved_project_id before deleting, but stakeholder_reviews rows for the project
-- cascade-delete too (ON DELETE CASCADE from migration 28/29), and any queue row still
-- pointing at one of those reviews via proposed_stakeholder_review_id /
-- resolved_stakeholder_review_id (default NO ACTION FK) blocks the whole delete with a
-- foreign key violation — surfaced to the admin as the generic "Could not permanently
-- delete project. Please try again." in purgeProject (app/actions/recovery.ts).
CREATE OR REPLACE FUNCTION purge_project(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- credit_ledger uses NO ACTION — nullify before deleting
  UPDATE credit_ledger SET project_id = NULL WHERE project_id = p_project_id;

  -- inbound_email_queue.proposed/resolved_project_id use NO ACTION — nullify before deleting
  UPDATE inbound_email_queue SET proposed_project_id = NULL WHERE proposed_project_id = p_project_id;
  UPDATE inbound_email_queue SET resolved_project_id = NULL WHERE resolved_project_id = p_project_id;

  -- Same problem one level down: queue rows referencing a stakeholder_reviews row that
  -- belongs to this project also block the cascade delete of that review.
  UPDATE inbound_email_queue
     SET proposed_stakeholder_review_id = NULL
   WHERE proposed_stakeholder_review_id IN (
     SELECT id FROM stakeholder_reviews WHERE project_id = p_project_id
   );
  UPDATE inbound_email_queue
     SET resolved_stakeholder_review_id = NULL
   WHERE resolved_stakeholder_review_id IN (
     SELECT id FROM stakeholder_reviews WHERE project_id = p_project_id
   );

  -- audit_log uses ON DELETE SET NULL, but the immutable trigger blocks UPDATE
  -- Disable it for the duration of this transaction so the cascade can proceed
  ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_update;

  DELETE FROM projects WHERE id = p_project_id;

  ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_update;
END;
$$;

GRANT EXECUTE ON FUNCTION purge_project(uuid) TO service_role;
