export type UserRole = "super_admin" | "consultant" | "client";

export type ProjectStatus =
  | "draft"
  | "submitted"
  | "assigned"
  | "in_progress"
  | "dispatched"
  | "revision_required"
  | "converting"
  | "delivered"
  | "complete"
  | "paused";

export type PaymentMethod = "upfront" | "credit_deduction" | "deferred";

export type ConsultantAvailability = "available" | "on_leave" | "at_capacity";

export type NotificationType =
  | "acknowledgement"
  | "approval_request"
  | "modifications_requested"
  | "pbdr_delivery"
  | "credit_deduction"
  | "low_credit"
  | "insufficient_credit"
  | "payment_override"
  | "assignment_required"
  | "consultant_assigned"
  | "project_submitted"
  | "project_approved"
  | "project_dispatched"
  | "qa_complete"
  | "all_acknowledged"
  | "modifications_requested"
  | "stakeholder_waived"
  | "review_response_recorded"
  | "system_error";

export type CreditEventType =
  | "top_up"
  | "deduction"
  | "deferred_debit"
  | "upfront_log"
  | "override";

export interface AuditLogEntry {
  id: string;
  event_type: string;
  actor_id: string | null;
  actor_email: string | null;
  project_id: string | null;
  org_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface CreditLedgerEntry {
  id: string;
  org_id: string;
  project_id: string | null;
  event_type: CreditEventType;
  amount: number;
  balance_after: number;
  performed_by: string | null;
  notes: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  recipient_id: string;
  project_id: string | null;
  type: NotificationType;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  company_role: string | null;
  state_territory: string | null;
  role: UserRole;
  org_id: string | null;
  availability: ConsultantAvailability;
  is_locked: boolean;
  totp_enabled: boolean;
  profile_complete: boolean;
  failed_login_count: number;
  invited_at: string | null;
  created_at: string;
}

export interface Organisation {
  id: string;
  name: string;
  slug: string;
  payment_method: PaymentMethod;
  credit_balance: number;
  credit_limit: number;
  deferred_balance: number;
  delivery_working_days: number;
  state_territory: string | null;
  abandoned_draft_days: number;
  is_frozen: boolean;
  email_whitelist: string[];
  org_config: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  org_id: string;
  template_id: string;
  submitted_by: string;
  assigned_consultant_id: string | null;
  status: ProjectStatus;
  project_number: string | null;
  po_number: string | null;
  delivery_recipient_email: string | null;
  expected_delivery_date: string | null;
  credit_deducted: boolean;
  payment_override: boolean;
  payment_override_reason: string | null;
  payment_override_at: string | null;
  payment_override_by: string | null;
  review_cycle: number;
  first_response_at: string | null;
  review_buffer_fired_at: string | null;
  deleted_at: string | null;
  paused_at: string | null;
  paused_previous_status: string | null;
  pause_reason: string | null;
  created_at: string;
  updated_at: string;
}

export type TemplateStatus = "draft" | "active" | "inactive";

export interface Template {
  id: string;
  org_id: string;
  name: string;
  storage_path: string;
  status: TemplateStatus;
  created_by: string;
  created_at: string;
}

export interface TemplateFieldMapping {
  id: string;
  template_id: string;
  placeholder_token: string;
  field_key: string | null;
  is_mapped: boolean;
  display_label: string | null;
  extraction_hint: string | null;
  is_required: boolean;
  sort_order: number;
  created_at: string;
}

export interface Stakeholder {
  id: string;
  scope: "org" | "project";
  scope_id: string;
  name: string;
  email: string;
  company: string | null;
  metadata: Record<string, unknown>;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export type StakeholderReviewStatus =
  | "pending"
  | "approved_without_comments"
  | "approved_with_comments"
  | "rejected_with_comments"
  | "waived";

export interface StakeholderReview {
  id: string;
  project_id: string;
  review_cycle: number;
  stakeholder_email: string;
  stakeholder_name: string;
  token: string;
  dispatched_at: string;
  expires_at: string;
  fresh_token_sent_at: string | null;
  status: StakeholderReviewStatus;
  comments: string | null;
  responded_at: string | null;
  waived_by: string | null;
  waive_reason: string | null;
  waived_at: string | null;
  created_at: string;
}
