-- Lets admins manually mark a needs-attention/hard-error chit as resolved
-- (issue #46 follow-up). Signal ids match TrayEntry.id from
-- lib/notifications/tray.ts (e.g. "job-<uuid>", "bounce-<uuid>",
-- "stalled-<uuid>", "pending-<uuid>", "expiring-<uuid>") so resolution is
-- keyed generically across all five signal types without needing a column
-- on each underlying table — several of which (pgboss.job, projects,
-- stakeholder_reviews) are either foreign-owned or shared with unrelated
-- features, so bolting a "dismissed" flag onto them directly isn't an option.
--
-- Resolving a computed signal (stalled project, pending review, expiring
-- token) mutes that specific signal id until the underlying row changes
-- enough to produce a different signal id or timestamp — it does not
-- prevent the same condition from resurfacing under a new signal_id later
-- (e.g. a review that goes pending again after a fresh token cycle).

CREATE TABLE resolved_signals (
  signal_id   text PRIMARY KEY,
  resolved_by uuid REFERENCES users(id),
  resolved_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE resolved_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access" ON resolved_signals
  USING (auth.role() = 'service_role');
