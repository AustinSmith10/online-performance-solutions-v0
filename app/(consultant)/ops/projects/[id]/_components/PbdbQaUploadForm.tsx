"use client";

import { useActionState, useRef, useState } from "react";
import { uploadQaPbdb, type UploadQaPbdbState } from "@/app/actions/projects";
import { UploadDropzone } from "@/components/UploadDropzone";

export function PbdbQaUploadForm({
  projectId,
  submitLabel = "Upload completed PBDB",
  requireConfirmation = false,
  confirmCopy,
}: {
  projectId: string;
  submitLabel?: string;
  requireConfirmation?: boolean;
  confirmCopy?: string;
}) {
  const boundAction = uploadQaPbdb.bind(null, projectId);
  const [state, formAction, pending] = useActionState<UploadQaPbdbState, FormData>(
    boundAction,
    {}
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [hasFile, setHasFile] = useState(false);
  const [confirming, setConfirming] = useState(false);

  function handleConfirm() {
    setConfirming(false);
    formRef.current?.requestSubmit();
  }

  return (
    <>
      <form ref={formRef} action={formAction} className="space-y-3">
        <UploadDropzone
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          prompt="Drop corrected .docx here or browse"
          hint=".docx only"
          pending={pending}
          success={state.success}
          error={state.error}
          required
          onFile={(f) => setHasFile(f !== null)}
        />
        {requireConfirmation && confirmCopy && (
          <p className="text-xs text-amber-700">{confirmCopy}</p>
        )}
        <div className="flex items-center gap-3">
          <button
            type={requireConfirmation ? "button" : "submit"}
            disabled={pending || !hasFile}
            onClick={requireConfirmation ? () => setConfirming(true) : undefined}
            className={`rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
              requireConfirmation
                ? "bg-amber-600 hover:bg-amber-700"
                : "bg-zinc-900 hover:bg-zinc-700"
            }`}
          >
            {pending ? "Uploading…" : submitLabel}
          </button>
        </div>
      </form>

      {confirming && !pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30">
          <div className="mx-4 w-full max-w-sm rounded-xl border border-amber-200 bg-white p-8 shadow-xl">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
              <svg className="h-6 w-6 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <p className="text-center text-base font-semibold text-zinc-900">Upload new version?</p>
            <p className="mt-2 text-center text-sm text-zinc-500">{confirmCopy}</p>
            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleConfirm}
                className="w-full rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
              >
                Yes, upload new version
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
