-- ─── evidence storage bucket ────────────────────────────────────────────────
--
-- Evidence attachments (#85) need a wider MIME allow-list than the standard
-- `submissions` bucket (which stays PDF/JPEG/PNG/TIFF-only for building
-- plans / PO uploads). Splitting evidence into its own bucket lets us accept
-- forwarded emails without loosening the standard submission path.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'evidence',
  'evidence',
  false,
  52428800,  -- 50 MB
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/tiff',
    'message/rfc822',            -- .eml
    'application/vnd.ms-outlook' -- .msg
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Consultants can read evidence for their assigned projects
CREATE POLICY "Consultants can read their assigned project evidence" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'evidence'
    AND (auth.jwt() ->> 'app_role')::text = 'consultant'
    AND (storage.foldername(name))[2] IN (
      SELECT id::text FROM projects WHERE assigned_consultant_id = auth.uid()
    )
  );

-- Super admins can read all evidence
CREATE POLICY "Super admins can read all evidence" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'evidence'
    AND (auth.jwt() ->> 'app_role')::text = 'super_admin'
  );

-- Service role full access to evidence
CREATE POLICY "Service role full access to evidence storage" ON storage.objects
  FOR ALL
  USING (bucket_id = 'evidence' AND auth.role() = 'service_role')
  WITH CHECK (bucket_id = 'evidence' AND auth.role() = 'service_role');
