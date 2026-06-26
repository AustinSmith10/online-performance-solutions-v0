-- Removes manually-created test organisations: "org2", "Test Org QA", and
-- "Meridian Group" (belt-and-suspenders in case migration 45 was not applied).
-- Follows the same deletion order and audit_log trigger pattern as migration 45.

DO $$
DECLARE
  _org_ids     uuid[];
  _project_ids uuid[];
  _user_ids    uuid[];
BEGIN

  SELECT array_agg(id) INTO _org_ids
  FROM organisations
  WHERE name = ANY(ARRAY['org2', 'Test Org QA', 'Meridian Group']);

  IF _org_ids IS NULL THEN
    RAISE NOTICE 'Test orgs not found — skipping.';
    RETURN;
  END IF;

  SELECT array_agg(id) INTO _project_ids
  FROM projects WHERE org_id = ANY(_org_ids);

  SELECT array_agg(id) INTO _user_ids
  FROM users WHERE org_id = ANY(_org_ids);

  -- ── Disable audit_log triggers ──────────────────────────────────────────────
  ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_update;
  ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_delete;

  -- ── Leaf rows on projects ───────────────────────────────────────────────────
  IF _project_ids IS NOT NULL THEN
    DELETE FROM stakeholder_reviews WHERE project_id = ANY(_project_ids);
    DELETE FROM project_files        WHERE project_id = ANY(_project_ids);
    UPDATE credit_ledger SET project_id = NULL WHERE project_id = ANY(_project_ids);
  END IF;

  -- ── Notifications ───────────────────────────────────────────────────────────
  IF _user_ids IS NOT NULL THEN
    DELETE FROM notifications WHERE recipient_id = ANY(_user_ids);
  END IF;
  IF _project_ids IS NOT NULL THEN
    DELETE FROM notifications WHERE project_id = ANY(_project_ids);
  END IF;

  -- ── audit_log ───────────────────────────────────────────────────────────────
  IF _user_ids IS NOT NULL THEN
    DELETE FROM audit_log WHERE actor_id = ANY(_user_ids);
  END IF;
  IF _project_ids IS NOT NULL THEN
    DELETE FROM audit_log WHERE project_id = ANY(_project_ids);
  END IF;
  DELETE FROM audit_log WHERE org_id = ANY(_org_ids);

  -- ── credit_ledger ───────────────────────────────────────────────────────────
  DELETE FROM credit_ledger WHERE org_id = ANY(_org_ids);

  -- ── Null FK columns on non-test projects pointing at these users ─────────────
  IF _user_ids IS NOT NULL THEN
    UPDATE projects
       SET assigned_consultant_id = NULL
     WHERE assigned_consultant_id = ANY(_user_ids)
       AND (_project_ids IS NULL OR id != ALL(_project_ids));

    UPDATE projects
       SET payment_override_by = NULL
     WHERE payment_override_by = ANY(_user_ids)
       AND (_project_ids IS NULL OR id != ALL(_project_ids));
  END IF;

  -- ── Projects ─────────────────────────────────────────────────────────────────
  IF _project_ids IS NOT NULL THEN
    DELETE FROM projects WHERE id = ANY(_project_ids);
  END IF;

  -- ── Templates (cascades to file_requirements, stakeholder_configs, mappings) ─
  DELETE FROM templates WHERE org_id = ANY(_org_ids);

  -- ── Clean up user references on non-test rows ───────────────────────────────
  IF _user_ids IS NOT NULL THEN
    DELETE FROM project_files
     WHERE uploaded_by = ANY(_user_ids)
       AND (_project_ids IS NULL OR project_id != ALL(_project_ids));

    UPDATE stakeholder_reviews
       SET waived_by = NULL
     WHERE waived_by = ANY(_user_ids)
       AND (_project_ids IS NULL OR project_id != ALL(_project_ids));

    UPDATE credit_ledger
       SET performed_by = NULL
     WHERE performed_by = ANY(_user_ids)
       AND (_org_ids IS NULL OR org_id != ALL(_org_ids));
  END IF;

  -- ── Users ────────────────────────────────────────────────────────────────────
  IF _user_ids IS NOT NULL THEN
    DELETE FROM users WHERE id = ANY(_user_ids);
  END IF;

  -- ── Organisations ─────────────────────────────────────────────────────────────
  DELETE FROM organisations WHERE id = ANY(_org_ids);

  -- ── Re-enable triggers ───────────────────────────────────────────────────────
  ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_update;
  ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_delete;

  RAISE NOTICE 'Test orgs removed.';
END;
$$;
