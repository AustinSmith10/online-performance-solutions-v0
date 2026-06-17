-- ─── Extend project_files for PBDB generation ─────────────────────────────────

-- Add 'pbdb' and 'additional' file types.
-- 'additional' was already used in the upload action but missing from the constraint.
ALTER TABLE project_files DROP CONSTRAINT project_files_file_type_check;
ALTER TABLE project_files ADD CONSTRAINT project_files_file_type_check
  CHECK (file_type IN ('po', 'building_plans', 'pbdb', 'additional'));

-- Version number for PBDB revisions (QA re-uploads increment this).
ALTER TABLE project_files ADD COLUMN version integer NOT NULL DEFAULT 1;

-- ─── Documents bucket for system-generated PBDB/PBDR files ─────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false,
  104857600,  -- 100 MB
  ARRAY[
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Consultants can read documents for their assigned projects
CREATE POLICY "Consultants can read their assigned project documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND (auth.jwt() ->> 'app_role')::text = 'consultant'
    AND (storage.foldername(name))[2] IN (
      SELECT id::text FROM projects WHERE assigned_consultant_id = auth.uid()
    )
  );

-- Clients can read their org's documents (e.g. PBDR on delivery)
CREATE POLICY "Clients can read their org documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM users WHERE id = auth.uid()
    )
  );

-- Super admins can read all documents
CREATE POLICY "Super admins can read all documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND (auth.jwt() ->> 'app_role')::text = 'super_admin'
  );

-- Service role full access for server-side generation
CREATE POLICY "Service role full access to documents storage" ON storage.objects
  FOR ALL
  USING (bucket_id = 'documents' AND auth.role() = 'service_role')
  WITH CHECK (bucket_id = 'documents' AND auth.role() = 'service_role');
