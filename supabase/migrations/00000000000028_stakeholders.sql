-- Issue #17: Stakeholder tables, approval tokens, and review tracking.

-- New columns on projects for review cycle tracking
ALTER TABLE projects
  ADD COLUMN review_cycle int NOT NULL DEFAULT 1,
  ADD COLUMN first_response_at timestamptz,
  ADD COLUMN review_buffer_fired_at timestamptz;

-- Org-level default stakeholder list
CREATE TABLE org_stakeholders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  company text,
  metadata jsonb NOT NULL DEFAULT '{}',
  is_active bool NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Template-level stakeholder overrides
CREATE TABLE template_stakeholders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id uuid NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  company text,
  metadata jsonb NOT NULL DEFAULT '{}',
  is_active bool NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Project-level stakeholder overrides
CREATE TABLE project_stakeholders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  company text,
  metadata jsonb NOT NULL DEFAULT '{}',
  is_active bool NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Per-dispatch approval tokens (one per stakeholder per review cycle)
CREATE TABLE approval_tokens (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  review_cycle int NOT NULL DEFAULT 1,
  stakeholder_email text NOT NULL,
  stakeholder_name text NOT NULL,
  token text NOT NULL UNIQUE,
  dispatched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  is_fresh_token bool NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX approval_tokens_token_idx ON approval_tokens(token);
CREATE INDEX approval_tokens_project_cycle_idx ON approval_tokens(project_id, review_cycle);

-- Per-stakeholder review records (one per stakeholder per review cycle)
CREATE TABLE stakeholder_reviews (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  review_cycle int NOT NULL DEFAULT 1,
  stakeholder_email text NOT NULL,
  stakeholder_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'acknowledged', 'modifications_requested', 'waived')),
  comments text,
  responded_at timestamptz,
  waived_by uuid REFERENCES users(id),
  waive_reason text,
  waived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, review_cycle, stakeholder_email)
);

CREATE INDEX stakeholder_reviews_project_cycle_idx ON stakeholder_reviews(project_id, review_cycle);
