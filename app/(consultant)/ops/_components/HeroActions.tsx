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
import { OverduePill } from "@/components/OverduePill";

function ChevronToggle({ expanded }: { expanded: boolean }) {
  return (
    <svg className={`h-3 w-3 transition-transform duration-200 ease-[var(--ease-out)] motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
    </svg>
  );
}

interface HeroAction {
  subtitle: React.ReactNode;
  action: React.ReactNode;
  expanded: React.ReactNode;
}

// Labels arrive as "250012 — Site 036, 85 Twists Road, …". Shown as two pieces
// (mono project number, then the address) instead of dash-separated text, so
// a banner reads "status · number address" without stacked em dashes.
function ProjectLabel({ label }: { label: string }) {
  const m = label.match(/^(\S+) — (.+)$/);
  if (!m) return <span className="min-w-0 break-words">{label}</span>;
  return (
    <span className="min-w-0 break-words">
      <span className="font-mono tabular-nums text-zinc-800">{m[1]}</span>
      <span className="ml-2">{m[2]}</span>
    </span>
  );
}

// One-item hero subtitle: an optional plain lead ("Revision requested"), the
// shared OverduePill when overdue, then the project. Status is a word or a
// pill, never punctuation.
function HeroSubtitle({
  lead,
  leadClassName,
  overdueDays,
  label,
}: {
  lead?: string;
  leadClassName?: string;
  overdueDays?: number | null;
  label: string;
}) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      {lead && <span className={`shrink-0 font-medium ${leadClassName ?? ""}`}>{lead}</span>}
      {overdueDays !== null && overdueDays !== undefined && <OverduePill days={overdueDays} className="shrink-0" />}
      <ProjectLabel label={label} />
    </span>
  );
}

export function useAssignmentHeroAction(items: DashboardProject[]): HeroAction | null {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;

  if (items.length === 1) {
    const item = items[0];
    return {
      subtitle: <HeroSubtitle lead="Respond to assignment" leadClassName="text-amber-900" label={item.label} />,
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
        className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white press hover:bg-amber-700"
      >
        Respond (<span className="tabular-nums">{items.length}</span>)
        <ChevronToggle expanded={expanded} />
      </button>
    ),
    expanded: expanded && (
      <div className="rise-in mt-3 divide-y divide-amber-200/70 border-t border-amber-200 pt-1">
        {items.map((item) => (
          <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="min-w-0 break-words text-sm text-amber-900">{item.label}</span>
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
      className="shrink-0 rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700 press hover:bg-red-50"
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
      subtitle: (
        <HeroSubtitle
          lead={item.isRevision ? "Revision requested" : undefined}
          leadClassName="text-red-900"
          overdueDays={item.isOverdue ? item.daysOverdue : null}
          label={item.label}
        />
      ),
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
        className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white press hover:bg-red-700"
      >
        Review (<span className="tabular-nums">{items.length}</span>)
        <ChevronToggle expanded={expanded} />
      </button>
    ),
    expanded: expanded && (
      <div className="rise-in mt-3 divide-y divide-red-200/70 border-t border-red-200 pt-1">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 py-2">
            <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm text-red-900">
              <span className="min-w-0 break-words">{item.label}</span>
              {item.isOverdue && (
                <OverduePill days={item.daysOverdue} className="shrink-0" />
              )}
            </span>
            <div className="shrink-0">{rowAction(item)}</div>
          </div>
        ))}
      </div>
    ),
  };
}
