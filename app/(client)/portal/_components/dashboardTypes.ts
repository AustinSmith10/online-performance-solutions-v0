import type { StepperResult } from "@/lib/delivery/stepper";
import type { PaymentMethod } from "@/types";

export interface PendingReviewInfo {
  reviewId: string;
  expiresAt: string;
  pbdbDownloadUrl: string;
  pbdbFilename?: string;
}

export interface DashboardRow {
  id: string;
  href: string;
  label: string;
  statusLabel: string;
  statusClassName: string;
  stepper: StepperResult | null;
  submittedLabel: string;
  expectedDeliveryLabel: string | null;
  isDelivered: boolean;
  pbdrFilename?: string;
  pendingReview?: PendingReviewInfo;
}

export interface DashboardReadyItem {
  id: string;
  label: string;
  href: string;
  filename?: string;
  daysLeft: number;
}

export interface DashboardOrgSummary {
  paymentMethod: PaymentMethod;
  creditBalance: number;
}

export interface DashboardData {
  rows: DashboardRow[];
  readyItems: DashboardReadyItem[];
  org: DashboardOrgSummary | null;
  readyWindowDays: number;
}
