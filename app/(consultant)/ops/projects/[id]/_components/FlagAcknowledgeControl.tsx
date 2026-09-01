"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { acknowledgeFieldFlag } from "@/app/actions/field-flags";
import { DocumentViewer, isPreviewable } from "@/components/DocumentViewer";
import type { FieldFlagCandidate } from "@/components/field-flag-review";

interface Props {
  flagId: string;
  label: string;
  currentValue: string;
  candidates: FieldFlagCandidate[];
  sourceUrlsByFilename?: Record<string, string | null>;
  triggerLabel?: string;
  triggerClassName?: string;
}

const DEFAULT_TRIGGER_CLASS =
  "rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50";

/**
 * The consultant's per-flag acknowledgment (#105), also reused as the
 * standalone "Review" modal from the Right Now Focus Card's flag-review
 * step (#114) — same candidate list + accepted badge + source preview +
 * confirm checkbox + Acknowledge action either way, just triggered from a
 * different place (inline in Submitted details, or from the Focus Card).
 */
export function FlagAcknowledgeControl({
  flagId,
  label,
  currentValue,
  candidates,
  sourceUrlsByFilename,
  triggerLabel = "Review & acknowledge",
  triggerClassName = DEFAULT_TRIGGER_CLASS,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const acceptedIdx = Math.max(0, candidates.findIndex((c) => c.value === currentValue));
  const accepted = candidates[acceptedIdx] ?? candidates[0];
  const sourceUrl = accepted ? sourceUrlsByFilename?.[accepted.source_document] ?? null : null;
  const sourceFilename = accepted?.source_document;

  async function handleAcknowledge() {
    setPending(true);
    setError(null);
    const result = await acknowledgeFieldFlag(flagId);
    setPending(false);
    if (result.ok) {
      setDone(true);
      setOpen(false);
      router.refresh();
      return;
    }
    setError(result.error);
  }

  if (done) {
    return (
      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
        Acknowledged
      </span>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={triggerClassName}>
        {triggerLabel}
      </button>
      {open && typeof document !== "undefined" &&
        createPortal(
          // Portalled to <body>: rendered inline, a transformed/contained
          // ancestor on the project page becomes the containing block for this
          // `fixed` overlay, so the scrim stops short and the 100dvh panel is
          // offset past the viewport (same trap as #177 for DocumentPreviewModal).
        <div
          className="fixed inset-0 z-[100] flex flex-col items-center bg-black/50 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex min-h-0 w-full max-w-3xl flex-1 flex-col overflow-hidden rounded-lg bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-4 py-3">
              <p className="truncate text-sm font-medium text-zinc-900">{label}</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 rounded-md px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
              >
                Close
              </button>
            </div>

            <div className="shrink-0 space-y-1 border-b border-zinc-100 px-4 py-3">
              {candidates.map((c, i) => (
                <p key={`${c.value}-${i}`} className="text-xs text-zinc-600">
                  <span className={i === acceptedIdx ? "font-semibold text-zinc-900" : "text-zinc-700"}>
                    {c.value || "(empty)"}
                  </span>{" "}
                  <span className="text-zinc-400">
                    ({c.source_document})
                  </span>
                  {i === acceptedIdx && (
                    <span className="ml-1.5 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                      selected
                    </span>
                  )}
                </p>
              ))}
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-auto">
              {sourceUrl && isPreviewable(sourceFilename, sourceUrl) ? (
                <DocumentViewer src={sourceUrl} filename={sourceFilename} fill />
              ) : (
                <p className="px-6 py-12 text-center text-sm text-zinc-500">
                  No previewable source document found for this candidate.
                </p>
              )}
            </div>

            <div className="shrink-0 space-y-2 border-t border-zinc-100 px-4 py-3">
              <label className="flex cursor-pointer items-start gap-2 text-xs text-zinc-700">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5"
                />
                I&apos;ve reviewed this field and its source document.
              </label>
              <div className="flex items-center justify-between gap-3">
                {error && <p className="text-xs text-red-600">{error}</p>}
                <div className="ml-auto flex gap-2">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    disabled={pending}
                    className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-700 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAcknowledge}
                    disabled={pending || !confirmed}
                    className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
                  >
                    {pending ? "Acknowledging…" : "Acknowledge"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>,
          document.body
        )}
    </>
  );
}
