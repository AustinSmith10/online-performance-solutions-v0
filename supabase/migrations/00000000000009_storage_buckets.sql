INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'templates',
  'templates',
  false,
  20971520,
  ARRAY['application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Super admins can upload templates" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'templates'
    AND (auth.jwt() ->> 'app_role')::text = 'super_admin'
  );

CREATE POLICY "Super admins can read templates" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'templates'
    AND (auth.jwt() ->> 'app_role')::text = 'super_admin'
  );

CREATE POLICY "Service role full access to templates storage" ON storage.objects
  FOR ALL
  USING (bucket_id = 'templates' AND auth.role() = 'service_role')
  WITH CHECK (bucket_id = 'templates' AND auth.role() = 'service_role');
