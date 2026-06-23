-- ─── drop hardcoded file_type check (now validated against file_requirements) ───

ALTER TABLE project_files
  DROP CONSTRAINT IF EXISTS project_files_file_type_check;

-- ─── file_requirements config table ─────────────────────────────────────────────

CREATE TABLE file_requirements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  max_count integer NOT NULL DEFAULT 1 CHECK (max_count BETWEEN 1 AND 20),
  required boolean NOT NULL DEFAULT true,
  no_duplicates boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE file_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read file requirements" ON file_requirements
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Super admins can manage file requirements" ON file_requirements
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'app_role')::text = 'super_admin')
  WITH CHECK ((auth.jwt() ->> 'app_role')::text = 'super_admin');

-- Seed with existing hardcoded types so existing projects are unaffected
INSERT INTO file_requirements (name, slug, max_count, required, no_duplicates, sort_order) VALUES
  ('Purchase Order',  'po',             1, false, true, 1),
  ('Building Plans',  'building_plans', 1, true,  true, 2);
