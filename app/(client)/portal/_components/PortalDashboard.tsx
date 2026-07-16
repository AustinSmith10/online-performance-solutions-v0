"use client";

// Client dashboard body for /portal. Adopts the "workspace" visual language
// established on the project-detail page (ClientWorkspace/StageRail/
// FocusCard/DocGroupCard, app/(client)/portal/projects/[id]/page.tsx)
// instead of the plain rounded-lg card list this page used to render:
// tone-colored summary tiles up top (Needs review / In progress / Ready /
// Credits), a "Right now" hero for the single most urgent item per category,
// and project cards with the same status caption + always-visible
// MiniStepper the project-detail page already uses.

import Link from "next/link";
import { MiniStepper, stepperBadge, stepperActiveIndexOf, stepperNeedsStakeholderAction } from "@/components/delivery/StepperVisuals";
import { DownloadPbdrLink } from "./DownloadPbdrLink";
import { PendingReviewModal } from "./PendingReviewModal";
import { usePendingReviewHeroAction, useReadyDownloadHeroAction } from "./HeroActionMenu";
import type { DashboardData } from "./dashboardTypes";
import type { StepperResult } from "@/lib/delivery/stepper";

function Tile({
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

// Same caption text and color logic the project-detail page's stepper
// already uses (amber = stakeholder needs to act, green = done, blue = in
// progress, zinc = paused/no stepper).
function statusCaption(stepper: StepperResult | null): string | null {
  if (!stepper) return null;
  return stepper.isPaused ? "On hold" : stepper.caption || null;
}

function captionClassName(stepper: StepperResult | null): string {
  if (!stepper || stepper.isPaused) return "text-zinc-500";
  const activeStage = stepper.stages[stepperActiveIndexOf(stepper.stages)];
  if (stepperNeedsStakeholderAction(activeStage)) return "font-medium text-amber-700";
  if (activeStage.visual === "complete") return "text-green-700";
  return "text-blue-700";
}

// Compact banner — same tone vocabulary as FocusCard, one row instead of a
// full card with its own eyebrow + padding. `expanded` is an optional extra
// section rendered below the header row (used by the hero action hooks to
// expand a picker list in place, with no overlay — see HeroActionMenu.tsx).
function CompactHero({
  tone,
  title,
  subtitle,
  action,
  expanded,
}: {
  tone: "neutral" | "amber" | "green";
  title: string;
  subtitle: string;
  action?: React.ReactNode;
  expanded?: React.ReactNode;
}) {
  const classes = {
    neutral: "border-blue-200 bg-blue-50",
    amber: "border-amber-200 bg-amber-50",
    green: "border-green-200 bg-green-50",
  }[tone];
  const titleClasses = {
    neutral: "text-blue-900",
    amber: "text-amber-900",
    green: "text-green-900",
  }[tone];

  return (
    <div className={`rounded-lg border px-4 py-2.5 ${classes}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className={`shrink-0 whitespace-nowrap text-sm font-semibold ${titleClasses}`}>{title}</span>
          <span className="truncate text-xs text-zinc-500">{subtitle}</span>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {expanded}
    </div>
  );
}

export function PortalDashboard({ rows, readyItems, org, readyWindowDays }: DashboardData) {
  const attentionCount = rows.filter((r) => r.pendingReview).length;
  const inProgressCount = rows.filter((r) => !r.pendingReview && !r.isDelivered).length;
  const readyCount = readyItems.length;

  const pendingReviewRows = rows.filter((r) => r.pendingReview);
  const firstPendingReview = pendingReviewRows[0];
  const firstReady = readyItems[0];

  const pendingReviewHero = usePendingReviewHeroAction(
    pendingReviewRows.map((r) => ({
      id: r.id,
      label: r.label,
      reviewId: r.pendingReview!.reviewId,
      expiresAt: r.pendingReview!.expiresAt,
      pbdbDownloadUrl: r.pendingReview!.pbdbDownloadUrl,
      pbdbFilename: r.pendingReview!.pbdbFilename,
    }))
  );
  const readyDownloadHero = useReadyDownloadHeroAction(
    readyItems.map((r) => ({ id: r.id, label: r.label, filename: r.filename }))
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">My report requests</h1>
        <Link
          href="/portal/submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          New report request
        </Link>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile tone={attentionCount > 0 ? "amber" : "zinc"} label="Needs your review" value={attentionCount} />
        <Tile tone="neutral" label="In progress" value={inProgressCount} />
        <Tile tone={readyCount > 0 ? "green" : "zinc"} label={`Ready (${readyWindowDays}d window)`} value={readyCount} />
        {org?.paymentMethod === "credit_deduction" ? (
          <Tile tone={org.creditBalance === 0 ? "amber" : "zinc"} label="Credits remaining" value={org.creditBalance} />
        ) : (
          <Tile tone="zinc" label="Total active" value={rows.length} />
        )}
      </div>

      {/* Right-now banner(s). Pending review and ready-to-download don't
          compete for one slot: when both exist they render as two cards
          side by side on desktop (grid-cols-2) and stacked on mobile
          (grid-cols-1) so neither is hidden. Each card's action button
          resolves "which one do I pick" directly: with exactly one item
          it's a single button; with more than one, clicking it expands the
          card in place to list every project by name — no overlay, same
          component on every screen size (see HeroActionMenu.tsx). */}
      {firstPendingReview || firstReady ? (
        <div className={`grid grid-cols-1 gap-3 ${firstPendingReview && firstReady ? "md:grid-cols-2" : ""}`}>
          {firstPendingReview && (
            <CompactHero
              tone="amber"
              title="Right now"
              subtitle={
                attentionCount > 1
                  ? `Please review — ${firstPendingReview.label} (+${attentionCount - 1} more)`
                  : `Please review — ${firstPendingReview.label}`
              }
              action={pendingReviewHero.button}
              expanded={pendingReviewHero.expanded}
            />
          )}
          {firstReady && (
            <CompactHero
              tone="green"
              title="Right now"
              subtitle={
                readyCount > 1
                  ? `Report ready — ${firstReady.label} (+${readyCount - 1} more)`
                  : `Report ready — ${firstReady.label}`
              }
              action={readyDownloadHero.button}
              expanded={readyDownloadHero.expanded}
            />
          )}
        </div>
      ) : (
        <CompactHero tone="neutral" title="Right now" subtitle="You're all caught up — nothing needs your attention." />
      )}

      {/* Project cards */}
      {rows.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-12 text-center">
          <p className="text-sm font-medium text-zinc-900">No active report requests</p>
          <p className="mt-1 text-sm text-zinc-500">
            Submit a new request or check{" "}
            <Link href="/portal/history" className="underline underline-offset-2">History</Link> for past reports.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const badge = row.stepper ? stepperBadge(row.stepper) : { label: row.statusLabel, className: row.statusClassName };
            const caption = statusCaption(row.stepper);
            const rowAction = (row.isDelivered || row.pendingReview) && (
              <div className="flex shrink-0 items-center gap-2">
                {row.isDelivered && <DownloadPbdrLink projectId={row.id} filename={row.pbdrFilename} />}
                {row.pendingReview && (
                  <PendingReviewModal
                    projectLabel={row.label}
                    reviewId={row.pendingReview.reviewId}
                    projectId={row.id}
                    pbdbDownloadUrl={row.pendingReview.pbdbDownloadUrl}
                    pbdbFilename={row.pendingReview.pbdbFilename}
                    expiresAt={row.pendingReview.expiresAt}
                  />
                )}
              </div>
            );

            return (
              <div key={row.id} className="rounded-xl border border-zinc-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={row.href} className="truncate text-base font-semibold text-zinc-900 hover:underline">
                      {row.label}
                    </Link>
                    {caption && <p className={`mt-0.5 text-xs ${captionClassName(row.stepper)}`}>{caption}</p>}
                    <p className="mt-1 text-xs text-zinc-500">
                      Submitted {row.submittedLabel}
                      {row.expectedDeliveryLabel ? ` · Expected ${row.expectedDeliveryLabel}` : " · No delivery date set"}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${badge.className}`}>
                    {badge.label}
                    {row.stepper?.roundBadge ? ` · Round ${row.stepper.roundBadge}` : ""}
                  </span>
                </div>

                {row.stepper ? (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-4">
                    <div className="min-w-0 flex-1">
                      <MiniStepper
                        stages={row.stepper.stages}
                        showRevisionLoop={row.stepper.showRevisionLoop}
                        roundBadge={row.stepper.roundBadge}
                      />
                    </div>
                    {rowAction}
                  </div>
                ) : (
                  rowAction && <div className="mt-3">{rowAction}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
