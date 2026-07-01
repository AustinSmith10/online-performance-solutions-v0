"use client";

import { useActionState, useState } from "react";
import { uploadQaPbdb, type UploadQaPbdbState } from "@/app/actions/projects";
import { UploadDropzone } from "@/components/UploadDropzone";

export function PbdbQaUploadForm({
  projectId,
  submitLabel = "Upload completed PBDB",
}: {
  projectId: string;
  submitLabel?: string;
}) {
  const boundAction = uploadQaPbdb.bind(null, projectId);
  const [state, formAction, pending] = useActionState<UploadQaPbdbState, FormData>(
    boundAction,
    {}
  );
  const [hasFile, setHasFile] = useState(false);

  return (
    <form action={formAction} className="space-y-3">
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
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !hasFile}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {pending ? "Uploading…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
