"use client";

// Backs the "Right now" hero on the dashboard (PortalDashboard.tsx). With
// exactly one pending review (or one ready report) each hook returns a
// single button, no extra chrome. With more than one, the button toggles an
// inline list — the hero card itself expands downward to show every
// project by name, each with its own action. No overlay for the picking
// step: an anchored dropdown clips on small screens, and a centered modal
// felt heavy on desktop for "pick one of a few" — inline expansion needs no
// anchoring math and is one implementation for every screen size, consistent
// with how MiniStepper/DocGroupCard already expand content in place
// elsewhere on this page. The actual review FORM (as opposed to picking who
// to review) still opens as a modal below — that's a real focused task, not
// a picker.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PortalApprovalForm } from "@/app/(client)/portal/projects/[id]/_components/PortalApprovalForm";
import { PendingReviewModal } from "./PendingReviewModal";
import { DownloadCard } from "@/components/DownloadCard";
import { rowStatus, nextIndex } from "@/lib/downloads/sequential-download";

interface PendingReviewItem {
  id: string;
  label: string;
  reviewId: string;
  expiresAt: string;
  pbdbDownloadUrl: string;
  pbdbFilename?: string;
}

interface ReadyItemInput {
  id: string;
  label: string;
  filename?: string;
}

// DownloadPbdrLink also renders the original filename as a caption line
// above its button — fine when it has a full-width card to itself (the
// project rows below), but there's no room for a second line in the
// compact hero. This is the same button, minus that line.
function CompactDownloadButton({ projectId, filename }: { projectId: string; filename?: string }) {
  return (
    <DownloadCard
      href={`/api/download/pbdr/${projectId}`}
      filename={filename}
      buttonLabel="Download report"
      buttonClassName="inline-flex items-center rounded-md border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100"
      wrapperClassName="inline-flex items-center"
    />
  );
}

function ChevronToggle({ expanded }: { expanded: boolean }) {
  return (
    <svg className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
    </svg>
  );
}

// Same modal shell as PendingReviewModal's — for the actual review form,
// opened after a project is picked from the inline list. Not a picker.
function ReviewFormModal({ item, onClose }: { item: PendingReviewItem; onClose: () => void }) {
  const router = useRouter();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="mx-4 w-full max-w-lg rounded-xl border border-zinc-200 bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-zinc-100 px-6 py-4">
          <div className="min-w-0 pr-4">
            <h2 className="text-base font-semibold text-zinc-900">Brief Review</h2>
            <p className="mt-0.5 truncate text-xs text-zinc-500">{item.label}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
            aria-label="Close"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
        <div className="p-6">
          <PortalApprovalForm
            reviewId={item.reviewId}
            projectId={item.id}
            pbdbDownloadUrl={item.pbdbDownloadUrl}
            pbdbFilename={item.pbdbFilename}
            expiresAt={item.expiresAt}
            bare
            onSubmitted={() => {
              onClose();
              router.refresh();
            }}
          />
        </div>
      </div>
    </div>
  );
}

// Returns the hero's top-right button and (when expanded) the inline list
// to render below it — CompactHero just stacks the two, it doesn't need to
// know anything about picking.
export function usePendingReviewHeroAction(items: PendingReviewItem[]): {
  button: React.ReactNode;
  expanded: React.ReactNode;
} {
  const [expanded, setExpanded] = useState(false);
  const [active, setActive] = useState<PendingReviewItem | null>(null);

  if (items.length === 0) return { button: null, expanded: null };

  if (items.length === 1) {
    const item = items[0];
    return {
      button: (
        <PendingReviewModal
          projectLabel={item.label}
          reviewId={item.reviewId}
          projectId={item.id}
          pbdbDownloadUrl={item.pbdbDownloadUrl}
          pbdbFilename={item.pbdbFilename}
          expiresAt={item.expiresAt}
        />
      ),
      expanded: null,
    };
  }

  const button = (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      aria-expanded={expanded}
      className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-amber-700"
    >
      Review ({items.length})
      <ChevronToggle expanded={expanded} />
    </button>
  );

  const expandedNode = (
    <>
      {expanded && (
        <div className="mt-3 divide-y divide-amber-200/70 border-t border-amber-200 pt-1">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0 truncate text-sm text-amber-900">{item.label}</span>
              <button
                type="button"
                onClick={() => setActive(item)}
                className="shrink-0 rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700"
              >
                Review
              </button>
            </div>
          ))}
        </div>
      )}
      {active && <ReviewFormModal item={active} onClose={() => setActive(null)} />}
    </>
  );

  return { button, expanded: expandedNode };
}

