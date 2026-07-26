-- Opt-in link from a client_config document token (e.g. ORG_CERTIFIER_NAME)
-- to a specific field on an org-scoped stakeholders roster entry. When
-- linked, document generation pulls the live roster value instead of the
-- static client_config string, so editing the roster entry once keeps both
-- the printed document and the approval requirement in sync. Most tokens
-- will never have a row here — linking is per-token and explicit.
CREATE TABLE client_config_token_links (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id      uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  token          text NOT NULL,
  stakeholder_id uuid NOT NULL REFERENCES stakeholders(id) ON DELETE RESTRICT,
  field          text NOT NULL CHECK (field IN ('name', 'email', 'company')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id, token)
);

CREATE INDEX client_config_token_links_client_idx ON client_config_token_links(client_id);
CREATE INDEX client_config_token_links_stakeholder_idx ON client_config_token_links(stakeholder_id);
