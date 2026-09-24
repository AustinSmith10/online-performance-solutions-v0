import type { ReviewRow, PbdbFile, RevisionProject } from "./RevisionReviewDrawer";
import type { SectionKey } from "./dashboardList";
import type { RoundSummary } from "@/lib/stakeholders/round-summary";

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
  /** Current review round progress, for projects out with (or bounced by) stakeholders. */
  tally?: RoundSummary;
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

/** One tab's first page, unfiltered: what the client shows instantly on a tab click. */
export interface TabSlice {
  rows: DashboardProject[];
  available: DashboardAvailableProject[];
  total: number;
  pageCount: number;
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
  /**
   * Page 1 (no search) of every tab. Switching tabs with no search active reads
   * from here on the client, so it is instant; only searching and paging beyond
   * page 1 go back to the server.
   */
  preloaded: Record<SectionKey, TabSlice>;
}
