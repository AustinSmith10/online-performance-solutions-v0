-- #105: consultant per-flag acknowledgment, tracked independently of the
-- stakeholder's resolution status (a flag can be acknowledged whether it's
-- still open-at-default or already resolved).
alter table field_flags
  add column consultant_acknowledged_at timestamptz,
  add column consultant_acknowledged_by uuid references users(id);
