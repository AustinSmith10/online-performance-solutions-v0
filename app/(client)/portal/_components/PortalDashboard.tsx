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
import { useEffect, useRef, useState } from "react";
import { MiniStepper, stepperBadge, stepperActiveIndexOf, stepperNeedsStakeholderAction } from "@/components/delivery/StepperVisuals";
import { DownloadPbdrLink } from "./DownloadPbdrLink";
import { PendingReviewModal } from "./PendingReviewModal";
import { usePendingReviewHeroAction, useReadyDownloadHeroAction } from "./HeroActionMenu";
import { TourHighlight } from "@/components/onboarding-tour/TourHighlight";
import type { DashboardData, DashboardRow } from "./dashboardTypes";
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

type RowCategory = "needs_review" | "in_progress" | "delivered";

function rowCategory(row: DashboardRow): RowCategory {
  if (row.pendingReview) return "needs_review";
  if (row.isDelivered) return "delivered";
  return "in_progress";
}

type SortOption = "priority" | "newest" | "oldest" | "delivery";

const SORT_LABELS: Record<SortOption, string> = {
  priority: "Needs attention first",
  newest: "Newest first",
  oldest: "Oldest first",
  delivery: "Expected delivery",
};

function sortRows(rows: DashboardRow[], sortBy: SortOption): DashboardRow[] {
  if (sortBy === "priority") return rows;
  const sorted = [...rows];
  if (sortBy === "newest") {
    sorted.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  } else if (sortBy === "oldest") {
    sorted.sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime());
  } else if (sortBy === "delivery") {
    sorted.sort((a, b) => {
      if (!a.expectedDeliveryAt && !b.expectedDeliveryAt) return 0;
      if (!a.expectedDeliveryAt) return 1;
      if (!b.expectedDeliveryAt) return -1;
      return new Date(a.expectedDeliveryAt).getTime() - new Date(b.expectedDeliveryAt).getTime();
    });
  }
  return sorted;
}

// Canonical delivery-step options for the filter panel, in stepper order.
// "draft" covers the (rare) not-yet-submitted row, which has no stepper.
const STEP_OPTIONS: { key: string; label: string }[] = [
  { key: "draft", label: "Not yet submitted" },
  { key: "submitted", label: "Submitted" },
  { key: "prepared", label: "Being prepared" },
  { key: "review", label: "Awaiting your review" },
  { key: "finalizing", label: "Finalizing" },
  { key: "delivered", label: "Delivered" },
];

function rowStepKey(row: DashboardRow): string {
  if (!row.stepper) return "draft";
  return row.stepper.stages[stepperActiveIndexOf(row.stepper.stages)].key;
}

type Filters = {
  statuses: string[];
  steps: string[];
  submittedFrom: string;
  submittedTo: string;
  expectedFrom: string;
  expectedTo: string;
};

const EMPTY_FILTERS: Filters = {
  statuses: [],
  steps: [],
  submittedFrom: "",
  submittedTo: "",
  expectedFrom: "",
  expectedTo: "",
};

function isFilterActive(f: Filters): boolean {
  return (
    f.statuses.length > 0 ||
    f.steps.length > 0 ||
    f.submittedFrom !== "" ||
    f.submittedTo !== "" ||
    f.expectedFrom !== "" ||
    f.expectedTo !== ""
  );
}

// Date-only comparisons: an ISO timestamp's calendar date (in the viewer's
// local time, same as submittedLabel/expectedDeliveryLabel) against a plain
// yyyy-mm-dd <input type="date"> value.
function dateOnly(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA");
}

function matchesFilters(row: DashboardRow, f: Filters): boolean {
  if (f.statuses.length > 0 && !f.statuses.includes(row.statusLabel)) return false;
  if (f.steps.length > 0 && !f.steps.includes(rowStepKey(row))) return false;
  if (f.submittedFrom && dateOnly(row.submittedAt) < f.submittedFrom) return false;
  if (f.submittedTo && dateOnly(row.submittedAt) > f.submittedTo) return false;
  if (f.expectedFrom || f.expectedTo) {
    if (!row.expectedDeliveryAt) return false;
    const expected = dateOnly(row.expectedDeliveryAt);
    if (f.expectedFrom && expected < f.expectedFrom) return false;
    if (f.expectedTo && expected > f.expectedTo) return false;
  }
  return true;
}

function CheckboxRow({ checked, label, onChange }: { checked: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm text-zinc-700 hover:bg-zinc-50">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 rounded border-zinc-300"
      />
      {label}
    </label>
  );
}

