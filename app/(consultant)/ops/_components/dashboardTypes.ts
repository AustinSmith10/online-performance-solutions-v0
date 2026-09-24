import type { ReviewRow, PbdbFile, RevisionProject } from "./RevisionReviewDrawer";
import type { SectionKey } from "./dashboardList";

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
  /** Whole calendar days past the expected delivery date (0 when not overdue). */
  daysOverdue: number;
  isPending: boolean;
  isRevision: boolean;
  hasVerificationMismatch: boolean;
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

export interface DashboardCounts {
  /** Pending assignments + accepted active projects. */
  active: number;
  stakeholders: number;
  archive: number;
  available: number;
  pending: number;
}

// The dashboard is URL-driven (?tab=&page=&q=): the server sends only the
// current page of the current tab, plus everything the "Right now" banners
// need regardless of page, plus unfiltered totals for the tab labels/tiles.
export interface DashboardData {
  tab: SectionKey;
  q: string;
  page: number;
  pageCount: number;
  /** Rows matching the search in the current tab (before paging). */
  total: number;
  counts: DashboardCounts;
  /** All pending assignments (banner). */
  pendingAssignments: DashboardProject[];
  /** All revision-required + overdue projects in the active bucket (banner). */
  attention: DashboardProject[];
  /** Current page of accepted projects for the active/stakeholders/archive tabs. */
  rows: DashboardProject[];
  /** Current page of available jobs for the available tab. */
  available: DashboardAvailableProject[];
}
