"use client";

import { useActionState } from "react";
import { reuploadTemplate, type ReuploadTemplateState } from "@/app/actions/templates";

export function ReuploadForm({ templateId }: { templateId: string }) {
  const action = reuploadTemplate.bind(null, templateId);
  const [state, formAction, pending] = useActionState<ReuploadTemplateState, FormData>(
    action,
    {}
  );

  return (
    <form action={formAction} className="flex items-center gap-3">
      <input
        name="file"
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        required
        className="block text-sm text-zinc-600 file:mr-3 file:rounded file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-zinc-200"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        {pending ? "Uploading…" : "Replace file"}
      </button>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
