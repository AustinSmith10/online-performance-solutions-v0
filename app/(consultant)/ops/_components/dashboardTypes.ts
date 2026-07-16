import type { ReviewRow, PbdbFile, RevisionProject } from "./RevisionReviewDrawer";

export interface DashboardProject {
  id: string;
  href: string;
  label: string;
  clientName: string | null;
  submitterName: string | null;
  statusLabel: string;
  statusClassName: string;
  expectedDeliveryLabel: string | null;
  submittedLabel: string;
  isOverdue: boolean;
  isPending: boolean;
  isRevision: boolean;
  pendingAssignment?: { projectId: string };
  revisionReview?: { project: RevisionProject; reviews: ReviewRow[]; pbdbFile: PbdbFile | null };
}

export interface DashboardAvailableProject {
  id: string;
  label: string;
  clientName: string | null;
  submittedLabel: string;
  expectedDeliveryLabel: string | null;
}

export interface DashboardData {
  pendingAssignments: DashboardProject[];
  active: DashboardProject[];
  withStakeholders: DashboardProject[];
  archive: DashboardProject[];
  available: DashboardAvailableProject[];
}
