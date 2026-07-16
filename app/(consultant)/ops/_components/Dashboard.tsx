"use client";

// The consultant "My projects" dashboard — mirrors the visual language
// PortalDashboard established for clients (Tile summary strip, CompactHero
// "Right now" banner, rounded-xl project rows) so consultants and clients
// read as the same product.

import { useState } from "react";
import Link from "next/link";
import { InlineAssignmentActions } from "./InlineAssignmentActions";
import { RevisionReviewDrawer } from "./RevisionReviewDrawer";
import { SelfAssignButton } from "./SelfAssignButton";
import { useAssignmentHeroAction, useReviewHeroAction } from "./HeroActions";
import type { DashboardData, DashboardProject } from "./dashboardTypes";

export function Tile({
  tone,
  label,
  value,
}: {
  tone: "neutral" | "amber" | "green" | "zinc";
  label: string;
  value: number;
}) {
  const classes = {
    neutral: "border-blue-200 bg-blue-50 text-blue-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    green: "border-green-200 bg-green-50 text-green-900",
    zinc: "border-zinc-200 bg-white text-zinc-900",
  }[tone];
  return (
    <div className={`rounded-xl border p-4 ${classes}`}>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs font-medium opacity-80">{label}</p>
    </div>
  );
}

export function CompactHero({
  tone,
  subtitle,
  action,
  expanded,
}: {
  tone: "amber" | "red" | "neutral";
  subtitle: string;
  action?: React.ReactNode;
  expanded?: React.ReactNode;
}) {
  const classes = {
    amber: "border-amber-200 bg-amber-50",
    red: "border-red-200 bg-red-50",
    neutral: "border-blue-200 bg-blue-50",
  }[tone];
  const titleClasses = {
    amber: "text-amber-900",
    red: "text-red-900",
    neutral: "text-blue-900",
  }[tone];
  return (
    <div className={`rounded-lg border px-4 py-2.5 ${classes}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className={`shrink-0 whitespace-nowrap text-sm font-semibold ${titleClasses}`}>Right now</span>
          <span className="truncate text-xs text-zinc-500">{subtitle}</span>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {expanded}
    </div>
  );
}

export function ProjectRow({ p }: { p: DashboardProject }) {
  const accent = p.isPending
    ? "border-amber-300 bg-amber-50"
    : p.isRevision
      ? "border-red-300 bg-red-50"
      : "border-zinc-200 bg-white";
  return (
    <div className={`rounded-xl border p-5 ${accent}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {p.isPending ? (
            <span className="truncate text-base font-semibold text-zinc-900">{p.label}</span>
          ) : (
            <Link href={p.href} className="truncate text-base font-semibold text-zinc-900 hover:underline">
              {p.label}
            </Link>
          )}
          <p className="mt-0.5 truncate text-xs text-zinc-500">
            {[p.clientName, p.isPending ? "assigned to you" : p.submitterName].filter(Boolean).join(" · ")}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {p.expectedDeliveryLabel ? `Expected ${p.expectedDeliveryLabel}` : "No delivery date set"}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${p.statusClassName}`}>{p.statusLabel}</span>
          {p.isOverdue && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Overdue</span>
          )}
        </div>
      </div>
      {p.revisionReview && (
        <div className="mt-3 flex items-center gap-2 border-t border-red-200 pt-3">
          <RevisionReviewDrawer
            project={p.revisionReview.project}
            reviews={p.revisionReview.reviews}
            pbdbFile={p.revisionReview.pbdbFile}
          />
        </div>
      )}
      {p.pendingAssignment && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-amber-200 pt-3">
          <InlineAssignmentActions projectId={p.pendingAssignment.projectId} label={p.label} />
        </div>
      )}
    </div>
  );
}

type SectionKey = "active" | "stakeholders" | "archive" | "available";

export function Dashboard({ data }: { data: DashboardData }) {
  const { pendingAssignments, active, withStakeholders, archive, available } = data;
  const [section, setSection] = useState<SectionKey>("active");

  const revisions = active.filter((p) => p.isRevision);
  // Overdue-but-not-revision projects join the revision hero below rather than
  // getting a third slot — a revision-required project that's also overdue
  // stays counted once, in revisions, not here.
  const overdueOnly = active.filter((p) => p.isOverdue && !p.isRevision);

  const assignmentHero = useAssignmentHeroAction(pendingAssignments);
  const reviewHero = useReviewHeroAction(revisions, overdueOnly);
  const heroCount = [assignmentHero, reviewHero].filter(Boolean).length;
  const heroGridClass = heroCount === 2 ? "md:grid-cols-2" : "";

  const sections: { key: SectionKey; label: string; count: number }[] = [
    { key: "active", label: "Active", count: pendingAssignments.length + active.length },
    { key: "stakeholders", label: "With stakeholders", count: withStakeholders.length },
    { key: "archive", label: "Archive", count: archive.length },
    { key: "available", label: "Available jobs", count: available.length },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">My projects</h1>
        <Link
          href="/ops/projects/submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          Submit request
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile tone={pendingAssignments.length > 0 ? "amber" : "zinc"} label="Needs your response" value={pendingAssignments.length} />
        <Tile tone="neutral" label="Active" value={active.length} />
        <Tile tone="zinc" label="With stakeholders" value={withStakeholders.length} />
        <Tile tone={available.length > 0 ? "green" : "zinc"} label="Available jobs" value={available.length} />
      </div>

      {/* Two hero slots: pending assignment (a decision only you can make) and
          "needs review" (revision-required + overdue, both need your eyes even
          though only revision-required needs the review drawer). Both render
          side by side when both apply, same pattern as the client portal's
          pending-review / ready-to-download heroes. Each hero's action is a
          single control when there's one item, or an expand-in-place picker
          when there's more than one (see HeroActions.tsx) — never "act on the
          first, ignore the rest". */}
      {heroCount > 0 ? (
        <div className={`grid grid-cols-1 gap-3 ${heroGridClass}`}>
          {assignmentHero && (
            <CompactHero tone="amber" subtitle={assignmentHero.subtitle} action={assignmentHero.action} expanded={assignmentHero.expanded} />
          )}
          {reviewHero && (
            <CompactHero tone="red" subtitle={reviewHero.subtitle} action={reviewHero.action} expanded={reviewHero.expanded} />
          )}
        </div>
      ) : (
        <CompactHero tone="neutral" subtitle="You're all caught up — nothing needs your response." />
      )}

      <div className="flex gap-1 rounded-lg border border-zinc-200 bg-white p-1">
        {sections.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSection(s.key)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              section === s.key ? "bg-zinc-900 text-white" : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            {s.label}
            {s.count > 0 && <span className="ml-1.5 opacity-70">({s.count})</span>}
          </button>
        ))}
      </div>

      {section === "active" && (
        <div className="space-y-3">
          {pendingAssignments.length === 0 && active.length === 0 ? (
            <EmptyState title="No active projects" subtitle="Projects will appear here once assigned by your account manager." />
          ) : (
            [...pendingAssignments, ...active].map((p) => <ProjectRow key={p.id} p={p} />)
          )}
        </div>
      )}

      {section === "stakeholders" && (
        <div className="space-y-3">
          {withStakeholders.length === 0 ? (
            <EmptyState title="No projects with stakeholders" subtitle="Projects awaiting stakeholder approval will appear here." />
          ) : (
            withStakeholders.map((p) => <ProjectRow key={p.id} p={p} />)
          )}
        </div>
      )}

      {section === "archive" && (
        <div className="space-y-3">
          {archive.length === 0 ? (
            <EmptyState title="No archived projects" subtitle="Delivered and completed projects will appear here." />
          ) : (
            archive.map((p) => <ProjectRow key={p.id} p={p} />)
          )}
        </div>
      )}

      {section === "available" && (
        <div className="space-y-3">
          {available.length === 0 ? (
            <EmptyState title="No available jobs" subtitle="New submissions will appear here once a client submits a report request." />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {available.map((p) => (
                <div key={p.id} className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <p className="truncate text-sm font-semibold text-zinc-900">{p.label}</p>
                  <p className="mt-0.5 truncate text-xs text-zinc-500">{p.clientName ?? "—"}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Submitted {p.submittedLabel}
                    {p.expectedDeliveryLabel ? ` · Expected ${p.expectedDeliveryLabel}` : ""}
                  </p>
                  <div className="mt-3">
                    <SelfAssignButton projectId={p.id} address={p.label} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center">
      <p className="text-sm font-medium text-zinc-900">{title}</p>
      <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>
    </div>
  );
}
