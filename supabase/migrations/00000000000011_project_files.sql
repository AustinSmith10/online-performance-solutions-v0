-- ─── submissions storage bucket ────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'submissions',
  'submissions',
  false,
  52428800,  -- 50 MB
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/tiff'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Clients can upload files to their org's path
CREATE POLICY "Clients can upload to their org submissions" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'submissions'
    AND (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM users WHERE id = auth.uid()
    )
  );

-- Clients can read their org's submissions
CREATE POLICY "Clients can read their org submissions" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'submissions'
    AND (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM users WHERE id = auth.uid()
    )
  );

-- Super admins can read all submissions
CREATE POLICY "Super admins can read all submissions" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'submissions'
    AND (auth.jwt() ->> 'app_role')::text = 'super_admin'
  );

-- Service role full access to submissions
CREATE POLICY "Service role full access to submissions storage" ON storage.objects
  FOR ALL
  USING (bucket_id = 'submissions' AND auth.role() = 'service_role')
  WITH CHECK (bucket_id = 'submissions' AND auth.role() = 'service_role');

-- ─── client insert policy on projects ──────────────────────────────────────────

CREATE POLICY "Clients can insert projects for their org" ON projects
  FOR INSERT TO authenticated
  WITH CHECK (
    (auth.jwt() ->> 'app_role')::text = 'client'
    AND org_id IN (SELECT org_id FROM users WHERE id = auth.uid())
    AND submitted_by = auth.uid()
  );

-- ─── project_files table ────────────────────────────────────────────────────────

CREATE TABLE project_files (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_type text NOT NULL CHECK (file_type IN ('po', 'building_plans')),
  storage_path text NOT NULL,
  original_filename text NOT NULL,
  uploaded_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE project_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can read their org project files" ON project_files
  FOR SELECT USING (
    project_id IN (
      SELECT id FROM projects WHERE org_id IN (
        SELECT org_id FROM users WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Super admins can manage project files" ON project_files
  FOR ALL USING (
    (auth.jwt() ->> 'app_role')::text = 'super_admin'
  )
  WITH CHECK (
    (auth.jwt() ->> 'app_role')::text = 'super_admin'
  );

CREATE POLICY "Service role full access to project files" ON project_files
  FOR ALL
  USING (auth.role() = 'service_role');

-- ─── halcyon_developments lookup table ─────────────────────────────────────────

CREATE TABLE halcyon_developments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  dev_name text NOT NULL UNIQUE,
  project_code text NOT NULL,
  aep integer NOT NULL,
  trustee_entity text NOT NULL
);

ALTER TABLE halcyon_developments ENABLE ROW LEVEL SECURITY;

-- Only service role writes; authenticated users can read (needed for portal)
CREATE POLICY "Authenticated users can read developments" ON halcyon_developments
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Service role full access to developments" ON halcyon_developments
  FOR ALL
  USING (auth.role() = 'service_role');

INSERT INTO halcyon_developments (dev_name, project_code, aep, trustee_entity) VALUES
  ('Halcyon Promenade', '2110', 240, 'Stockland LLC No. 2 Pty Ltd ACN 651 781 556 in its capacity as trustee for the Stockland LLC Burpengary Trust'),
  ('Halcyon Edgebrook',  '2113', 233, 'Stockland LLC No. 4 Pty Ltd ACN 657 303 501 in its capacity as trustee for the GRRP LLC Crystal Trust'),
  ('Halcyon Vista',      '2114', 220, 'Stockland LLC No. 4 Pty Ltd ACN 657 303 501 in its capacity as trustee for the GRRP LLC Crystal Trust'),
  ('Halcyon Dales',      '2115', 251, 'Stockland LLC Halcyon Dales Pty Ltd ACN 641 671 507'),
  ('Halcyon Serrata',    '2116', 240, 'Stockland LLC No. 2 Pty Ltd ACN 651 781 556 in its capacity as trustee for the Stockland LLC Burpengary Trust'),
  ('Halcyon Coves',      '2117', 259, 'Stockland LLC No. 4 Pty Ltd ACN 657 303 501 in its capacity as trustee for the GRRP LLC Crystal Trust'),
  ('Halcyon Providence', '2119', 217, 'Stockland LLC No. 4 Pty Ltd ACN 657 303 501 in its capacity as trustee for the SLLP1 Providence Trust'),
  ('Halcyon Yandina',    '2120', 248, 'Halcyon TF Pty Ltd (ACN: 64 6217 594)');

-- ─── add extracted_fields column to projects ───────────────────────────────────

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS extracted_fields jsonb;
