"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  approveQueueEntry,
  reassignQueueEntry,
  rejectQueueEntry,
  requestClarification,
  searchProjectsForReassign,
  getReviewCyclesForProject,
  getSuggestedReviewsForSender,
  getTaggedReviewForEntry,
  type ProjectSearchResult,
  type QueueActionState,
  type ReviewCycleOption,
} from "@/app/actions/email-queue";
import type { CandidateReview, TaggedReview } from "@/lib/email-queue/candidate-reviews";
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

// How long a resolve waits (undoable) before it is actually sent to the server.
const UNDO_MS = 6000;
// Confirmation toasts clear themselves, unless the message implies follow-up work.
const INFO_TOAST_MS = 5000;

const EMPTY_TEXT: Record<QueueStatus, string> = {
  pending: "Nothing pending.",
  awaiting_clarification: "Nothing awaiting a reply.",
  approved: "Nothing approved yet.",
  rejected: "Nothing rejected.",
};

const BTN_FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900";
const BTN_PRIMARY = `press rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-zinc-700 ${BTN_FOCUS} disabled:opacity-50 [@media(pointer:coarse)]:min-h-10`;
const BTN_SECONDARY = `press rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors duration-150 hover:bg-zinc-50 ${BTN_FOCUS} disabled:opacity-50 [@media(pointer:coarse)]:min-h-10`;
const BTN_GHOST = `press rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors duration-150 hover:bg-zinc-200 ${BTN_FOCUS} disabled:opacity-50 [@media(pointer:coarse)]:min-h-10`;
const BTN_DANGER = `press rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 transition-colors duration-150 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:opacity-50 [@media(pointer:coarse)]:min-h-10`;
const BTN_DANGER_SOLID = `press rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:opacity-50 [@media(pointer:coarse)]:min-h-10`;
const suggestionChip = (selected: boolean) =>
  `press rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-150 ${BTN_FOCUS} [@media(pointer:coarse)]:min-h-10 ${
    selected ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"
  }`;
const FIELD =
  "rounded-md border border-zinc-300 px-2 py-1.5 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500";

// Open items are worked oldest-first, and turn amber once they've waited this
// long, so a stakeholder isn't left hanging behind newer mail.
const OVERDUE_HOURS = 24;

function ageOf(iso: string): { label: string; hours: number } {
  const ms = Math.max(0, Date.now() - new Date(iso).getTime());
  const hours = ms / 3_600_000;
  if (hours < 1) return { label: `${Math.max(1, Math.round(ms / 60_000))}m`, hours };
  if (hours < 24) return { label: `${Math.floor(hours)}h`, hours };
  const days = Math.floor(hours / 24);
  const rem = Math.floor(hours - days * 24);
  return { label: rem > 0 && days < 7 ? `${days}d ${rem}h` : `${days}d`, hours };
}

const formatDay = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

// One resolve, waiting out its undo window. `run` is the real server call.
type Commit = {
  rowId: string;
  message: string;
  // Implies follow-up work, so the confirmation stays until dismissed.
  persistent?: boolean;
  run: () => Promise<QueueActionState>;
};
type OnCommit = (commit: Omit<Commit, "rowId">) => void;

type Toast =
  | { kind: "undo"; message: string }
  | { kind: "info"; message: string; persistent?: boolean; href?: string; hrefLabel?: string }
  | { kind: "error"; message: string };

// Category is not workflow state, so the badge stays neutral.
function CategoryBadge({ category }: { category: QueueCategory }) {
  return (
    <span className="inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
      {CATEGORY_LABEL[category]}
    </span>
  );
}

