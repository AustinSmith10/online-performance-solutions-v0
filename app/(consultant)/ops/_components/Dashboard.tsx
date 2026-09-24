"use client";

// The consultant "My projects" dashboard — mirrors the visual language
// PortalDashboard established for clients (Tile summary strip, CompactHero
// "Right now" banner, rounded-xl project rows) so consultants and clients
// read as the same product.

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { InlineAssignmentActions } from "./InlineAssignmentActions";
import { RevisionReviewDrawer } from "./RevisionReviewDrawer";
import { SelfAssignButton } from "./SelfAssignButton";
import { useAssignmentHeroAction, useReviewHeroAction } from "./HeroActions";
import { TourHighlight } from "@/components/onboarding-tour/TourHighlight";
import type { DashboardData, DashboardProject } from "./dashboardTypes";
import type { SectionKey } from "./dashboardList";

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
    <div className={`rounded-xl border p-3 sm:p-4 ${classes}`}>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs font-medium">{label}</p>
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
    <div className={`rounded-xl border px-4 py-2.5 ${classes}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
          <span className={`shrink-0 whitespace-nowrap text-sm font-semibold ${titleClasses}`}>Right now</span>
          <span className="text-xs text-zinc-600 sm:line-clamp-2">{subtitle}</span>
        </div>
        {action && <div className="sm:shrink-0">{action}</div>}
      </div>
      {expanded}
    </div>
  );
}

export function ProjectRow({ p }: { p: DashboardProject }) {
  const accent = p.isPending
    ? "border-amber-200 bg-amber-50"
    : p.isRevision
      ? "border-red-200 bg-red-50"
      : "border-zinc-200 bg-white";
  return (
    <div
      className={`relative rounded-xl border p-4 transition-[border-color,box-shadow] duration-150 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-zinc-500 has-[a:focus-visible]:ring-offset-1 ${accent} ${
        p.isPending ? "" : "hover:border-zinc-400 hover:shadow-sm"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {p.isPending ? (
            <span className="block break-words text-base font-semibold text-zinc-900 sm:truncate" title={p.label}>{p.label}</span>
          ) : (
            // The link's ::after stretches over the whole row so the entire card
            // is the click target; action rows below sit above it (relative z-10).
            <Link
              href={p.href}
              title={p.label}
              className="block break-words text-base font-semibold text-zinc-900 outline-none sm:truncate after:absolute after:inset-0 after:rounded-xl hover:underline"
            >
              {p.label}
            </Link>
          )}
          <p className="mt-0.5 truncate text-xs text-zinc-600">
            {[p.clientName, p.isPending ? "assigned to you" : p.submitterName].filter(Boolean).join(" · ")}
          </p>
          <p className="mt-0.5 text-xs tabular-nums text-zinc-600">
            {p.expectedDeliveryLabel ? `Expected ${p.expectedDeliveryLabel}` : "No delivery date set"}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${p.statusClassName}`}>{p.statusLabel}</span>
          {p.isOverdue && (
            <span className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-white px-2 py-0.5 text-xs font-medium tabular-nums text-red-700">
              <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
              </svg>
              Overdue{p.daysOverdue > 0 ? ` · ${p.daysOverdue}d` : ""}
            </span>
          )}
          {p.hasVerificationMismatch && (
            <span
              className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"
              title="A stakeholder confirmed a file despite a flagged verification mismatch"
            >
              Flagged doc
            </span>
          )}
        </div>
      </div>
      {p.revisionReview && (
        <div className="relative z-10 mt-3 flex items-center gap-2 border-t border-red-200 pt-3">
          <RevisionReviewDrawer
            project={p.revisionReview.project}
            reviews={p.revisionReview.reviews}
            pbdbFile={p.revisionReview.pbdbFile}
          />
        </div>
      )}
      {p.pendingAssignment && (
        <div className="relative z-10 mt-3 flex flex-wrap items-center gap-2 border-t border-amber-200 pt-3">
          <InlineAssignmentActions projectId={p.pendingAssignment.projectId} label={p.label} />
        </div>
      )}
    </div>
  );
}

export function Dashboard({ data }: { data: DashboardData }) {
  const { pendingAssignments, attention, counts, tab, q, page, pageCount, total } = data;
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isNavigating, startTransition] = useTransition();
  // While a navigation is in flight the clicked tab highlights immediately;
  // `tab` (from the server) decides which rows are actually on screen.
  const [pendingTab, setPendingTab] = useState<SectionKey | null>(null);
  const section = isNavigating && pendingTab ? pendingTab : tab;
  const [search, setSearch] = useState(q);
  const [sentQuery, setSentQuery] = useState(q);
  const [prevQ, setPrevQ] = useState(q);
  const panelRef = useRef<HTMLDivElement>(null);

  // Back/forward can change ?q= without this component typing it.
  if (q !== prevQ) {
    setPrevQ(q);
    if (q !== sentQuery) {
      setSentQuery(q);
      setSearch(q);
    }
  }

  // URL is the source of truth for tab / page / search (server-side paging).
  const go = useCallback(
    (changes: Record<string, string | null>, mode: "push" | "replace" = "push") => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(changes)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      startTransition(() => {
        (mode === "push" ? router.push : router.replace)(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [params, pathname, router]
  );
  const goRef = useRef(go);
  useEffect(() => {
    goRef.current = go;
  });

  // Debounced search: typing updates the URL ~300ms after the last keystroke.
  useEffect(() => {
    const term = search.trim();
    if (term === sentQuery) return;
    const t = setTimeout(() => {
      setSentQuery(term);
      goRef.current({ q: term || null, page: null }, "replace");
    }, 300);
    return () => clearTimeout(t);
  }, [search, sentQuery]);

  const revisions = attention.filter((p) => p.isRevision);
  // Overdue-but-not-revision projects join the revision hero below rather than
  // getting a third slot — a revision-required project that's also overdue
  // stays counted once, in revisions, not here.
  const overdueOnly = attention.filter((p) => p.isOverdue && !p.isRevision);

  const assignmentHero = useAssignmentHeroAction(pendingAssignments);
  const reviewHero = useReviewHeroAction(revisions, overdueOnly);
  const heroCount = [assignmentHero, reviewHero].filter(Boolean).length;
  const heroGridClass = heroCount === 2 ? "md:grid-cols-2" : "";

  const sections: { key: SectionKey; label: string; count: number }[] = [
    { key: "active", label: "Active", count: counts.active },
    { key: "stakeholders", label: "With stakeholders", count: counts.stakeholders },
    { key: "archive", label: "Archive", count: counts.archive },
    { key: "available", label: "Available jobs", count: counts.available },
  ];

  const selectSection = (key: SectionKey) => {
    setPendingTab(key);
    setSearch("");
    setSentQuery("");
    go({ tab: key === "active" ? null : key, page: null, q: null });
  };

  const goToPage = (n: number) => {
    go({ page: n <= 1 ? null : String(n) });
    panelRef.current?.scrollIntoView({ block: "start" });
  };

  const tabTotal = counts[tab];
  const showSearch = tabTotal > 6 || q !== "" || search !== "";

  return (
    // pb-20: clears the floating Available pill so the last row is never covered.
    <div className="space-y-4 pb-20">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">My projects</h1>
        <Link
          href="/ops/projects/submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white press hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
        >
          Submit request
        </Link>
      </div>

      <TourHighlight id="consultant_dashboard_summary">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile tone={counts.pending > 0 ? "amber" : "zinc"} label="Needs your response" value={counts.pending} />
            <Tile tone={counts.active > 0 ? "neutral" : "zinc"} label="Active" value={counts.active} />
            <Tile tone="zinc" label="With stakeholders" value={counts.stakeholders} />
            <Tile tone={counts.available > 0 ? "green" : "zinc"} label="Available jobs" value={counts.available} />
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
        </div>
      </TourHighlight>

      {/* Sticky from sm up (below the 45px sticky header) so the tab bar stays reachable while a long list scrolls; on phones the header is already 84px so it scrolls away. */}
      <div className="sm:sticky sm:top-[45px] sm:z-20 -mx-1 bg-zinc-50 px-1 py-1">
      <TourHighlight id="consultant_project_tabs">
        <div
          role="tablist"
          aria-label="Project lists"
          className="grid grid-cols-2 gap-1 rounded-lg border border-zinc-200 bg-white p-1 sm:flex"
          onKeyDown={(e) => {
            const i = sections.findIndex((s) => s.key === section);
            const next =
              e.key === "ArrowRight" ? (i + 1) % sections.length
              : e.key === "ArrowLeft" ? (i - 1 + sections.length) % sections.length
              : e.key === "Home" ? 0
              : e.key === "End" ? sections.length - 1
              : null;
            if (next === null) return;
            e.preventDefault();
            selectSection(sections[next].key);
            document.getElementById(`dash-tab-${sections[next].key}`)?.focus();
          }}
        >
          {sections.map((s) => (
            <button
              key={s.key}
              id={`dash-tab-${s.key}`}
              type="button"
              role="tab"
              aria-selected={section === s.key}
              aria-controls="dash-panel"
              tabIndex={section === s.key ? 0 : -1}
              onClick={() => selectSection(s.key)}
              className={`press-subtle flex-1 rounded-md px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-1 ${
                section === s.key ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              }`}
            >
              {s.label}
              {s.count > 0 && (
                <span className={`ml-1.5 tabular-nums ${section === s.key ? "text-zinc-300" : "text-zinc-500"}`}>({s.count})</span>
              )}
            </button>
          ))}
        </div>
      </TourHighlight>

      </div>

      <div
        ref={panelRef}
        key={tab}
        id="dash-panel"
        role="tabpanel"
        aria-labelledby={`dash-tab-${tab}`}
        aria-busy={isNavigating}
        tabIndex={-1}
        className={`pane-in scroll-mt-28 space-y-3 outline-none transition-opacity duration-150 ${isNavigating ? "opacity-60" : ""}`}
      >
        {showSearch && (
          <div>
            <label htmlFor="dash-search" className="sr-only">Search {sections.find((x) => x.key === tab)?.label} projects</label>
            <input
              id="dash-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search address, project number or client"
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            />
            {q && (
              <p className="mt-1.5 text-xs text-zinc-600" role="status" aria-live="polite">
                {total} of {tabTotal} shown
              </p>
            )}
          </div>
        )}

        {tabTotal === 0 ? (
          <EmptyState {...EMPTY[tab]} action={tab !== "available" && counts.available > 0 ? { label: `Browse available jobs (${counts.available})`, onClick: () => selectSection("available") } : undefined} />
        ) : total === 0 ? (
          <EmptyState title="No matches" subtitle={`Nothing in this list matches “${q}”.`} action={{ label: "Clear search", onClick: () => { setSearch(""); setSentQuery(""); go({ q: null, page: null }, "replace"); } }} />
        ) : tab === "available" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {data.available.map((p) => (
              <div key={p.id} className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                <p className="truncate text-sm font-semibold text-zinc-900" title={p.label}>{p.label}</p>
                <p className="mt-0.5 truncate text-xs text-zinc-600">{p.clientName ?? "—"}</p>
                <p className="mt-1 text-xs text-zinc-600">
                  Submitted {p.submittedLabel}
                  {p.expectedDeliveryLabel ? ` · Expected ${p.expectedDeliveryLabel}` : ""}
                </p>
                <div className="mt-3">
                  <SelfAssignButton projectId={p.id} address={p.label} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          data.rows.map((p) => <ProjectRow key={p.id} p={p} />)
        )}

        {pageCount > 1 && total > 0 && (
          <nav aria-label="Pagination" className="flex items-center justify-between gap-3 pt-1">
            <p className="text-xs tabular-nums text-zinc-600" aria-live="polite">
              Page {page} of {pageCount} · {total} {total === 1 ? "project" : "projects"}
            </p>
            <div className="flex gap-2">
              {(["Previous", "Next"] as const).map((label) => {
                const target = label === "Previous" ? page - 1 : page + 1;
                const disabled = target < 1 || target > pageCount;
                return (
                  <button
                    key={label}
                    type="button"
                    disabled={disabled}
                    onClick={() => goToPage(target)}
                    className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 press hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </nav>
        )}
      </div>
    </div>
  );
}

const EMPTY: Record<SectionKey, { title: string; subtitle: string }> = {
  active: { title: "No active projects", subtitle: "Projects will appear here once assigned by your account manager." },
  stakeholders: { title: "No projects with stakeholders", subtitle: "Projects awaiting stakeholder approval will appear here." },
  archive: { title: "No archived projects", subtitle: "Delivered and completed projects will appear here." },
  available: { title: "No available jobs", subtitle: "New submissions will appear here once a client submits a report request." },
};

function EmptyState({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-6 py-10 text-center">
      <p className="text-sm font-medium text-zinc-900">{title}</p>
      <p className="mt-1 text-sm text-zinc-600">{subtitle}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 press hover:bg-zinc-50"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
