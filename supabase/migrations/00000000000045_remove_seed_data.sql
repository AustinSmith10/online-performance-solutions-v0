-- Removes all rows inserted by supabase/seed.ts and scripts/seed-*.ts.
-- Temporarily disables the audit_log immutable trigger (same pattern as
-- purge_project) so ON DELETE SET NULL cascades and explicit deletes work.

DO $$
DECLARE
  _project_ids   uuid[];
  _user_ids      uuid[];
  _org_ids       uuid[];
BEGIN

  -- ── Resolve seeded IDs ──────────────────────────────────────────────────────

  SELECT array_agg(id) INTO _project_ids
  FROM projects
  WHERE project_number = ANY(ARRAY[
    'OPS-0001','OPS-0002','OPS-0003','OPS-0004','OPS-0005',
    'OPS-0010','OPS-0011','OPS-0012',
    'OPS-R001','OPS-R002','OPS-R003','OPS-R004','OPS-R005',
    'OPS-D001','OPS-D002','OPS-D003',
    'SEED-CV-01','SEED-CV-02','SEED-CV-03'
  ]);

  SELECT array_agg(id) INTO _user_ids
  FROM users
  WHERE email = ANY(ARRAY[
    'admin@ops.test',
    'consultant@ops.test','consultant2@ops.test','consultant3@ops.test',
    'consultant4@ops.test','consultant5@ops.test',
    'client@ops.test','client2@ops.test','client3@ops.test',
    'client4@ops.test','client5@ops.test'
  ]);

  SELECT array_agg(id) INTO _org_ids
  FROM organisations
  WHERE slug = ANY(ARRAY['stockland','meridian-group']);

  -- Nothing to do if seed was never applied
  IF _project_ids IS NULL AND _user_ids IS NULL AND _org_ids IS NULL THEN
    RAISE NOTICE 'No seed data found — skipping.';
    RETURN;
  END IF;

  -- ── Disable audit_log triggers ──────────────────────────────────────────────

  ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_update;
  ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_delete;

  -- ── Delete leaf rows on seeded projects ─────────────────────────────────────

  IF _project_ids IS NOT NULL THEN
    DELETE FROM stakeholder_reviews WHERE project_id = ANY(_project_ids);
    DELETE FROM project_files        WHERE project_id = ANY(_project_ids);
    -- credit_ledger.project_id has no ON DELETE action — null before project delete
    UPDATE credit_ledger SET project_id = NULL WHERE project_id = ANY(_project_ids);
  END IF;

  -- ── Notifications ───────────────────────────────────────────────────────────

  IF _user_ids IS NOT NULL THEN
    DELETE FROM notifications WHERE recipient_id = ANY(_user_ids);
  END IF;
  IF _project_ids IS NOT NULL THEN
    DELETE FROM notifications WHERE project_id   = ANY(_project_ids);
  END IF;

  -- ── audit_log (triggers disabled) ───────────────────────────────────────────

  IF _user_ids IS NOT NULL THEN
    DELETE FROM audit_log WHERE actor_id   = ANY(_user_ids);
  END IF;
  IF _project_ids IS NOT NULL THEN
    DELETE FROM audit_log WHERE project_id = ANY(_project_ids);
  END IF;
  IF _org_ids IS NOT NULL THEN
    DELETE FROM audit_log WHERE org_id     = ANY(_org_ids);
  END IF;
  DELETE FROM audit_log WHERE event_type = 'audit.seed';

  -- ── credit_ledger (org_id NOT NULL — must go before org delete) ─────────────

  IF _org_ids IS NOT NULL THEN
    DELETE FROM credit_ledger WHERE org_id = ANY(_org_ids);
  END IF;

  -- ── Null FK columns on non-seeded projects that point at seeded users ────────
  -- (assigned_consultant_id and payment_override_by have no ON DELETE action)

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

  -- ── Templates (cascade deletes template_field_mappings, file_requirements,
  --    stakeholder_configs) ────────────────────────────────────────────────────

  IF _org_ids IS NOT NULL THEN
    DELETE FROM templates WHERE org_id = ANY(_org_ids);
  END IF;

  -- ── Null uploaded_by on non-seeded project_files referencing seeded users ─────
  -- (project_files_uploaded_by_fkey blocks user deletion otherwise)

  IF _user_ids IS NOT NULL THEN
    UPDATE project_files
       SET uploaded_by = NULL
     WHERE uploaded_by = ANY(_user_ids)
       AND (_project_ids IS NULL OR project_id != ALL(_project_ids));
  END IF;

  -- ── public.users ─────────────────────────────────────────────────────────────

  IF _user_ids IS NOT NULL THEN
    DELETE FROM users WHERE id = ANY(_user_ids);
  END IF;

  -- ── Organisations ─────────────────────────────────────────────────────────────

  IF _org_ids IS NOT NULL THEN
    DELETE FROM organisations WHERE id = ANY(_org_ids);
  END IF;

  -- ── Re-enable audit_log triggers ─────────────────────────────────────────────

  ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_update;
  ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_delete;

  RAISE NOTICE 'Seed data removed.';
END;
$$;
