CREATE TABLE projects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organisations(id),
  template_id uuid,
  submitted_by uuid NOT NULL REFERENCES users(id),
  assigned_consultant_id uuid REFERENCES users(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'submitted', 'assigned', 'in_review', 'qa',
    'approved', 'dispatched', 'delivered', 'complete'
  )),
  project_number text,
  po_number text,
  delivery_recipient_email text,
  expected_delivery_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can read their org projects" ON projects
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Consultants can read assigned projects" ON projects
  FOR SELECT USING (
    assigned_consultant_id = auth.uid()
  );

CREATE POLICY "Super admins can manage projects" ON projects
  FOR ALL USING (
    (auth.jwt() ->> 'app_role')::text = 'super_admin'
  )
  WITH CHECK (
    (auth.jwt() ->> 'app_role')::text = 'super_admin'
  );

CREATE POLICY "Service role has full access" ON projects
  USING (auth.role() = 'service_role');

-- Wire the FK deferred in the notifications migration
ALTER TABLE notifications
  ADD CONSTRAINT notifications_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
