"use client";

import { useActionState, useState } from "react";
import { uploadProjectFile, type UploadFileState } from "@/app/actions/projects";
import { UploadDropzone } from "@/components/UploadDropzone";

export function FileUploadForm({ projectId }: { projectId: string }) {
  const boundAction = uploadProjectFile.bind(null, projectId);
  const [state, formAction, pending] = useActionState<UploadFileState, FormData>(
    boundAction,
    {}
  );
  const [hasFile, setHasFile] = useState(false);
  const [sizeError, setSizeError] = useState<string | null>(null);

  function handleFile(file: File | null) {
    if (file && file.size > 50 * 1024 * 1024) {
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      setSizeError(`"${file.name}" exceeds the 50 MB limit (${mb} MB).`);
      setHasFile(false);
      return;
    }
    setSizeError(null);
    setHasFile(file !== null);
  }

  return (
    <form action={formAction} className="space-y-3">
      <UploadDropzone
        accept="application/pdf,.docx,.doc,.xlsx,.xls,.png,.jpg,.jpeg"
        hint="PDF, Word, Excel, or image — 50 MB max"
        pending={pending}
        success={state.success}
        error={state.error}
        required
        onFile={handleFile}
      />
      {sizeError && <p className="text-xs text-red-600">{sizeError}</p>}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !hasFile || !!sizeError}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {pending ? "Uploading…" : "Upload document"}
        </button>
      </div>
    </form>
  );
}
