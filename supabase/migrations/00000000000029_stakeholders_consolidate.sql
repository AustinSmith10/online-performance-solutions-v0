-- Consolidate 5 stakeholder tables → 2.
-- Drops the tables from migration 28 and replaces with:
--   stakeholders        — scoped config table (replaces org/template/project variants)
--   stakeholder_reviews — merged review + token record (replaces approval_tokens)

DROP TABLE IF EXISTS approval_tokens;
DROP TABLE IF EXISTS stakeholder_reviews;
DROP TABLE IF EXISTS project_stakeholders;
DROP TABLE IF EXISTS template_stakeholders;
DROP TABLE IF EXISTS org_stakeholders;

-- Single scoped stakeholder config table.
-- scope='org'     → scope_id is organisations.id
-- scope='project' → scope_id is projects.id
CREATE TABLE stakeholders (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  scope      text NOT NULL CHECK (scope IN ('org', 'project')),
  scope_id   uuid NOT NULL,
  name       text NOT NULL,
  email      text NOT NULL,
  company    text,
  metadata   jsonb NOT NULL DEFAULT '{}',
  is_active  bool NOT NULL DEFAULT true,
  sort_order int  NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX stakeholders_scope_idx ON stakeholders(scope, scope_id);

-- Per-stakeholder review record, one per stakeholder per review cycle.
-- Token fields live here — fresh token issuance updates the row in-place.
CREATE TABLE stakeholder_reviews (
  id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id           uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  review_cycle         int  NOT NULL DEFAULT 1,
  stakeholder_email    text NOT NULL,
  stakeholder_name     text NOT NULL,
  token                text NOT NULL UNIQUE,
  dispatched_at        timestamptz NOT NULL DEFAULT now(),
  expires_at           timestamptz NOT NULL,
  fresh_token_sent_at  timestamptz,
  status               text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'acknowledged', 'modifications_requested', 'waived')),
  comments             text,
  responded_at         timestamptz,
  waived_by            uuid REFERENCES users(id),
  waive_reason         text,
  waived_at            timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, review_cycle, stakeholder_email)
);

CREATE INDEX stakeholder_reviews_token_idx        ON stakeholder_reviews(token);
CREATE INDEX stakeholder_reviews_project_cycle_idx ON stakeholder_reviews(project_id, review_cycle);