function FilterPanel({
  filters,
  statuses,
  steps,
  onChange,
  onClose,
}: {
  filters: Filters;
  statuses: string[];
  steps: { key: string; label: string }[];
  onChange: (f: Filters) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [onClose]);

  function toggle(key: "statuses" | "steps", value: string) {
    const list = filters[key];
    const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
    onChange({ ...filters, [key]: next });
  }

  return (
    <div ref={ref} className="absolute right-0 top-9 z-50 w-[20rem] rounded-xl border border-zinc-200 bg-white p-4 shadow-xl">
      <div className="max-h-[26rem] space-y-4 overflow-y-auto pr-1">
        {statuses.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">Status</p>
            <div className="space-y-0.5">
              {statuses.map((s) => (
                <CheckboxRow key={s} checked={filters.statuses.includes(s)} label={s} onChange={() => toggle("statuses", s)} />
              ))}
            </div>
          </div>
        )}

        {steps.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">Delivery step</p>
            <div className="space-y-0.5">
              {steps.map((s) => (
                <CheckboxRow key={s.key} checked={filters.steps.includes(s.key)} label={s.label} onChange={() => toggle("steps", s.key)} />
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">Submitted date</p>
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={filters.submittedFrom}
              onChange={(e) => onChange({ ...filters, submittedFrom: e.target.value })}
              className="min-w-0 flex-1 rounded-md border border-zinc-200 px-2 py-1 text-sm focus:border-zinc-400 focus:outline-none"
            />
            <span className="text-xs text-zinc-400">to</span>
            <input
              type="date"
              value={filters.submittedTo}
              onChange={(e) => onChange({ ...filters, submittedTo: e.target.value })}
              className="min-w-0 flex-1 rounded-md border border-zinc-200 px-2 py-1 text-sm focus:border-zinc-400 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">Expected delivery date</p>
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={filters.expectedFrom}
              onChange={(e) => onChange({ ...filters, expectedFrom: e.target.value })}
              className="min-w-0 flex-1 rounded-md border border-zinc-200 px-2 py-1 text-sm focus:border-zinc-400 focus:outline-none"
            />
            <span className="text-xs text-zinc-400">to</span>
            <input
              type="date"
              value={filters.expectedTo}
              onChange={(e) => onChange({ ...filters, expectedTo: e.target.value })}
              className="min-w-0 flex-1 rounded-md border border-zinc-200 px-2 py-1 text-sm focus:border-zinc-400 focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-zinc-100 pt-3">
        <button type="button" onClick={() => onChange(EMPTY_FILTERS)} className="text-xs text-zinc-500 hover:text-zinc-800 hover:underline">
          Clear all
        </button>
        <span className="text-xs text-zinc-400">{isFilterActive(filters) ? "Filters applied" : "No filters"}</span>
      </div>
    </div>
  );
}

// `hasPendingReview` is this viewer's own pending-review state (row.pendingReview) —
// distinct from the stepper's stage, which reflects the project overall and stays on
// "Review" until every stakeholder has responded, not just this one.
function captionClassName(stepper: StepperResult | null, hasPendingReview: boolean): string {
  if (!stepper || stepper.isPaused) return "text-zinc-500";
  const activeStage = stepper.stages[stepperActiveIndexOf(stepper.stages)];
  if (hasPendingReview && stepperNeedsStakeholderAction(activeStage)) return "font-medium text-amber-700";
  if (activeStage.visual === "revision-current") return "text-red-700";
  if (activeStage.visual === "complete") return "text-green-700";
  if (activeStage.key === "finalizing") return "text-purple-700";
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

export function PortalDashboard({
  rows,
  readyItems,
  org,
  readyWindowDays,
}: DashboardData) {
  const [categoryFilter, setCategoryFilter] = useState<RowCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("priority");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

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

  const needsReviewCount = rows.filter((r) => rowCategory(r) === "needs_review").length;
  const deliveredCount = rows.filter((r) => rowCategory(r) === "delivered").length;

  const availableStatuses = Array.from(new Set(rows.map((r) => r.statusLabel))).sort();
  const presentStepKeys = new Set(rows.map(rowStepKey));
  const availableSteps = STEP_OPTIONS.filter((s) => presentStepKeys.has(s.key));

  const visibleRows = sortRows(
    rows.filter((row) => {
      if (categoryFilter !== "all" && rowCategory(row) !== categoryFilter) return false;
      if (search.trim() && !row.label.toLowerCase().includes(search.trim().toLowerCase())) return false;
      if (!matchesFilters(row, filters)) return false;
      return true;
    }),
    sortBy
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

      <TourHighlight id="stakeholder_action_items">
        <div className="space-y-3">
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
        </div>
      </TourHighlight>

      {/* Project cards */}
      <TourHighlight id="stakeholder_project_list">
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
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ["all", `All (${rows.length})`],
                ["needs_review", `Needs your review (${needsReviewCount})`],
                ["in_progress", `In progress (${inProgressCount})`],
                ["delivered", `Delivered (${deliveredCount})`],
              ] as [RowCategory | "all", string][]
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setCategoryFilter(value)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  categoryFilter === value
                    ? "bg-zinc-900 text-white"
                    : "border border-zinc-200 bg-white text-zinc-600 hover:text-zinc-900"
                }`}
              >
                {label}
              </button>
            ))}

            <div className="relative ml-auto">
              <button
                type="button"
                onClick={() => setFiltersOpen((v) => !v)}
                className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-medium ${
                  isFilterActive(filters)
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 bg-white text-zinc-600 hover:text-zinc-900"
                }`}
              >
                Filters {isFilterActive(filters) ? "•" : ""}
              </button>
              {filtersOpen && (
                <FilterPanel
                  filters={filters}
                  statuses={availableStatuses}
                  steps={availableSteps}
                  onChange={setFilters}
                  onClose={() => setFiltersOpen(false)}
                />
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by project or address…"
              className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none"
            />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="shrink-0 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 focus:border-zinc-400 focus:outline-none"
            >
              {(Object.entries(SORT_LABELS) as [SortOption, string][]).map(([value, label]) => (
                <option key={value} value={value}>
                  Sort: {label}
                </option>
              ))}
            </select>
          </div>

          {visibleRows.length === 0 && (
            <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center">
              <p className="text-sm font-medium text-zinc-900">No report requests match these filters</p>
              <button
                type="button"
                onClick={() => {
                  setCategoryFilter("all");
                  setSearch("");
                  setFilters(EMPTY_FILTERS);
                }}
                className="mt-2 text-sm text-zinc-600 hover:text-zinc-900 hover:underline"
              >
                Clear filters
              </button>
            </div>
          )}

          {visibleRows.map((row) => {
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
                    {caption && (
                      <p className={`mt-0.5 text-xs ${captionClassName(row.stepper, !!row.pendingReview)}`}>
                        {caption}
                      </p>
                    )}
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
      </TourHighlight>
    </div>
  );
}
