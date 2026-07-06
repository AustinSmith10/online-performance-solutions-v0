"use client";

import { useActionState, useState } from "react";
import { attachEvidence, type AttachEvidenceState } from "@/app/actions/evidence";
import { UploadDropzone } from "@/components/UploadDropzone";

export function AttachEvidenceForm({ projectId }: { projectId: string }) {
  const boundAction = attachEvidence.bind(null, projectId);
  const [state, formAction, pending] = useActionState<AttachEvidenceState, FormData>(
    boundAction,
    {}
  );
  const [hasFile, setHasFile] = useState(false);

  return (
    <form action={formAction} className="space-y-3">
      <UploadDropzone
        accept="application/pdf,image/png,image/jpeg,image/tiff"
        hint="PDF, JPEG, PNG, or TIFF — 50 MB max"
        pending={pending}
        success={state.success}
        error={state.error}
        required
        onFile={(f) => setHasFile(f !== null)}
      />
      <div>
        <label htmlFor={`evidence-reference-${projectId}`} className="block text-xs font-medium text-zinc-500">
          Reference <span className="font-normal text-zinc-400">(optional — e.g. a field or decision this evidences)</span>
        </label>
        <input
          id={`evidence-reference-${projectId}`}
          type="text"
          name="reference"
          placeholder="e.g. EXTRACT_ADDRESS"
          className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-1.5 text-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none"
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !hasFile}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {pending ? "Attaching…" : "Attach evidence"}
        </button>
      </div>
    </form>
  );
}
