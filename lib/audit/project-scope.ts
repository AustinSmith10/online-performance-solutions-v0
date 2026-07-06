import { CATEGORIES } from "./taxonomy";

// Events excluded from the project-scoped audit trail (consultant view + its
// CSV export): financial ledger events (project_id-tagged but not evidentiary
// for the consultant, see #43) and email-deliverability internals that never
// reach a project's inbox anyway.
export const PROJECT_AUDIT_EXCLUDED_EVENTS = [
  ...CATEGORIES.credit.events,
  "email.thread_reply_invalid",
  "email.whitelist_blocked",
];
