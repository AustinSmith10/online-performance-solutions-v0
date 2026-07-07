"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { replaceProjectFile, type ReplaceFileState } from "@/app/actions/projects";
import { UploadDropzone } from "@/components/UploadDropzone";
import { useUnsavedChanges } from "@/components/UnsavedChangesProvider";

interface Props {
  projectId: string;
  fileId: string;
}

export function ReplaceDocumentControl({ projectId, fileId }: Props) {
  const router = useRouter();
  const boundAction = replaceProjectFile.bind(null, projectId, fileId);
  const [state, formAction, pending] = useActionState<ReplaceFileState, FormData>(
    boundAction,
    {}
  );
  const [open, setOpen] = useState(false);
  const [hasFile, setHasFile] = useState(false);
  useUnsavedChanges(`replace-document-${fileId}`, hasFile);

  useEffect(() => {
    if (state.success) {
      queueMicrotask(() => setOpen(false));
      router.refresh();
    }
  }, [state.success, router]);

  if (!open) {
    return (
      <div className="px-5 pb-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs font-medium text-zinc-500 underline hover:text-zinc-800"
        >
          Replace this document
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-2 px-5 pb-4">
      <UploadDropzone
        accept="application/pdf,.docx,.doc,.xlsx,.xls,.png,.jpg,.jpeg"
        hint="PDF, Word, Excel, or image — 50 MB max"
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
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {pending ? "Uploading…" : "Replace document"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="text-xs text-zinc-500 hover:text-zinc-700 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
