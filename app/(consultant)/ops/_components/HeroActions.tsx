"use client";

// Backs the two "Right now" heroes on the ops dashboard (pending assignment,
// revision required/overdue). With exactly one item, the hero's action slot
// is just that item's normal control; with more than one, it's a toggle that
// expands the hero downward into a list, each row with its own control — no
// overlay, and acting on any one of them doesn't require leaving the hero.
// Same expand-in-place pattern as the client portal's HeroActionMenu.tsx.

import { useState } from "react";
import Link from "next/link";
import { InlineAssignmentActions } from "./InlineAssignmentActions";
import { RevisionReviewDrawer } from "./RevisionReviewDrawer";
import type { DashboardProject } from "./dashboardTypes";

function ChevronToggle({ expanded }: { expanded: boolean }) {
  return (
    <svg className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
    </svg>
  );
}

interface HeroAction {
  subtitle: string;
  action: React.ReactNode;
  expanded: React.ReactNode;
}

export function useAssignmentHeroAction(items: DashboardProject[]): HeroAction | null {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;

  if (items.length === 1) {
    const item = items[0];
    return {
      subtitle: `Respond to assignment — ${item.label}`,
      action: (
        <div className="flex flex-wrap items-center gap-2">
          <InlineAssignmentActions projectId={item.pendingAssignment!.projectId} label={item.label} />
        </div>
      ),
      expanded: null,
    };
  }

  return {
    subtitle: `${items.length} assignments waiting on your response`,
    action: (
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-amber-700"
      >
        Respond ({items.length})
        <ChevronToggle expanded={expanded} />
      </button>
    ),
    expanded: expanded && (
      <div className="mt-3 divide-y divide-amber-200/70 border-t border-amber-200 pt-1">
        {items.map((item) => (
          <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="min-w-0 truncate text-sm text-amber-900">{item.label}</span>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <InlineAssignmentActions projectId={item.pendingAssignment!.projectId} label={item.label} />
            </div>
          </div>
        ))}
      </div>
    ),
  };
}

// Revision-required and plain-overdue share one "needs review" hero rather
// than competing for a second slot — an overdue-but-not-revision project
// still isn't a decision owed the way a client-rejected revision is, so its
// row gets a small "Overdue" tag and a "View →" link instead of the
// "Review →" drawer trigger, but it lives in the same list.
function rowAction(item: DashboardProject) {
  if (item.isRevision && item.revisionReview) {
    return (
      <RevisionReviewDrawer
        project={item.revisionReview.project}
        reviews={item.revisionReview.reviews}
        pbdbFile={item.revisionReview.pbdbFile}
      />
    );
  }
  return (
    <Link
      href={item.href}
      className="shrink-0 rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
    >
      View →
    </Link>
  );
}

export function useReviewHeroAction(revisionItems: DashboardProject[], overdueItems: DashboardProject[]): HeroAction | null {
  const [expanded, setExpanded] = useState(false);
  const items = [...revisionItems, ...overdueItems];
  if (items.length === 0) return null;

  if (items.length === 1) {
    const item = items[0];
    return {
      subtitle: item.isRevision
        ? `${item.isOverdue ? "Overdue revision" : "Revision"} requested — ${item.label}`
        : `Overdue — ${item.label}`,
      action: rowAction(item),
      expanded: null,
    };
  }

  const overdueCount = items.filter((i) => i.isOverdue).length;
  return {
    subtitle: `${items.length} projects need review${overdueCount > 0 ? ` (${overdueCount} overdue)` : ""}`,
    action: (
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-red-700"
      >
        Review ({items.length})
        <ChevronToggle expanded={expanded} />
      </button>
    ),
    expanded: expanded && (
      <div className="mt-3 divide-y divide-red-200/70 border-t border-red-200 pt-1">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 py-2">
            <span className="flex min-w-0 items-center gap-1.5 truncate text-sm text-red-900">
              <span className="min-w-0 truncate">{item.label}</span>
              {item.isOverdue && (
                <span className="shrink-0 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
                  Overdue
                </span>
              )}
            </span>
            <div className="shrink-0">{rowAction(item)}</div>
          </div>
        ))}
      </div>
    ),
  };
}
