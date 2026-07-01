"use client";

import { useActionState } from "react";
import { uploadProjectFile, type UploadFileState } from "@/app/actions/projects";
import { UploadDropzone } from "@/components/UploadDropzone";
import { useState } from "react";

export function FileUploadForm({ projectId }: { projectId: string }) {
  const boundAction = uploadProjectFile.bind(null, projectId);
  const [state, formAction, pending] = useActionState<UploadFileState, FormData>(
    boundAction,
    {}
  );
  const [hasFile, setHasFile] = useState(false);

  return (
    <form action={formAction} className="space-y-3">
      <UploadDropzone
        accept="application/pdf,.docx,.doc,.xlsx,.xls,.png,.jpg,.jpeg"
        hint="PDF, Word, Excel, or image"
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
          {pending ? "Uploading…" : "Upload document"}
        </button>
      </div>
    </form>
  );
}
