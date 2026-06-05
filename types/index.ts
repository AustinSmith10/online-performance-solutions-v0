export type UserRole = "super_admin" | "consultant" | "client";

export type ProjectStatus =
  | "draft"
  | "submitted"
  | "assigned"
  | "in_review"
  | "qa"
  | "approved"
  | "dispatched"
  | "delivered"
  | "complete";

export type PaymentMethod = "upfront" | "credit_deduction" | "deferred";

export type ConsultantAvailability = "available" | "on_leave" | "at_capacity";

export type NotificationChannel = "email" | "dashboard";

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
  delivery_timeline_days: number;
  created_at: string;
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
  created_at: string;
  updated_at: string;
}

export interface Template {
  id: string;
  org_id: string;
  name: string;
  file_path: string;
  is_active: boolean;
  created_at: string;
}

export interface Stakeholder {
  id: string;
  name: string;
  email: string;
  company: string | null;
  metadata: Record<string, unknown>;
  is_active: boolean;
}
