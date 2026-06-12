CREATE TABLE templates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organisations(id),
  name text NOT NULL,
  storage_path text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'inactive')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage templates" ON templates
  FOR ALL USING (
    (auth.jwt() ->> 'app_role')::text = 'super_admin'
  )
  WITH CHECK (
    (auth.jwt() ->> 'app_role')::text = 'super_admin'
  );

CREATE POLICY "Service role has full access to templates" ON templates
  USING (auth.role() = 'service_role');

CREATE TABLE template_field_mappings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id uuid NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  placeholder_token text NOT NULL,
  field_key text,
  is_mapped boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(template_id, placeholder_token)
);

ALTER TABLE template_field_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage template mappings" ON template_field_mappings
  FOR ALL USING (
    (auth.jwt() ->> 'app_role')::text = 'super_admin'
  )
  WITH CHECK (
    (auth.jwt() ->> 'app_role')::text = 'super_admin'
  );

CREATE POLICY "Service role has full access to template mappings" ON template_field_mappings
  USING (auth.role() = 'service_role');

-- Wire the FK on projects that was left unresolved
ALTER TABLE projects
  ADD CONSTRAINT projects_template_id_fkey
  FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE SET NULL;
