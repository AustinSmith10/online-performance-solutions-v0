"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import {
  uploadReferenceSample,
  removeReferenceSample,
  type ReferenceSampleState,
} from "@/app/actions/file-requirements";
import { UploadDropzone } from "@/components/UploadDropzone";
import { DocumentViewer } from "@/components/DocumentViewer";

interface Props {
  templateId: string;
  requirementId: string;
  /** Fresh signed URL for the currently-attached sample, if any (private bucket — must be re-signed per render). */
  currentSignedUrl: string | null;
  currentFilename: string | null;
}

/**
 * Admin-facing reference sample upload/preview/replace/remove control (#115).
 * Human reference plus optional AI-judge grounding — feeds neither automated
 * check on its own, the AI judge picks it up via file-requirement-verification.ts
 * when present.
 */
export function ReferenceSampleControl({
  templateId,
  requirementId,
  currentSignedUrl,
  currentFilename,
}: Props) {
  const [showPreview, setShowPreview] = useState(false);
  const [hasFile, setHasFile] = useState(false);
  const [isRemovePending, startRemoveTransition] = useTransition();
  const uploadAction = uploadReferenceSample.bind(null, templateId, requirementId);
  const [state, formAction, pending] = useActionState<ReferenceSampleState, FormData>(
    uploadAction,
    {}
  );

  useEffect(() => {
    if (state.success) {
      queueMicrotask(() => {
        setHasFile(false);
        setShowPreview(false);
      });
    }
  }, [state]);

  function handleRemove() {
    startRemoveTransition(async () => {
      await removeReferenceSample(templateId, requirementId);
      setShowPreview(false);
    });
  }

  return (
    <div className="space-y-2">
      <label className="mb-1 block text-xs text-zinc-500">
        Reference sample (optional) — a known-good example, used for human reference and as extra AI-judge grounding
      </label>

      {currentSignedUrl && currentFilename && (
        <div className="flex items-center justify-between rounded border border-zinc-200 bg-white px-2 py-1.5">
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="truncate text-left text-xs font-medium text-zinc-700 hover:underline"
          >
            {currentFilename}
          </button>
          <button
            type="button"
            onClick={handleRemove}
            disabled={isRemovePending}
            className="shrink-0 text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
          >
            {isRemovePending ? "Removing…" : "Remove"}
          </button>
        </div>
      )}

      {showPreview && currentSignedUrl && (
        <DocumentViewer src={currentSignedUrl} filename={currentFilename} className="max-h-96" />
      )}

      <form action={formAction} className="space-y-2">
        <UploadDropzone
          accept=".pdf,application/pdf"
          inputName="file"
          prompt={currentSignedUrl ? "Drop a PDF to replace it, or browse" : "Drop a PDF here or browse"}
          hint="PDF only"
          pending={pending}
          success={state.success}
          error={state.error}
          onFile={(f) => setHasFile(f !== null)}
        />
        {hasFile && (
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {pending ? "Uploading…" : currentSignedUrl ? "Replace sample" : "Upload sample"}
          </button>
        )}
      </form>
    </div>
  );
}
