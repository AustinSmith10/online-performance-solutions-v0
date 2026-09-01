"use client";

import { useState } from "react";
import {
  resolveFieldFlag,
  resolveAndAcknowledgeFieldFlag,
  type ResolutionReason,
} from "@/app/actions/field-flags";
import { DocumentPreviewModal } from "@/components/DocumentPreviewModal";
import { isPreviewable } from "@/components/DocumentViewer";
import { FlagAcknowledgeControl } from "@/app/(consultant)/ops/projects/[id]/_components/FlagAcknowledgeControl";
import type { Confidence } from "@/lib/documents/extractor";
import type { FlagType } from "@/lib/documents/field-flags";

export interface FieldFlagCandidate {
  value: string;
  confidence: Confidence;
  source_document: string;
  // Set only when the verification pass downgraded this candidate's
  // self-graded confidence — shown as a caption, descriptive metadata only,
  // never a second resolvable thing (extraction-verification-layer-decisions #8a).
  reason?: string;
}

interface Props {
  flagId: string;
  label: string;
  currentValue: string;
  candidates: FieldFlagCandidate[];
  // #105: a flag renders inline in Submitted details for its whole
  // lifetime, not just while open — "resolved" is a compact read-only
  // reference (accepted value + full candidate list, each previewable).
  // Further edits go through the row's own pencil/free-text edit, not this
  // component — this never reopens the picker once resolved (outside the
  // forced re-extract-conflict flow via initiallyExpanded/initialConflict).
  status: "open" | "resolved";
  resolvedByEmail?: string | null;
  resolvedAt?: string | null;
  // original_filename -> signed URL, so each candidate can open its own
  // source document in the shared viewer (#104) regardless of which one
  // ended up as the accepted value.
  sourceUrlsByFilename?: Record<string, string | null>;
  // Consultant acknowledgment (#105) — independent of resolution status, so
  // it renders here regardless of whether the flag is open or resolved.
  // Undefined (not just null) means "don't show acknowledgment at all" —
  // used by stakeholderView, which never gets this data.
  acknowledgedByEmail?: string | null;
  acknowledgedAt?: string | null;
  // Opt-in: only the consultant/admin "Submitted details" row wants the
  // acknowledgment control rendered here. The re-extract conflict flow
  // (ReExtractButton) and the stakeholder portal reuse this same component
  // without it — acknowledging is a distinct action from resolving a
  // conflict, and stakeholders can't acknowledge at all.
  showAcknowledgment?: boolean;
  onResolved?: (value: string) => void;
  // Re-extract conflict flow: this component *is* the "you're about to
  // override an already-resolved value" warning, so it starts in edit mode
  // and pre-loaded with the conflict banner already showing (no discovery
  // step via a failed submit) — see reExtractProject / ReExtractButton.
  initiallyExpanded?: boolean;
  initialConflict?: { resolvedByEmail: string; resolvedValue: string };
  // Stakeholders resolving their own flag already attest to reviewing it via
  // the submission form's confirmation checkbox — asking them to also pick
  // a "reason" from a vocabulary written for consultants (e.g. "Resolved on
  // stakeholder's behalf") is both confusing and redundant. In that context
  // the reason is fixed to "self_resolved" and only an optional note shows.
  stakeholderView?: boolean;
  // Distinguishes an inconsistency (2+ distinct candidates) from a plain
  // low/medium-confidence flag — same underlying record (#58), but the
  // reviewer's situation differs enough to warrant a different visual
  // treatment: "these disagree, pick one" vs. "this one's uncertain" (#67).
  flagType?: FlagType;
}

