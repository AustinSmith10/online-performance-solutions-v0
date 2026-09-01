"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DocumentViewer, isPreviewable } from "@/components/DocumentViewer";
import { ProgressTrack } from "@/components/ProgressTrack";
import { Spinner, formatFileSize } from "./shared";
import { SUPPORT_MAILTO } from "@/lib/config/support";
import type { ClientPipelineFile, FileRequirement } from "./pipelineTypes";

interface FileSlotProps {
  requirement: FileRequirement;
  files: ClientPipelineFile[];
  disabled?: boolean;
  onAddFiles: (requirement: FileRequirement, files: File[]) => void;
  onRemove: (localId: string) => void;
  onConfirm: (localId: string) => void;
  onRetry: (localId: string) => void;
}

/**
 * Real-time per-file slot (#115) — replaces the old batch-upload FileSlot.
 * Each dropped file uploads and pipelines (verify, then extract if
 * applicable) independently and immediately; this component renders every
 * file's own settling state rather than one slot-wide loading spinner.
 */
export function FileSlot({ requirement, files, disabled, onAddFiles, onRemove, onConfirm, onRetry }: FileSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [previewLocalId, setPreviewLocalId] = useState<string | null>(null);
  const previewFile = files.find((f) => f.localId === previewLocalId) ?? null;

  const multi = requirement.max_count > 1;
  const remainingSlots = requirement.max_count - files.length;
  const atCapacity = remainingSlots <= 0;
  const isBlocked = !!disabled || atCapacity;

  function handleFiles(list: FileList | null) {
    if (!list || isBlocked) return;
    const arr = Array.from(list).slice(0, remainingSlots);
    if (arr.length === 0) return;

    const nonPdf = arr.find((f) => f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf"));
    if (nonPdf) {
      setSlotError(`"${nonPdf.name}" is not a PDF. Only PDF files are accepted.`);
      return;
    }
    const oversized = arr.find((f) => f.size > 50 * 1024 * 1024);
    if (oversized) {
      setSlotError(`"${oversized.name}" exceeds the 50 MB limit (${formatFileSize(oversized.size)}).`);
      return;
    }
    if (requirement.no_duplicates) {
      const existingNames = new Set(files.map((f) => f.name));
      const dup = arr.find((f) => existingNames.has(f.name));
      if (dup) {
        setSlotError(`"${dup.name}" has already been uploaded to this slot.`);
        return;
      }
    }

    setSlotError(null);
    onAddFiles(requirement, arr);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-zinc-700">
        {requirement.name}
        {multi && ` (up to ${requirement.max_count})`}
        {requirement.required ? (
          <span className="ml-0.5 text-red-500">*</span>
        ) : (
          <span className="ml-1 font-normal text-zinc-400">— optional</span>
        )}
      </label>

      <div className="space-y-2">
        {files.map((f) => (
          <FileCard
            key={f.localId}
            file={f}
            onRemove={() => onRemove(f.localId)}
            onConfirm={() => onConfirm(f.localId)}
            onRetry={() => onRetry(f.localId)}
            onPreview={() => setPreviewLocalId(f.localId)}
            disabled={disabled}
          />
        ))}

        {!atCapacity && (
          <div
            className={`relative flex min-h-[72px] flex-col items-center justify-center overflow-hidden rounded-md border-2 border-dashed px-4 py-4 text-center transition-colors ${
              isBlocked
                ? "cursor-default border-zinc-100 bg-zinc-50"
                : isDragging
                ? "cursor-pointer border-zinc-500 bg-zinc-100"
                : "cursor-pointer border-zinc-200 bg-zinc-50 hover:border-zinc-400 hover:bg-zinc-100"
            }`}
            onClick={() => !isBlocked && inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              if (!isBlocked) setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              handleFiles(e.dataTransfer.files);
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              multiple={multi}
              disabled={isBlocked}
              className="sr-only"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <p className="text-sm font-medium text-zinc-600">
              Click or drag to upload {requirement.name.toLowerCase()}
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              PDF{multi ? `, up to ${remainingSlots} more` : ""}, 50 MB each
            </p>
          </div>
        )}
      </div>

      {slotError && <p className="mt-1 text-xs text-red-600">{slotError}</p>}

      {previewFile && typeof document !== "undefined" &&
        createPortal(
          // Portalled to <body> so a transformed/contained ancestor can't
          // become the containing block for this `fixed` overlay (same trap as
          // #177 for DocumentPreviewModal).
        <div
          className="fixed inset-0 z-[100] flex flex-col items-center bg-black/50 p-4"
          onClick={() => setPreviewLocalId(null)}
        >
          <div
            className="flex min-h-0 w-full max-w-3xl flex-1 flex-col overflow-hidden rounded-lg bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-4 py-3">
              <p className="truncate text-sm font-medium text-zinc-900">{previewFile.name}</p>
              <button
                type="button"
                onClick={() => setPreviewLocalId(null)}
                className="shrink-0 rounded-md px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
              >
                Close
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              <DocumentViewer src={previewFile.objectUrl} filename={previewFile.name} fill />
            </div>
          </div>
        </div>,
          document.body
        )}
    </div>
  );
}

function statusLabel(f: ClientPipelineFile): { text: string; tone: "neutral" | "amber" | "green" | "red" } {
  if (f.uploading || f.stage === "uploading") return { text: "Uploading…", tone: "neutral" };
  if (f.error) return { text: f.error, tone: "red" };
  // Streamed stages (#115 SSE) — a live narration of what's actually
  // happening to this file right now, ahead of the coarser status flags.
  if (f.stage === "reading") return { text: "Reading the document…", tone: "neutral" };
  if (f.stage === "verifying") return { text: "Checking it's the right document…", tone: "neutral" };
  if (!f.verificationCompleted) return { text: "Checking…", tone: "neutral" };
  if (f.mismatchReasons && !f.confirmed) return { text: "Needs review", tone: "amber" };
  if (f.stage === "extracting") return { text: "Extracting values…", tone: "neutral" };
  if (f.extractionStatus === "running" || f.extractionStatus === "pending") {
    return { text: "Extracting…", tone: "neutral" };
  }
  if (f.extractionStatus === "failed") return { text: "Extraction failed", tone: "red" };
  return { text: "Ready", tone: "green" };
}

// Step-based progress (#130) — jumps in discrete steps that mirror the real
// pipeline stages (Uploading → Reading → Checking → Extracting → Ready). The
// SSE pipeline (#115) feeds `stage` for the finer reading/verifying steps
// and `extractProgress` for a real "N of M values" fill during extraction;
// without a stream (reconnect poll) it falls back to the original four
// steps. A flagged file halts at "Needs review" rather than advancing. Hard
// failures get their own error messaging instead of a bar.
export function stepProgress(f: ClientPipelineFile): number | null {
  if (f.error || f.extractionStatus === "failed") return null;
  if (f.uploading || f.stage === "uploading") return 25;
  if (f.stage === "reading") return 40;
  if (f.stage === "verifying") return 55;
  if (!f.verificationCompleted) return 50;
  if (f.mismatchReasons && !f.confirmed) return 50;
  if (f.stage === "extracting" || f.extractionStatus === "running" || f.extractionStatus === "pending") {
    if (f.extractProgress && f.extractProgress.total > 0) {
      const frac = f.extractProgress.found / f.extractProgress.total;
      return 75 + Math.min(24, Math.max(0, Math.round(frac * 24)));
    }
    return 75;
  }
  return 100;
}

function FileCard({
  file,
  onRemove,
  onConfirm,
  onRetry,
  onPreview,
  disabled,
}: {
  file: ClientPipelineFile;
  onRemove: () => void;
  onConfirm: () => void;
  onRetry: () => void;
  onPreview: () => void;
  disabled?: boolean;
}) {
  const flagged = !!file.mismatchReasons && !file.confirmed;
  const status = statusLabel(file);
  const busy =
    file.uploading ||
    !!file.stage ||
    !file.verificationCompleted ||
    file.extractionStatus === "running" ||
    file.extractionStatus === "pending";
  const pct = stepProgress(file);
  // Live one-liner under the status while a file is still settling, and the
  // "Found N of M values" summary that persists next to Ready.
  const detail = !file.error && !flagged ? file.stageDetail : null;

  return (
    <div
      className={`rounded-lg border px-3 py-2.5 ${
        flagged
          ? "border-amber-200 bg-amber-50"
          : file.error || file.extractionStatus === "failed"
          ? "border-red-200 bg-red-50"
          : "border-zinc-200 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-zinc-800">{file.name}</p>
          <p className="text-xs text-zinc-400">{formatFileSize(file.size)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {busy && <Spinner className="h-3.5 w-3.5 text-zinc-400" />}
          <span
            className={`text-xs font-medium ${
              status.tone === "amber"
                ? "text-amber-700"
                : status.tone === "green"
                ? "text-green-700"
                : status.tone === "red"
                ? "text-red-600"
                : "text-zinc-400"
            }`}
          >
            {status.text}
          </span>
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className="text-xs text-zinc-400 hover:text-red-600 disabled:opacity-40"
          >
            Remove
          </button>
        </div>
      </div>

      {pct !== null && (
        <div className="mt-2">
          <ProgressTrack pct={pct} />
        </div>
      )}

      {detail && <p className="mt-1.5 text-xs text-zinc-500">{detail}</p>}

      {flagged && (
        <div className="mt-2">
          <ul className="list-disc space-y-0.5 pl-4 text-xs text-amber-800">
            {file.mismatchReasons!.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
          <div className="mt-2 flex items-center gap-2">
            {isPreviewable(file.name, file.objectUrl) && (
              <button
                type="button"
                onClick={onPreview}
                className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Preview
              </button>
            )}
            <button
              type="button"
              disabled={disabled}
              onClick={onConfirm}
              className="rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              Yes, this is the right file
            </button>
          </div>
        </div>
      )}

      {file.extractionStatus === "failed" && (
        <div className="mt-2 space-y-1.5">
          {file.extractionError && <p className="text-xs text-red-600">{file.extractionError}</p>}
          <p className="text-xs text-red-700">
            We couldn&apos;t read this document. Here&apos;s what to try next:
          </p>
          <ul className="list-disc space-y-0.5 pl-4 text-xs text-red-700">
            <li>
              <span className="font-medium">Retry</span> — a temporary glitch usually clears on a
              second attempt.
            </li>
            <li>
              <span className="font-medium">Replace the file</span> — remove it and upload a clearer
              copy (a text-based PDF reads best; a photo or scan of a page often doesn&apos;t).
            </li>
            <li>
              Still stuck?{" "}
              <a href={SUPPORT_MAILTO} className="font-medium underline hover:text-red-900">
                Contact support
              </a>
              .
            </li>
          </ul>
          <div className="flex items-center gap-2 pt-0.5">
            <button
              type="button"
              disabled={disabled}
              onClick={onRetry}
              className="rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Retry
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={onRemove}
              className="rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Remove &amp; replace
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
