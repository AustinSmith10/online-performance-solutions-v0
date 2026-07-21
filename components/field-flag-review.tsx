"use client";

import { useState } from "react";
import { resolveFieldFlag, type ResolutionReason } from "@/app/actions/field-flags";
import type { Confidence } from "@/lib/documents/extractor";

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
  onResolved?: (value: string) => void;
  // Re-extract conflict flow: this component *is* the "you're about to
  // override an already-resolved value" warning, so it starts expanded and
  // pre-loaded with the conflict banner already showing (no discovery step
  // via a failed submit) — see reExtractProject / ReExtractButton.
  initiallyExpanded?: boolean;
  initialConflict?: { resolvedByEmail: string; resolvedValue: string };
  // Stakeholders resolving their own flag already attest to reviewing it via
  // the submission form's confirmation checkbox — asking them to also pick
  // a "reason" from a vocabulary written for consultants (e.g. "Resolved on
  // stakeholder's behalf") is both confusing and redundant. In that context
  // the reason is fixed to "self_resolved" and only an optional note shows.
  stakeholderView?: boolean;
}

const REASON_OPTIONS: { value: ResolutionReason; label: string }[] = [
  { value: "self_resolved", label: "Self-resolved" },
  { value: "resolved_for_stakeholder", label: "Resolved on stakeholder's behalf" },
  { value: "resolved_independently", label: "Resolved independently" },
];

export function FieldFlagReview({
  flagId,
  label,
  currentValue,
  candidates,
  onResolved,
  initiallyExpanded,
  initialConflict,
  stakeholderView,
}: Props) {
  const [expanded, setExpanded] = useState(!!initiallyExpanded || !!initialConflict);
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

  async function handleResolve() {
    if (!value.trim()) {
      setError("A value is required.");
      return;
    }
    setPending(true);
    setError(null);
    const result = await resolveFieldFlag(flagId, { value: value.trim(), reason, note, force: sawConflict });
    setPending(false);
    if (result.ok) {
      onResolved?.(value.trim());
      setExpanded(false);
      return;
    }
    if (result.conflict) {
      setConflict({ resolvedByEmail: result.resolvedByEmail, resolvedValue: result.resolvedValue });
      setSawConflict(true);
      return;
    }
    setError(result.error);
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 hover:bg-orange-200"
      >
        Needs review
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-3 rounded-md border border-orange-200 bg-orange-50/60 p-3">
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

      <div>
        <p className="mb-1 text-xs font-medium text-zinc-700">{label} — candidates found:</p>
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
                  ({c.confidence} confidence — {c.source_document})
                </span>
                {c.reason && <span className="block text-[11px] italic text-orange-700">{c.reason}</span>}
              </span>
            </label>
          ))}
        </div>
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

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleResolve}
          disabled={pending}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {pending ? "Resolving…" : "Resolve"}
        </button>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          disabled={pending}
          className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-700 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