// Intl.DateTimeFormat("en-AU") pads differently depending on the runtime's
// ICU data (e.g. Node's bundled ICU vs. the browser's) — this component
// renders both during SSR and again on hydration, so a mismatch there
// throws a hydration error. Format manually (fixed DD/MM/YYYY, UTC so the
// server and browser can't land in different local timezones) instead of
// relying on toLocaleDateString here.
function formatAuDate(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${d.getUTCFullYear()}`;
}

const REASON_OPTIONS: { value: ResolutionReason; label: string }[] = [
  { value: "self_resolved", label: "Self-resolved" },
  { value: "resolved_for_stakeholder", label: "Resolved on stakeholder's behalf" },
  { value: "resolved_independently", label: "Resolved independently" },
];

function CandidatePreviewButton({
  filename,
  sourceUrlsByFilename,
}: {
  filename: string;
  sourceUrlsByFilename?: Record<string, string | null>;
}) {
  const href = sourceUrlsByFilename?.[filename] ?? null;
  if (!href) return null;
  return (
    <DocumentPreviewModal
      href={href}
      filename={filename}
      buttonLabel="Preview"
      buttonClassName="ml-1 rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 hover:bg-zinc-50"
    />
  );
}

export function FieldFlagReview({
  flagId,
  label,
  currentValue,
  candidates,
  status,
  resolvedByEmail,
  resolvedAt,
  sourceUrlsByFilename,
  acknowledgedByEmail,
  acknowledgedAt,
  showAcknowledgment,
  onResolved,
  initiallyExpanded,
  initialConflict,
  stakeholderView,
  flagType = "confidence",
}: Props) {
  const isConflict = flagType === "inconsistency" || flagType === "both";
  // The conflict flow forces the full picker open even for an already-
  // "resolved" flag — that's the one case where a resolved flag still needs
  // this component's editor rather than the plain pencil edit.
  const forcedOpen = !!initiallyExpanded || !!initialConflict;
  const [editing, setEditing] = useState(forcedOpen || status === "open");

  // buildFieldFlagPlan (lib/documents/field-flags.ts) synthesizes exactly
  // this one candidate — value "", confidence "low", source_document "none"
  // — when extraction found nothing in any document for this field. In that
  // case the value on screen came from the stakeholder typing it in
  // directly at submission (required before they could submit at all, see
  // submission.ts's blankFlaggedFields check), not from anything extracted.
  // There's no source document to check it against, so asking a consultant
  // to "acknowledge" it is meaningless — never require that step here,
  // regardless of showAcknowledgment.
  const hasNoExtractionEvidence =
    candidates.length === 1 && candidates[0].source_document === "none";
  const requiresAcknowledgment = !!showAcknowledgment && !hasNoExtractionEvidence;

  // The open-flag editing form below merges "Resolve" and "Review &
  // acknowledge" into one action when requiresAcknowledgment is set (#116) —
  // the standalone FlagAcknowledgeControl button is only needed in the two
  // read-only render paths, where there's no active resolve form to fold it
  // into.
  const ackBlock = requiresAcknowledgment ? (
    acknowledgedAt ? (
      <p className="text-[11px] text-green-700">
        ✓ Acknowledged by {acknowledgedByEmail ?? "a consultant"} on{" "}
        {formatAuDate(acknowledgedAt)}
      </p>
    ) : (
      <FlagAcknowledgeControl
        flagId={flagId}
        label={label}
        currentValue={currentValue}
        candidates={candidates}
        sourceUrlsByFilename={sourceUrlsByFilename}
      />
    )
  ) : null;
  const [value, setValue] = useState(currentValue);
  const [reason, setReason] = useState<ResolutionReason>("self_resolved");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ resolvedByEmail: string; resolvedValue: string } | null>(
    initialConflict ?? null
  );
  // Once a conflict has been shown (whether from a failed submit, or because
  // this instance opened already knowing about one via initialConflict),
  // the next resolve attempt is a conscious override — force it through.
  const [sawConflict, setSawConflict] = useState(!!initialConflict);
  // Only relevant when requiresAcknowledgment merges resolve+acknowledge
  // into one action — mirrors FlagAcknowledgeControl's own confirm checkbox.
  const [confirmed, setConfirmed] = useState(false);

  async function handleResolve() {
    if (!value.trim()) {
      setError("A value is required.");
      return;
    }
    setPending(true);
    setError(null);
    const action = requiresAcknowledgment ? resolveAndAcknowledgeFieldFlag : resolveFieldFlag;
    const result = await action(flagId, {
      value: value.trim(),
      reason,
      note,
      force: sawConflict || status === "resolved",
    });
    setPending(false);
    if (result.ok) {
      onResolved?.(value.trim());
      setEditing(false);
      return;
    }
    if (result.conflict) {
      setConflict({ resolvedByEmail: result.resolvedByEmail, resolvedValue: result.resolvedValue });
      setSawConflict(true);
      return;
    }
    setError(result.error);
  }

  const selectedCandidate =
    candidates.find((c) => c.value === value) ?? candidates.find((c) => c.value === currentValue);
  const selectedSourceUrl = selectedCandidate
    ? sourceUrlsByFilename?.[selectedCandidate.source_document] ?? null
    : null;
  const selectedPreviewAvailable =
    !!selectedSourceUrl && isPreviewable(selectedCandidate?.source_document, selectedSourceUrl);

  // Nothing worth showing once resolved: stakeholders never need this
  // read-only reference card at all (they already attested to the value via
  // the submission form), and consultants don't either when the flag has no
  // real extraction evidence to reference (hasNoExtractionEvidence — just the
  // stakeholder's own typed-in value, nothing to compare candidates against).
  const suppressResolvedCard = stakeholderView || hasNoExtractionEvidence;

  if (!editing && status === "resolved") {
    if (suppressResolvedCard) return null;
    // #105 tweak: once resolved, this field is done with the picker for
    // good — the row's own pencil icon now handles further edits as a plain
    // free-text field, same as any other submitted detail. This stays only
    // as a compact, read-only reference: the accepted value in a disabled
    // dropdown (so the other candidates remain visible for context) plus a
    // preview trigger per candidate, and the acknowledgment control.
    return (
      <div className="mt-2 space-y-1.5 rounded-md border border-zinc-200 bg-zinc-50/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <select
            disabled
            value={currentValue}
            aria-label={`${label} — accepted value (read-only)`}
            className="min-w-0 max-w-full flex-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 disabled:opacity-100"
          >
            {candidates.map((c, i) => (
              <option key={`${c.value}-${i}`} value={c.value}>
                {c.value || "(empty)"} · {c.source_document}
              </option>
            ))}
          </select>
          {ackBlock}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {candidates.map((c, i) => (
            <span key={`${c.value}-${i}`} className="text-xs text-zinc-500">
              {c.value || "(empty)"}
              <CandidatePreviewButton
                filename={c.source_document}
                sourceUrlsByFilename={sourceUrlsByFilename}
              />
            </span>
          ))}
        </div>
        {resolvedByEmail && (
          <p className="text-[11px] text-zinc-400">
            Resolved by {resolvedByEmail}
            {resolvedAt && ` on ${formatAuDate(resolvedAt)}`}
          </p>
        )}
      </div>
    );
  }

  if (!editing) {
    if (suppressResolvedCard) return null;
    // Transient: an "open" flag momentarily between a successful resolve
    // and the parent's router.refresh() picking up status="resolved".
    return (
      <div
        className={
          isConflict
            ? "mt-2 space-y-1.5 rounded-md border border-red-200 bg-red-50/60 p-3"
            : "mt-2 space-y-1.5 rounded-md border border-zinc-200 bg-zinc-50/60 p-3"
        }
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium text-zinc-700">
            {label} — {candidates.length} candidate{candidates.length === 1 ? "" : "s"} found
          </p>
          {ackBlock}
        </div>
        <div className="space-y-1">
          {candidates.map((c, i) => (
            <p key={`${c.value}-${i}`} className="text-xs text-zinc-600">
              <span className={c.value === currentValue ? "font-semibold text-zinc-900" : "text-zinc-700"}>
                {c.value || "(empty)"}
              </span>{" "}
              <span className="text-zinc-400">
                ({c.source_document})
              </span>
              {c.value === currentValue && (
                <span className="ml-1 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                  accepted
                </span>
              )}
              <CandidatePreviewButton
                filename={c.source_document}
                sourceUrlsByFilename={sourceUrlsByFilename}
              />
            </p>
          ))}
        </div>
        {resolvedByEmail && (
          <p className="text-[11px] text-zinc-400">
            Resolved by {resolvedByEmail}
            {resolvedAt && ` on ${formatAuDate(resolvedAt)}`}
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      className={
        isConflict
          ? "mt-2 space-y-3 rounded-md border border-red-200 bg-red-50/60 p-3"
          : "mt-2 space-y-3 rounded-md border border-orange-200 bg-orange-50/60 p-3"
      }
    >
      {conflict && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Already resolved by <strong>{conflict.resolvedByEmail}</strong> as{" "}
          <strong>&quot;{conflict.resolvedValue}&quot;</strong>. You can still override it below.
          <button
            type="button"
            onClick={() => {
              setValue(conflict.resolvedValue);
              setConflict(null);
            }}
            className="ml-2 underline hover:text-amber-900"
          >
            Use their value
          </button>
        </div>
      )}

      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-zinc-700">{label} — candidates found:</p>
        {!requiresAcknowledgment && ackBlock}
      </div>

      <div className="space-y-1">
        {candidates.map((c, i) => (
          <label
            key={`${c.value}-${i}`}
            className="flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 text-xs text-zinc-700 hover:bg-orange-100"
          >
            <input
              type="radio"
              checked={value === c.value}
              onChange={() => setValue(c.value)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium text-zinc-900">{c.value || "(empty)"}</span>{" "}
              <span className="text-zinc-400">
                ({c.source_document})
              </span>
              {/* The value that came in on the submission for this field —
                  either the submitter picked this candidate on the review
                  step, or it was the auto-selected value they left in place.
                  Either way it's what the submission asserts, not a system
                  "default" (#105) — label it as the submitter's choice so the
                  consultant knows what they're verifying against the source. */}
              {c.value === currentValue && (
                <span className="ml-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                  Submitter&apos;s choice
                </span>
              )}
              <CandidatePreviewButton
                filename={c.source_document}
                sourceUrlsByFilename={sourceUrlsByFilename}
              />
              {c.reason && <span className="block text-[11px] italic text-orange-700">{c.reason}</span>}
            </span>
          </label>
        ))}
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-700">Or enter the correct value</label>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={pending}
          className="w-full rounded-md border border-zinc-200 px-2.5 py-1.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:opacity-60"
        />
      </div>

      {requiresAcknowledgment && (
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-zinc-700">Source document</label>
          {selectedPreviewAvailable ? (
            <DocumentPreviewModal
              href={selectedSourceUrl}
              filename={selectedCandidate?.source_document}
              buttonClassName="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            />
          ) : (
            <span className="text-xs text-zinc-500">No previewable source document found for this candidate.</span>
          )}
        </div>
      )}

      {!stakeholderView && (
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-zinc-700">Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as ResolutionReason)}
              disabled={pending}
              className="w-full rounded-md border border-zinc-200 px-2.5 py-1.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:opacity-60"
            >
              {REASON_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-700">Note (optional)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={pending}
          rows={2}
          className="w-full rounded-md border border-zinc-200 px-2.5 py-1.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:opacity-60"
        />
      </div>

      {requiresAcknowledgment && (
        <label className="flex cursor-pointer items-start gap-2 text-xs text-zinc-700">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5"
          />
          I&apos;ve reviewed this field and its source document.
        </label>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleResolve}
          disabled={pending || (requiresAcknowledgment && !confirmed)}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {pending ? "Resolving…" : requiresAcknowledgment ? "Resolve & acknowledge" : "Resolve"}
        </button>
        {status === "resolved" && (
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={pending}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-700 disabled:opacity-50"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
