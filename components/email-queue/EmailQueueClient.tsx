"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approveQueueEntry,
  reassignQueueEntry,
  rejectQueueEntry,
  requestClarification,
  searchProjectsForReassign,
  getReviewCyclesForProject,
  getSuggestedReviewsForSender,
  type ProjectSearchResult,
  type ReviewCycleOption,
} from "@/app/actions/email-queue";
import type { CandidateReview } from "@/lib/email-queue/candidate-reviews";
import { buildDefaultClarificationDraft } from "@/lib/email-queue/clarification-draft";
import {
  CATEGORY_LABEL,
  MATCH_REASON_LABEL,
  formatDateTime,
  type QueueCategory,
  type QueueRow,
  type QueueStatus,
} from "./types";

const TABS: { key: QueueStatus; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "awaiting_clarification", label: "Awaiting reply" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

// pending: untouched. awaiting_clarification: a request went out but the
// admin can still resolve it directly if they already know the answer.
// Only approved/rejected are actually final.
const RESOLVABLE_STATUSES: QueueStatus[] = ["pending", "awaiting_clarification"];

const CATEGORY_COLORS: Record<QueueCategory, string> = {
  new_submission: "bg-blue-50 text-blue-700",
  thread_reply: "bg-violet-50 text-violet-700",
  stakeholder_response: "bg-emerald-50 text-emerald-700",
};

function CategoryBadge({ category }: { category: QueueCategory }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_COLORS[category]}`}>
      {CATEGORY_LABEL[category]}
    </span>
  );
}

function ListRow({ row, active, onSelect }: { row: QueueRow; active: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className={`w-full border-b border-zinc-100 px-3 py-2.5 text-left ${
        active ? "bg-zinc-100" : "hover:bg-zinc-50"
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="truncate text-sm font-medium text-zinc-900">{row.fromName ?? row.fromEmail}</p>
        <span className="shrink-0 text-[10px] text-zinc-400">{formatDateTime(row.receivedAt).split(",")[0]}</span>
      </div>
      <p className="truncate text-xs text-zinc-600">{row.subject || "(no subject)"}</p>
      <div className="mt-1">
        <CategoryBadge category={row.proposedCategory} />
      </div>
    </button>
  );
}