function ListRow({ row, active, onSelect }: { row: QueueRow; active: boolean; onSelect: () => void }) {
  const open = RESOLVABLE_STATUSES.includes(row.status);
  const age = open ? ageOf(row.receivedAt) : null;
  return (
    <button
      type="button"
      data-row-id={row.id}
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
      className={`press-subtle w-full border-b border-zinc-100 px-3 py-2.5 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-zinc-900 [@media(pointer:coarse)]:min-h-14 ${
        active ? "bg-zinc-100" : "hover:bg-zinc-50"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-medium text-zinc-900">{row.fromName ?? row.fromEmail}</p>
        <span className="shrink-0 text-xs tabular-nums text-zinc-500">
          {formatDateTime(row.receivedAt).split(",")[0]}
        </span>
      </div>
      <p className="truncate text-xs text-zinc-600">{row.subject || "(no subject)"}</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <CategoryBadge category={row.proposedCategory} />
        {age && (
          <span
            suppressHydrationWarning
            className={`shrink-0 text-xs tabular-nums ${
              age.hours >= OVERDUE_HOURS ? "font-medium text-amber-700" : "text-zinc-500"
            }`}
          >
            Waiting {age.label}
          </span>
        )}
      </div>
    </button>
  );
}

function ReassignPanel({
  row,
  onCancel,
  onCommit,
}: {
  row: QueueRow;
  onCancel: () => void;
  onCommit: OnCommit;
}) {
  const [, startTransition] = useTransition();
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
  const [suggestions, setSuggestions] = useState<CandidateReview[]>([]);
  const [tagged, setTagged] = useState<TaggedReview | null>(null);
  // Combobox state: focus stays in the input, `activeIndex` is the highlighted
  // option (announced through aria-activedescendant), Esc closes the list.
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dismissed, setDismissed] = useState(false);

  // Suggested reviews for this exact sender — mainly useful for
  // stakeholder_table_fallback entries, which have no proposedTarget at all
  // and would otherwise leave the admin free-text searching blind.
  useEffect(() => {
    if (row.proposedTarget) return;
    startTransition(async () => {
      const [results, fromTag] = await Promise.all([
        getSuggestedReviewsForSender(row.id),
        getTaggedReviewForEntry(row.id),
      ]);
      setSuggestions(results);
      setTagged(fromTag);
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

  // The tagged review is shown on its own; don't list it twice.
  const otherSuggestions = suggestions.filter((c) => c.reviewId !== tagged?.reviewId);

  const listOpen = !!projectQuery && !projectId && !dismissed;
  const listboxId = `reassign-project-list-${row.id}`;
  const optionId = (id: string) => `reassign-option-${row.id}-${id}`;
  const active = activeIndex >= 0 && activeIndex < projectOptions.length ? activeIndex : -1;
  const activeOptionId = listOpen && active >= 0 ? optionId(projectOptions[active].id) : undefined;

  useEffect(() => {
    if (activeOptionId) document.getElementById(activeOptionId)?.scrollIntoView({ block: "nearest" });
  }, [activeOptionId]);

  function pickProject(p: ProjectSearchResult) {
    setProjectId(p.id);
    setProjectQuery(p.label);
    setReviewId("");
    setActiveIndex(-1);
  }

  function onProjectKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!listOpen) setDismissed(false);
      else setActiveIndex(Math.min(active + 1, projectOptions.length - 1));
    } else if (e.key === "ArrowUp" && listOpen) {
      e.preventDefault();
      setActiveIndex(active <= 0 ? projectOptions.length - 1 : active - 1);
    } else if (e.key === "Enter" && listOpen && active >= 0) {
      e.preventDefault();
      pickProject(projectOptions[active]);
    } else if (e.key === "Escape" && listOpen) {
      e.preventDefault();
      e.stopPropagation();
      setDismissed(true);
      setActiveIndex(-1);
    }
  }

  const effectiveReviewOptions = category === "stakeholder_response" && projectId ? reviewOptions : [];

  function handleReassign() {
    onCommit({
      message: "Reassigned & approved",
      run: () =>
        reassignQueueEntry(
          row.id,
          category,
          category === "new_submission" ? null : projectId || null,
          category === "stakeholder_response" ? reviewId || null : null
        ),
    });
  }

  const canSubmit =
    category === "new_submission"
      ? true
      : category === "thread_reply"
        ? !!projectId
        : !!projectId && !!reviewId;

  return (
    <div className="rise-in flex flex-wrap items-end gap-3 rounded-lg bg-zinc-50 p-4">
      {tagged && (
        <div className="w-full">
          <p className="text-xs font-medium text-zinc-700">The reply-to tag on this email points at:</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => applySuggestion(tagged)}
              className={suggestionChip(reviewId === tagged.reviewId)}
            >
              {tagged.projectLabel} — {tagged.reviewLabel}
            </button>
            {tagged.note && <span className="text-xs text-zinc-500">({tagged.note})</span>}
          </div>
        </div>
      )}

      {otherSuggestions.length > 0 && (
        <div className="w-full">
          <p className="text-xs font-medium text-zinc-700">
            {row.fromName ?? row.fromEmail} has open review{otherSuggestions.length === 1 ? "" : "s"} on:
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {otherSuggestions.map((c) => (
              <button
                key={c.reviewId}
                type="button"
                onClick={() => applySuggestion(c)}
                className={suggestionChip(reviewId === c.reviewId)}
              >
                {c.projectLabel} — {c.reviewLabel}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label htmlFor={`reassign-category-${row.id}`} className="block text-xs font-medium text-zinc-700">Category</label>
        <select
          id={`reassign-category-${row.id}`}
          value={category}
          onChange={(e) => {
            setCategory(e.target.value as QueueCategory);
            setReviewId("");
          }}
          className={`mt-1 ${FIELD}`}
        >
          <option value="new_submission">New submission</option>
          <option value="thread_reply">Thread reply</option>
          <option value="stakeholder_response">Stakeholder response</option>
        </select>
      </div>

      {category !== "new_submission" && (
        <div>
          <label htmlFor={`reassign-project-${row.id}`} className="block text-xs font-medium text-zinc-700">Step 1 — project</label>
          <input
            id={`reassign-project-${row.id}`}
            role="combobox"
            aria-expanded={listOpen && projectOptions.length > 0}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={activeOptionId}
            autoComplete="off"
            value={projectQuery}
            onChange={(e) => {
              setProjectQuery(e.target.value);
              setProjectId("");
              setReviewId("");
              setDismissed(false);
              setActiveIndex(-1);
            }}
            onKeyDown={onProjectKeyDown}
            placeholder="Search address / PO / project #…"
            className={`mt-1 block w-56 max-w-full ${FIELD}`}
          />
          {listOpen && projectOptions.length === 0 && (
            <p role="status" className="mt-1 w-56 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-500 shadow-sm">
              No matches.
            </p>
          )}
          {listOpen && projectOptions.length > 0 && (
            <div
              id={listboxId}
              role="listbox"
              aria-label="Matching projects"
              className="mt-1 max-h-40 w-56 overflow-y-auto rounded-md border border-zinc-200 bg-white shadow-sm"
            >
              {projectOptions.map((p, i) => (
                <div
                  key={p.id}
                  id={optionId(p.id)}
                  role="option"
                  aria-selected={i === active}
                  // Keep focus in the input so typing and arrows keep working.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickProject(p)}
                  className={`cursor-pointer truncate px-2 py-1.5 text-left text-xs text-zinc-700 transition-colors duration-150 [@media(pointer:coarse)]:flex [@media(pointer:coarse)]:min-h-10 [@media(pointer:coarse)]:items-center ${
                    i === active ? "bg-zinc-100" : "hover:bg-zinc-50"
                  }`}
                >
                  {p.label}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {category === "stakeholder_response" && (
        <div>
          <label htmlFor={`reassign-review-${row.id}`} className="block text-xs font-medium text-zinc-700">Step 2 — review cycle</label>
          <select
            id={`reassign-review-${row.id}`}
            value={reviewId}
            disabled={!projectId}
            onChange={(e) => setReviewId(e.target.value)}
            className={`mt-1 ${FIELD} disabled:bg-zinc-100`}
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
        <button type="button" onClick={onCancel} className={BTN_GHOST}>
          Cancel
        </button>
        <button type="button" disabled={!canSubmit} onClick={handleReassign} className={BTN_PRIMARY}>
          Reassign & approve
        </button>
      </div>
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
    <div className="rise-in flex flex-col gap-2 rounded-lg bg-zinc-50 p-4">
      {suggestions && suggestions.length > 0 && (
        <p className="text-xs text-zinc-500">
          {row.fromName ?? row.fromEmail} has open review{suggestions.length === 1 ? "" : "s"} on:{" "}
          {suggestions.map((c) => `${c.projectLabel} — ${c.reviewLabel}`).join("; ")}
        </p>
      )}
      <label htmlFor={`clarify-${row.id}`} className="text-xs font-medium text-zinc-700">Message to {row.fromEmail}</label>
      <textarea
        id={`clarify-${row.id}`}
        value={message}
        onChange={(e) => {
          setTouched(true);
          setMessage(e.target.value);
        }}
        rows={6}
        placeholder={suggestions === null ? "Loading a suggested draft…" : undefined}
        className={`w-full ${FIELD}`}
      />
      {!touched && suggestions !== null && (
        <p className="text-xs text-zinc-500">Pre-filled. Edit freely before sending.</p>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} disabled={isPending} className={BTN_GHOST}>
          Cancel
        </button>
        <button
          type="button"
          disabled={isPending || !message.trim()}
          onClick={handleSend}
          className={BTN_PRIMARY}
        >
          {isPending ? "Sending…" : "Send request"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

function RejectPanel({
  onCancel,
  onCommit,
  row,
}: {
  row: QueueRow;
  onCancel: () => void;
  onCommit: OnCommit;
}) {
  const [reason, setReason] = useState("");

  return (
    <div className="rise-in flex flex-col gap-2 rounded-lg bg-zinc-50 p-4">
      <label htmlFor={`reject-${row.id}`} className="text-xs font-medium text-zinc-700">
        Reason (optional, kept on the record)
      </label>
      <input
        id={`reject-${row.id}`}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="e.g. Not a real submission"
        className={`w-full ${FIELD}`}
      />
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className={BTN_GHOST}>
          Cancel
        </button>
        <button
          type="button"
          onClick={() =>
            onCommit({ message: "Rejected", run: () => rejectQueueEntry(row.id, reason) })
          }
          className={BTN_DANGER_SOLID}
        >
          Reject email
        </button>
      </div>
    </div>
  );
}

function ResolveActions({
  row,
  onCommit,
  onResolved,
}: {
  row: QueueRow;
  onCommit: OnCommit;
  onResolved: (message: string) => void;
}) {
  const [reassigning, setReassigning] = useState(false);
  const [clarifying, setClarifying] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  function handleApprove() {
    onCommit({
      message: row.proposedCategory === "stakeholder_response" ? "Filed, needs manual review resolution" : "Approved",
      persistent: row.proposedCategory === "stakeholder_response",
      run: () => approveQueueEntry(row.id),
    });
  }

  if (reassigning) {
    return <ReassignPanel row={row} onCancel={() => setReassigning(false)} onCommit={onCommit} />;
  }

  if (rejecting) {
    return <RejectPanel row={row} onCancel={() => setRejecting(false)} onCommit={onCommit} />;
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

  const noTarget = row.proposedCategory !== "new_submission" && !row.proposedTarget;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleApprove}
        disabled={noTarget}
        title={noTarget ? "No proposed target. Use Reassign instead." : undefined}
        className={BTN_PRIMARY}
      >
        {row.proposedCategory === "stakeholder_response" ? "File as proposed" : "Approve as proposed"}
      </button>
      <button type="button" onClick={() => setReassigning(true)} className={BTN_SECONDARY}>
        Reassign
      </button>
      {!row.proposedTarget && (
        <button
          type="button"
          onClick={() => setClarifying(true)}
          disabled={row.status === "awaiting_clarification"}
          title="Ask the sender which project/review this is regarding"
          className={BTN_SECONDARY}
        >
          {row.status === "awaiting_clarification" ? "Clarification requested" : "Request clarification"}
        </button>
      )}
      <button type="button" onClick={() => setRejecting(true)} className={`${BTN_DANGER} sm:ml-auto`}>
        Reject…
      </button>
      {row.proposedCategory === "stakeholder_response" && (
        <p className="w-full text-xs text-zinc-500">
          Files the reply against the proposed review for manual resolution. It doesn&apos;t change the
          review&apos;s status itself.
        </p>
      )}
    </div>
  );
}

function ReviewContextBlock({ context }: { context: NonNullable<QueueRow["context"]> }) {
  return (
    <div className="mt-3 max-w-xl space-y-1.5 rounded-lg bg-zinc-50 p-3 text-xs text-zinc-600">
      <p className="tabular-nums">
        <span className="font-medium text-zinc-800">Replying to:</span> Cycle {context.cycle} · {context.stakeholderName}
        {context.dispatchedAt ? ` · sent ${formatDay(context.dispatchedAt)}` : ""}
        {context.expiresAt ? ` · link ${new Date(context.expiresAt) < new Date() ? "expired" : "expires"} ${formatDay(context.expiresAt)}` : ""}
        {context.note && (
          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">{context.note}</span>
        )}
      </p>
      <p className={context.senderVerified ? "text-green-700" : "font-medium text-amber-800"}>
        {context.senderVerified
          ? "Sender is on this project's reviewer list."
          : "Sender isn't on this project's reviewer list. It will be filed as unverified."}
      </p>
    </div>
  );
}

// The reply on its own by default; the quoted thread is a click away.
function MessageBody({ row }: { row: QueueRow }) {
  const [showFull, setShowFull] = useState(false);
  const full = row.textBody?.trim() || "";
  const reply = row.strippedReply;
  const canToggle = !!reply && reply !== full;
  const text = canToggle && !showFull ? reply : full;

  return (
    <div className="mt-4 max-w-xl">
      <p className="whitespace-pre-wrap break-words rounded-lg bg-zinc-50 p-4 text-sm leading-relaxed text-zinc-700">
        {text || "(empty message body)"}
      </p>
      {canToggle && (
        <button
          type="button"
          onClick={() => setShowFull((v) => !v)}
          className={`press mt-1.5 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 transition-colors duration-150 hover:bg-zinc-200 hover:text-zinc-900 ${BTN_FOCUS} [@media(pointer:coarse)]:min-h-10 [@media(pointer:coarse)]:px-3`}
        >
          {showFull ? "Show reply only" : "Show full email, including quoted thread"}
        </button>
      )}
    </div>
  );
}

function ToastBar({
  toast,
  leaving,
  onUndo,
  onDismiss,
}: {
  toast: Toast;
  leaving?: boolean;
  onUndo?: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role={toast.kind === "error" ? "alert" : "status"}
      data-leaving={leaving ? "true" : undefined}
      className={`toast-item flex items-center gap-3 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg ${
        leaving ? "pointer-events-none" : ""
      }`}
    >
      {toast.kind === "error" ? (
        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-red-400" />
      ) : (
        <svg aria-hidden="true" className="h-4 w-4 shrink-0 text-green-400" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
      )}
      <span className="min-w-0 flex-1 break-words">{toast.message}</span>
      {toast.kind === "info" && toast.href && (
        <Link
          href={toast.href}
          className="press shrink-0 rounded-md bg-zinc-700 px-2 py-1 text-sm font-medium text-white transition-colors duration-150 hover:bg-zinc-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white [@media(pointer:coarse)]:inline-flex [@media(pointer:coarse)]:min-h-10 [@media(pointer:coarse)]:items-center"
        >
          {toast.hrefLabel ?? "Open"}
        </Link>
      )}
      {toast.kind === "undo" && onUndo && (
        <button
          type="button"
          onClick={onUndo}
          className="press shrink-0 rounded-md px-2 py-1 text-sm font-semibold text-white transition-colors duration-150 hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white [@media(pointer:coarse)]:min-h-10"
        >
          Undo
        </button>
      )}
      {(toast.kind === "error" || (toast.kind === "info" && toast.persistent)) && (
        <button
          type="button"
          onClick={onDismiss}
          className="press shrink-0 rounded-md px-2 py-1 text-sm font-medium text-zinc-300 transition-colors duration-150 hover:bg-zinc-700 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white [@media(pointer:coarse)]:min-h-10"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}

export function EmailQueueClient({ rows }: { rows: QueueRow[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<QueueStatus>("pending");
  const [toast, setToast] = useState<Toast | null>(null);
  // Messages that must survive the next action (errors, follow-up work) live
  // apart from the transient toast, so a new Undo toast never replaces them.
  const [note, setNote] = useState<Toast | null>(null);
  // The toast stays mounted for its 150ms exit (.toast-item[data-leaving]),
  // so it leaves the way it came in instead of vanishing.
  const [renderedToast, setRenderedToast] = useState<Toast | null>(toast);
  if (toast && toast !== renderedToast) setRenderedToast(toast);
  const toastLeaving = !toast && renderedToast !== null;
  useEffect(() => {
    if (!toastLeaving) return;
    const t = setTimeout(() => setRenderedToast(null), 150);
    return () => clearTimeout(t);
  }, [toastLeaving]);
  // Rows resolved this session that the server hasn't caught up on yet, or
  // that are waiting out their undo window. Hidden so the list stays honest.
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  // Below md the list and the detail are separate screens.
  const [showDetail, setShowDetail] = useState(false);
  // A row stays hidden only while it is still open on the server. Once the
  // refresh brings it back as approved/rejected it belongs in its history tab.
  const liveRows = rows.filter((r) => !(hidden.has(r.id) && RESOLVABLE_STATUSES.includes(r.status)));
  const visible = liveRows
    .filter((r) => r.status === tab)
    .sort((a, b) =>
      RESOLVABLE_STATUSES.includes(tab)
        ? new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime()
        : new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
    );
  const [selectedId, setSelectedId] = useState<string>(visible[0]?.id ?? "");
  const pendingRef = useRef<{ commit: Commit; timer: ReturnType<typeof setTimeout> } | null>(null);
  const focusRowRef = useRef(false);

  // The row a confirmation is about disappears from view the moment it is
  // resolved, so confirmations live here, outside the row that is about to
  // vanish, instead of inline where they'd be gone before anyone read them.
  useEffect(() => {
    if (!toast || toast.kind !== "info" || toast.persistent) return;
    const t = setTimeout(() => setToast(null), INFO_TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  // After auto-advance the resolve button that had focus is gone; put focus
  // on the newly selected row so keyboard use isn't dumped back at the top.
  useEffect(() => {
    if (!focusRowRef.current) return;
    focusRowRef.current = false;
    if (selectedId) document.querySelector<HTMLElement>(`[data-row-id="${selectedId}"]`)?.focus();
  }, [selectedId, hidden]);

  const unhide = useCallback((id: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  // `navigate: false` is for flushes the admin didn't wait for (they started
  // another action, switched tab, or left): a redirect then would hijack
  // whatever they're doing, so it becomes a link in the note instead.
  const execute = useCallback(
    async (commit: Commit, opts: { navigate?: boolean } = {}) => {
      const navigate = opts.navigate ?? true;
      // The undo window is over for this action; a still-visible Undo button
      // would do nothing. (A newer pending commit keeps its own toast.)
      if (!pendingRef.current) setToast((t) => (t?.kind === "undo" ? null : t));
      let res: QueueActionState;
      try {
        res = await commit.run();
      } catch {
        res = { error: "Something went wrong. Nothing was changed." };
      }
      if (res.error) {
        unhide(commit.rowId);
        // Don't steal the selection if the admin has already moved on.
        setSelectedId((cur) => cur || commit.rowId);
        setNote({ kind: "error", message: res.error });
        return;
      }
      if (res.redirectTo) {
        if (navigate) {
          router.push(res.redirectTo);
        } else {
          router.refresh();
          setNote({ kind: "info", message: commit.message, persistent: true, href: res.redirectTo, hrefLabel: "Open the project" });
        }
        return;
      }
      router.refresh();
      if (commit.persistent || res.followUpHref) {
        setNote({ kind: "info", message: commit.message, persistent: true, href: res.followUpHref, hrefLabel: "Open the project" });
      }
      else if (!pendingRef.current) setToast({ kind: "info", message: commit.message });
    },
    [router, unhide]
  );

  // Sends the waiting resolve right now (a newer one started, the admin left
  // the page, or the tab was hidden), so a pending action is never silently lost.
  const flushPending = useCallback(() => {
    const p = pendingRef.current;
    if (!p) return;
    clearTimeout(p.timer);
    pendingRef.current = null;
    void execute(p.commit, { navigate: false });
  }, [execute]);

  useEffect(() => {
    const onHide = () => {
      if (document.hidden) flushPending();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flushPending);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flushPending);
      flushPending();
    };
  }, [flushPending]);

  function startCommit(row: QueueRow, partial: Omit<Commit, "rowId">) {
    flushPending();
    const commit: Commit = { ...partial, rowId: row.id };

    // Auto-advance: next row down, else the one above, else nothing.
    const i = visible.findIndex((r) => r.id === row.id);
    const next = visible[i + 1] ?? visible[i - 1] ?? null;
    focusRowRef.current = true;
    setHidden((prev) => new Set(prev).add(row.id));
    setSelectedId(next?.id ?? "");
    if (!next) setShowDetail(false);

    setToast({ kind: "undo", message: commit.message });
    const timer = setTimeout(() => {
      pendingRef.current = null;
      void execute(commit);
    }, UNDO_MS);
    pendingRef.current = { commit, timer };
  }

  function undo() {
    const p = pendingRef.current;
    if (!p) return;
    clearTimeout(p.timer);
    pendingRef.current = null;
    unhide(p.commit.rowId);
    setSelectedId(p.commit.rowId);
    setToast(null);
  }

  function handleResolved(message: string) {
    router.refresh();
    setToast({ kind: "info", message });
  }

  // Re-anchor the selection to the first row whenever the active tab
  // changes, adjusted during render (React's documented alternative to an
  // effect for "reset state when some other value changes") rather than in
  // a useEffect, which would otherwise cause an extra render pass.
  const [prevTab, setPrevTab] = useState(tab);
  if (tab !== prevTab) {
    setPrevTab(tab);
    setSelectedId(visible[0]?.id ?? "");
    setShowDetail(false);
  }

  const selected = visible.find((r) => r.id === selectedId) ?? null;

  function onTabKeyDown(e: React.KeyboardEvent, index: number) {
    let to = -1;
    if (e.key === "ArrowRight") to = (index + 1) % TABS.length;
    else if (e.key === "ArrowLeft") to = (index - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = TABS.length - 1;
    if (to < 0) return;
    e.preventDefault();
    setTab(TABS[to].key);
    document.getElementById(`queue-tab-${TABS[to].key}`)?.focus();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Email Queue</h1>
          <p className="mt-1 text-sm text-zinc-500">Nothing runs automatically until you approve, reject, or reassign.</p>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white">
        <div role="tablist" aria-label="Queue status" className="flex gap-1 overflow-x-auto overscroll-x-contain border-b border-zinc-200 px-4 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((t, i) => (
            <button
              key={t.key}
              id={`queue-tab-${t.key}`}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              aria-controls="queue-panel"
              tabIndex={tab === t.key ? 0 : -1}
              onClick={() => setTab(t.key)}
              onKeyDown={(e) => onTabKeyDown(e, i)}
              className={`shrink-0 rounded-t-md px-3 py-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-zinc-900 [@media(pointer:coarse)]:min-h-11 ${
                tab === t.key ? "border-b-2 border-zinc-900 text-zinc-900" : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              {t.label}
              <span className="ml-1.5 text-xs tabular-nums text-zinc-500">
                ({liveRows.filter((r) => r.status === t.key).length})
              </span>
            </button>
          ))}
        </div>

        <div
          id="queue-panel"
          role="tabpanel"
          aria-labelledby={`queue-tab-${tab}`}
          className="flex md:h-[32rem]"
        >
          <div
            className={`w-full shrink-0 overflow-y-auto overscroll-contain border-zinc-200 md:block md:w-80 md:border-r ${
              showDetail ? "hidden" : "block max-h-[70dvh] md:max-h-none"
            }`}
          >
            {visible.length === 0 && (
              <p className="m-3 rounded-lg bg-zinc-50 p-4 text-center text-sm text-zinc-500">
                {EMPTY_TEXT[tab]}
              </p>
            )}
            {visible.map((row) => (
              <ListRow
                key={row.id}
                row={row}
                active={row.id === selectedId}
                onSelect={() => {
                  setSelectedId(row.id);
                  setShowDetail(true);
                }}
              />
            ))}
          </div>

          <div className={`min-w-0 flex-1 overflow-y-auto overscroll-contain p-4 md:block md:p-6 ${showDetail ? "block" : "hidden"}`}>
            <button
              type="button"
              onClick={() => setShowDetail(false)}
              className="press mb-3 inline-flex w-fit items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors duration-150 hover:bg-zinc-200 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 md:hidden [@media(pointer:coarse)]:min-h-10"
            >
              <span aria-hidden="true">←</span>
              Back to list
            </button>
            {!selected ? (
              <p className="text-sm text-zinc-500">Select an email.</p>
            ) : (
              <div key={selected.id} className="pane-in">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="break-words text-base font-semibold text-zinc-900">{selected.subject || "(no subject)"}</h2>
                  <CategoryBadge category={selected.proposedCategory} />
                </div>
                <p className="mt-1 break-words text-xs tabular-nums text-zinc-500">
                  {selected.fromName ? `${selected.fromName} · ` : ""}
                  {selected.fromEmail} · {formatDateTime(selected.receivedAt)}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
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
                          className={`rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-600 transition-colors duration-150 hover:bg-zinc-50 ${BTN_FOCUS}`}
                        >
                          {a.filename}
                        </a>
                      ) : (
                        <span key={i} className="rounded-md border border-zinc-200 bg-zinc-100 px-2 py-1 text-xs text-zinc-500">
                          {a.filename} (unavailable)
                        </span>
                      )
                    )}
                  </div>
                )}

                {selected.context && <ReviewContextBlock context={selected.context} />}

                <MessageBody key={selected.id} row={selected} />

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
                    {selected.status === "awaiting_clarification" && (
                      <p suppressHydrationWarning className="mt-1.5 border-t border-amber-200 pt-1.5 tabular-nums">
                        Waiting {ageOf(selected.clarificationRequestedAt).label} for a reply
                        {selected.clarificationExpiresAt
                          ? ` · their reply link ${new Date(selected.clarificationExpiresAt) < new Date() ? "expired" : "expires"} ${formatDay(selected.clarificationExpiresAt)}`
                          : ""}
                      </p>
                    )}
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
                  <div className="sticky bottom-0 z-10 -mx-4 -mb-4 mt-6 border-t border-zinc-200 bg-white px-4 py-4 md:-mx-6 md:-mb-6 md:px-6">
                    <div className="max-w-xl">
                    <ResolveActions
                      key={selected.id}
                      row={selected}
                      onCommit={(partial) => startCommit(selected, partial)}
                      onResolved={handleResolved}
                    />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {(note || renderedToast) && (
        <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 right-4 z-50 flex flex-col gap-2 sm:left-auto sm:max-w-md">
          {note && <ToastBar toast={note} onDismiss={() => setNote(null)} />}
          {renderedToast && (
            <ToastBar toast={renderedToast} leaving={toastLeaving} onUndo={undo} onDismiss={() => setToast(null)} />
          )}
        </div>
      )}
    </div>
  );
}
