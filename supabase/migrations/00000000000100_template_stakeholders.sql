-- Per-template required reviewers: a fixed subset of a client's org-scoped
-- `stakeholders` roster that must always be added as reviewers on any project
-- built from this template (e.g. Stockland's certifier). Locked at the project
-- level — never removable per-project, only added-to via project-scope rows.
CREATE TABLE template_stakeholders (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id    uuid NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  stakeholder_id uuid NOT NULL REFERENCES stakeholders(id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(template_id, stakeholder_id)
);

CREATE INDEX template_stakeholders_template_idx ON template_stakeholders(template_id);
CREATE INDEX template_stakeholders_stakeholder_idx ON template_stakeholders(stakeholder_id);