function ReassignPanel({
  row,
  onCancel,
  onDone,
}: {
  row: QueueRow;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [category, setCategory] = useState<QueueCategory>(row.proposedCategory);
  const [projectQuery, setProjectQuery] = useState(row.proposedTarget?.projectLabel ?? "");
  const [projectOptions, setProjectOptions] = useState<ProjectSearchResult[]>(
    row.proposedTarget ? [{ id: row.proposedTarget.projectId, label: row.proposedTarget.projectLabel }] : []
  );
  const [projectId, setProjectId] = useState(row.proposedTarget?.projectId ?? "");
  const [reviewOptions, setReviewOptions] = useState<ReviewCycleOption[]>(
    row.proposedTarget?.reviewId
      ? [{ id: row.proposedTarget.reviewId, label: row.proposedTarget.reviewLabel ?? "" }]
      : []
  );
  const [reviewId, setReviewId] = useState(row.proposedTarget?.reviewId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<CandidateReview[]>([]);

  // Suggested reviews for this exact sender — mainly useful for
  // stakeholder_table_fallback entries, which have no proposedTarget at all
  // and would otherwise leave the admin free-text searching blind.
  useEffect(() => {
    if (row.proposedTarget) return;
    startTransition(async () => {
      const results = await getSuggestedReviewsForSender(row.id);
      setSuggestions(results);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.id]);

  function applySuggestion(candidate: CandidateReview) {
    setCategory("stakeholder_response");
    setProjectId(candidate.projectId);
    setProjectQuery(candidate.projectLabel);
    setReviewOptions([{ id: candidate.reviewId, label: candidate.reviewLabel }]);
    setReviewId(candidate.reviewId);
  }

  // Debounced project search as the admin types.
  useEffect(() => {
    if (category === "new_submission") return;
    const handle = setTimeout(() => {
      startTransition(async () => {
        const results = await searchProjectsForReassign(projectQuery);
        setProjectOptions(results);
      });
    }, 250);
    return () => clearTimeout(handle);
  }, [projectQuery, category]);

  // Step 2 options load whenever the chosen project changes. When the
  // conditions for a lookup aren't met, effectiveReviewOptions (below)
  // renders an empty list without needing to reset state here.
  useEffect(() => {
    if (category !== "stakeholder_response" || !projectId) return;
    startTransition(async () => {
      const results = await getReviewCyclesForProject(projectId);
      setReviewOptions(results);
    });
  }, [projectId, category]);

  const effectiveReviewOptions = category === "stakeholder_response" && projectId ? reviewOptions : [];

  const router = useRouter();

  function handleReassign() {
    setError(null);
    startTransition(async () => {
      const result = await reassignQueueEntry(
        row.id,
        category,
        category === "new_submission" ? null : projectId || null,
        category === "stakeholder_response" ? reviewId || null : null
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.redirectTo) {
        router.push(result.redirectTo);
        return;
      }
      onDone();
    });
  }

  const canSubmit =
    category === "new_submission"
      ? true
      : category === "thread_reply"
        ? !!projectId
        : !!projectId && !!reviewId;

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg bg-zinc-50 p-4">
      {suggestions.length > 0 && (
        <div className="w-full">
          <p className="text-xs font-medium text-zinc-700">
            {row.fromName ?? row.fromEmail} has open review{suggestions.length === 1 ? "" : "s"} on:
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {suggestions.map((c) => (
              <button
                key={c.reviewId}
                type="button"
                onClick={() => applySuggestion(c)}
                className={`rounded-full border px-2.5 py-1 text-xs ${
                  reviewId === c.reviewId
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"
                }`}
              >
                {c.projectLabel} — {c.reviewLabel}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-zinc-700">Category</label>
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value as QueueCategory);
            setReviewId("");
          }}
          className="mt-1 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
        >
          <option value="new_submission">New submission</option>
          <option value="thread_reply">Thread reply</option>
          <option value="stakeholder_response">Stakeholder response</option>
        </select>
      </div>

      {category !== "new_submission" && (
        <div>
          <label className="block text-xs font-medium text-zinc-700">Step 1 — project</label>
          <input
            value={projectQuery}
            onChange={(e) => {
              setProjectQuery(e.target.value);
              setProjectId("");
              setReviewId("");
            }}
            placeholder="Search address / PO / project #…"
            className="mt-1 block w-56 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
          />
          {projectQuery && !projectId && (
            <div className="mt-1 max-h-40 w-56 overflow-y-auto rounded-md border border-zinc-200 bg-white shadow-sm">
              {projectOptions.length === 0 && <p className="px-2 py-1.5 text-xs text-zinc-400">No matches.</p>}
              {projectOptions.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setProjectId(p.id);
                    setProjectQuery(p.label);
                    setReviewId("");
                  }}
                  className="block w-full truncate px-2 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-50"
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {category === "stakeholder_response" && (
        <div>
          <label className="block text-xs font-medium text-zinc-700">Step 2 — review cycle</label>
          <select
            value={reviewId}
            disabled={!projectId}
            onChange={(e) => setReviewId(e.target.value)}
            className="mt-1 rounded-md border border-zinc-300 px-2 py-1.5 text-sm disabled:bg-zinc-100"
          >
            <option value="">{projectId ? "Select…" : "Pick a project first"}</option>
            {effectiveReviewOptions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="rounded-md px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-200"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canSubmit || isPending}
          onClick={handleReassign}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-30"
        >
          {isPending ? "Working…" : "Reassign & approve"}
        </button>
      </div>

      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </div>
  );
}

function ClarificationPanel({
  row,
  onCancel,
  onDone,
}: {
  row: QueueRow;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [suggestions, setSuggestions] = useState<CandidateReview[] | null>(null);
  const [message, setMessage] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch this sender's open reviews to build the starting draft — the admin
  // can send it as-is or rewrite it entirely (#101 follow-up: free-text,
  // not a fixed template). Only pre-fills once, and never overwrites
  // anything the admin has already started typing.
  useEffect(() => {
    startTransition(async () => {
      const results = await getSuggestedReviewsForSender(row.id);
      setSuggestions(results);
      setMessage((current) => (current === "" ? buildDefaultClarificationDraft(results) : current));
    });
  }, [row.id]);

  function handleSend() {
    setError(null);
    startTransition(async () => {
      const result = await requestClarification(row.id, message);
      if (result.error) {
        setError(result.error);
        return;
      }
      onDone();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-zinc-50 p-4">
      {suggestions && suggestions.length > 0 && (
        <p className="text-xs text-zinc-500">
          {row.fromName ?? row.fromEmail} has open review{suggestions.length === 1 ? "" : "s"} on:{" "}
          {suggestions.map((c) => `${c.projectLabel} — ${c.reviewLabel}`).join("; ")}
        </p>
      )}
      <label className="text-xs font-medium text-zinc-700">Message to {row.fromEmail}</label>
      <textarea
        value={message}
        onChange={(e) => {
          setTouched(true);
          setMessage(e.target.value);
        }}
        rows={6}
        placeholder={suggestions === null ? "Loading a suggested draft…" : undefined}
        className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
      />
      {!touched && suggestions !== null && (
        <p className="text-xs text-zinc-400">Pre-filled — edit freely before sending.</p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="rounded-md px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-200"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={isPending || !message.trim()}
          onClick={handleSend}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-30"
        >
          {isPending ? "Sending…" : "Send"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function ResolveActions({ row, onResolved }: { row: QueueRow; onResolved: (message: string) => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [reassigning, setReassigning] = useState(false);
  const [clarifying, setClarifying] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleApprove() {
    setError(null);
    startTransition(async () => {
      const result = await approveQueueEntry(row.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.redirectTo) {
        router.push(result.redirectTo);
        return;
      }
      onResolved("Approved");
    });
  }

  function handleReject() {
    setError(null);
    startTransition(async () => {
      const result = await rejectQueueEntry(row.id, rejectReason);
      if (result.error) {
        setError(result.error);
        return;
      }
      onResolved("Rejected");
    });
  }

  if (reassigning) {
    return (
      <ReassignPanel
        row={row}
        onCancel={() => setReassigning(false)}
        onDone={() => {
          setReassigning(false);
          onResolved("Reassigned & approved");
        }}
      />
    );
  }

  if (clarifying) {
    return (
      <ClarificationPanel
        row={row}
        onCancel={() => setClarifying(false)}
        onDone={() => {
          setClarifying(false);
          onResolved("Clarification request sent");
        }}
      />
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={handleApprove}
        disabled={isPending || !row.proposedTarget}
        title={!row.proposedTarget ? "No proposed target — use Reassign instead" : undefined}
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-30"
      >
        {isPending ? "Working…" : "Approve as proposed"}
      </button>
      <button
        onClick={() => setReassigning(true)}
        disabled={isPending}
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
      >
        Reassign
      </button>
      {!row.proposedTarget && (
        <button
          onClick={() => setClarifying(true)}
          disabled={isPending || row.status === "awaiting_clarification"}
          title="Ask the sender which project/review this is regarding"
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-30"
        >
          {row.status === "awaiting_clarification" ? "Clarification requested" : "Request clarification"}
        </button>
      )}
      <input
        value={rejectReason}
        onChange={(e) => setRejectReason(e.target.value)}
        placeholder="Rejection reason (optional)"
        className="rounded-md border border-zinc-300 px-2 py-1.5 text-xs"
      />
      <button
        onClick={handleReject}
        disabled={isPending}
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-50"
      >
        Reject
      </button>
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function EmailQueueClient({ rows }: { rows: QueueRow[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<QueueStatus>("pending");
  const [toast, setToast] = useState<string | null>(null);
  const visible = rows.filter((r) => r.status === tab);
  const [selectedId, setSelectedId] = useState<string>(visible[0]?.id ?? "");

  // The row the toast is confirming disappears from view the moment
  // router.refresh() re-fetches (its status just changed) — so the
  // confirmation lives here, outside the row/panel that's about to vanish,
  // instead of inline where it'd be gone before anyone read it.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  function handleResolved(message: string) {
    router.refresh();
    setToast(message);
  }

  // Re-anchor the selection to the first row whenever the active tab
  // changes, adjusted during render (React's documented alternative to an
  // effect for "reset state when some other value changes") rather than in
  // a useEffect, which would otherwise cause an extra render pass.
  const [prevTab, setPrevTab] = useState(tab);
  if (tab !== prevTab) {
    setPrevTab(tab);
    setSelectedId(visible[0]?.id ?? "");
  }

  const selected = visible.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Email Queue</h1>
          <p className="mt-1 text-sm text-zinc-500">Nothing runs automatically until you approve, reject, or reassign.</p>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white">
        <div className="flex gap-1 border-b border-zinc-200 px-4 pt-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-t-md px-3 py-2 text-sm font-medium ${
                tab === t.key ? "border-b-2 border-zinc-900 text-zinc-900" : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              {t.label}
              <span className="ml-1.5 text-xs text-zinc-400">
                ({rows.filter((r) => r.status === t.key).length})
              </span>
            </button>
          ))}
        </div>

        <div className="flex h-[32rem]">
          <div className="w-80 shrink-0 overflow-y-auto border-r border-zinc-200">
            {visible.length === 0 && <p className="p-4 text-xs text-zinc-400">Nothing in {tab}.</p>}
            {visible.map((row) => (
              <ListRow key={row.id} row={row} active={row.id === selectedId} onSelect={() => setSelectedId(row.id)} />
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {!selected ? (
              <p className="text-sm text-zinc-400">Select an email.</p>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-zinc-900">{selected.subject || "(no subject)"}</h2>
                  <CategoryBadge category={selected.proposedCategory} />
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {selected.fromName ? `${selected.fromName} · ` : ""}
                  {selected.fromEmail} · {formatDateTime(selected.receivedAt)}
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  {selected.attachments.length} attachment{selected.attachments.length === 1 ? "" : "s"} ·{" "}
                  {MATCH_REASON_LABEL[selected.matchReason]}
                </p>

                {selected.attachments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selected.attachments.map((a, i) =>
                      a.url ? (
                        <a
                          key={i}
                          href={a.url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
                        >
                          {a.filename}
                        </a>
                      ) : (
                        <span key={i} className="rounded-md border border-zinc-200 bg-zinc-100 px-2 py-1 text-xs text-zinc-400">
                          {a.filename} (unavailable)
                        </span>
                      )
                    )}
                  </div>
                )}

                <p className="mt-4 max-w-xl whitespace-pre-wrap rounded-lg bg-zinc-50 p-4 text-sm leading-relaxed text-zinc-700">
                  {selected.textBody?.trim() || "(empty message body)"}
                </p>

                {selected.proposedTarget && (
                  <p className="mt-3 text-xs text-zinc-500">
                    Proposed target: {selected.proposedTarget.projectLabel}
                    {selected.proposedTarget.reviewLabel ? ` — ${selected.proposedTarget.reviewLabel}` : ""}
                  </p>
                )}

                {selected.clarificationRequestedAt && (
                  <div className="mt-3 max-w-xl rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                    <p className="whitespace-pre-wrap">
                      Asked {formatDateTime(selected.clarificationRequestedAt)}:{" "}
                      {selected.clarificationMessage?.trim() || "(message not recorded)"}
                    </p>
                    {selected.clarificationCandidates && selected.clarificationCandidates.length > 0 && (
                      <p className="mt-1.5 border-t border-amber-200 pt-1.5">
                        Their open reviews at the time:{" "}
                        {selected.clarificationCandidates.map((c) => `${c.projectLabel} — ${c.reviewLabel}`).join("; ")}
                      </p>
                    )}
                    {selected.clarificationReplyText && (
                      <p className="mt-1.5 whitespace-pre-wrap border-t border-amber-200 pt-1.5">
                        Sender replied: {selected.clarificationReplyText.trim()}
                      </p>
                    )}
                  </div>
                )}

                {!RESOLVABLE_STATUSES.includes(selected.status) ? (
                  <p className="mt-6 max-w-xl rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">
                    Already {selected.status}
                    {selected.status === "approved" && selected.resolvedTarget
                      ? ` → ${selected.resolvedTarget.projectLabel}${
                          selected.resolvedTarget.reviewLabel ? ` — ${selected.resolvedTarget.reviewLabel}` : ""
                        }`
                      : ""}
                    {selected.status === "rejected" && selected.rejectionReason ? `: ${selected.rejectionReason}` : ""}
                  </p>
                ) : (
                  <div className="mt-6 max-w-xl border-t border-zinc-200 pt-4">
                    <ResolveActions row={selected} onResolved={handleResolved} />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
          <svg className="h-4 w-4 text-green-400" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
          {toast}
        </div>
      )}
    </div>
  );
}
