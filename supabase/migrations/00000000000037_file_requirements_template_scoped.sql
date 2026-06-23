-- ─── replace global file_requirements with template-scoped version ───────────────

DROP TABLE IF EXISTS file_requirements;

CREATE TABLE file_requirements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id uuid NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  max_count integer NOT NULL DEFAULT 1 CHECK (max_count BETWEEN 1 AND 20),
  required boolean NOT NULL DEFAULT true,
  no_duplicates boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(template_id, slug)
);

ALTER TABLE file_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read file requirements" ON file_requirements
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Super admins can manage file requirements" ON file_requirements
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'app_role')::text = 'super_admin')
  WITH CHECK ((auth.jwt() ->> 'app_role')::text = 'super_admin');
