"use client";

import { useActionState, useState } from "react";
import { reuploadTemplate, type ReuploadTemplateState } from "@/app/actions/templates";
import { useUnsavedChanges } from "@/components/UnsavedChangesProvider";
import { UploadDropzone } from "@/components/UploadDropzone";

export function ReuploadForm({ templateId }: { templateId: string }) {
  const action = reuploadTemplate.bind(null, templateId);
  const [state, formAction, pending] = useActionState<ReuploadTemplateState, FormData>(
    action,
    {}
  );
  const [hasFile, setHasFile] = useState(false);
  useUnsavedChanges("reupload", hasFile);

  return (
    <form action={formAction} className="space-y-3">
      <UploadDropzone
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        prompt="Drop a .docx file here or browse"
        hint="Word document (.docx) only"
        pending={pending}
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
          {pending ? "Uploading…" : "Replace file"}
        </button>
      </div>
    </form>
  );
}