const SEQUENTIAL_POLL_MS = 200;
// Never let a stalled row (unreachable status endpoint, a dl id the
// streaming route never saw) block the rest of "Download all" forever.
const SEQUENTIAL_MAX_WASH_MS = 20000;

export function useReadyDownloadHeroAction(items: ReadyItemInput[]): {
  button: React.ReactNode;
  expanded: React.ReactNode;
} {
  const [expanded, setExpanded] = useState(false);
  // "Download all" (#129): one row downloads at a time via the real
  // streamed pbdr route + its status endpoint (mirrors #125's pbdb
  // mechanism) — only the active row shows real %, the rest show idle
  // ("Download" pill, still independently clickable) or "Downloaded ✓".
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [activePct, setActivePct] = useState<number | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (activeIndex === null) return;
    const item = items[activeIndex];
    // nextIndex() only ever hands back a valid index or null, so this is
    // unreachable in practice — a defensive no-op, not a state reset, to
    // avoid a synchronous setState-in-effect.
    if (!item) return;

    let cancelled = false;
    queueMicrotask(() => setActivePct(0));

    const dl =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // Bulk "download all" was already synthetic-anchor-driven before this
    // issue (staggered, not user-gesture-per-file — there's no way for a
    // single click to trigger N native downloads) — this only adds the ?dl=
    // id, it doesn't change that existing shape.
    const a = document.createElement("a");
    a.href = `/api/download/pbdr/${item.id}?dl=${dl}`;
    if (item.filename) a.download = item.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    function advance() {
      setCompletedIds((prev) => new Set(prev).add(item.id));
      setActiveIndex((current) => (current === null ? null : nextIndex(current, items.length)));
    }

    const poll = async () => {
      try {
        const res = await fetch(`/api/download/pbdr/status/${dl}`, { cache: "no-store" });
        if (cancelled) return;
        if (!res.ok && res.status !== 404) return;
        const data = (await res.json()) as { bytesServed: number; totalBytes: number | null; done: boolean };
        if (data.totalBytes) {
          setActivePct(Math.min(100, Math.round((data.bytesServed / data.totalBytes) * 100)));
        }
        if (data.done) {
          setActivePct(100);
          clearInterval(interval);
          clearTimeout(maxWashTimer);
          advance();
        }
      } catch {
        // Best-effort — a failed poll just leaves this row's % where it was
        // until the max-wash fallback below advances the queue.
      }
    };

    poll();
    const interval = setInterval(poll, SEQUENTIAL_POLL_MS);
    const maxWashTimer = setTimeout(() => {
      clearInterval(interval);
      advance();
    }, SEQUENTIAL_MAX_WASH_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(maxWashTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- items identity changes every render (new arrays from the caller); re-keying on activeIndex alone is correct here
  }, [activeIndex]);

  if (items.length === 0) return { button: null, expanded: null };

  if (items.length === 1) {
    return { button: <CompactDownloadButton projectId={items[0].id} filename={items[0].filename} />, expanded: null };
  }

  const button = (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      aria-expanded={expanded}
      className="inline-flex items-center gap-1.5 rounded-md border border-green-200 bg-white px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50"
    >
      Download ({items.length})
      <ChevronToggle expanded={expanded} />
    </button>
  );

  const expandedNode = expanded && (
    <div className="mt-3 border-t border-green-200 pt-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs text-green-700">{items.length} reports ready</span>
        <button
          type="button"
          onClick={() => {
            setCompletedIds(new Set());
            setActiveIndex(0);
          }}
          disabled={activeIndex !== null}
          className="rounded-md bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          Download all
        </button>
      </div>
      <div className="divide-y divide-green-200/70">
        {items.map((item, i) => {
          const status = rowStatus(i, activeIndex, completedIds, item.id);
          return (
            <div key={item.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0 truncate text-sm text-green-900">{item.label}</span>
              <div className="shrink-0">
                {status === "downloading" ? (
                  <span
                    className="inline-flex items-center rounded-md border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-800"
                    title={item.filename}
                  >
                    {activePct !== null ? `${activePct}%` : "…"}
                  </span>
                ) : status === "done" ? (
                  <span className="inline-flex items-center rounded-full bg-green-600 px-3 py-1.5 text-xs font-semibold text-white">
                    Downloaded ✓
                  </span>
                ) : (
                  <CompactDownloadButton projectId={item.id} filename={item.filename} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return { button, expanded: expandedNode };
}
