"use client";

import { useActionState, useState } from "react";
import {
  attachEvidence,
  requestEvidenceUploadUrl,
  type AttachEvidenceState,
} from "@/app/actions/evidence";
import { createClient } from "@/lib/supabase/client";
import { UploadDropzone } from "@/components/UploadDropzone";

export function AttachEvidenceForm({ projectId }: { projectId: string }) {
  // Orchestrates the signed-upload-URL flow (#86): request a signed URL,
  // upload the file straight from the browser to Supabase Storage, then
  // record the metadata — no file body passes through a server action.
  async function orchestrate(
    _prev: AttachEvidenceState,
    formData: FormData
  ): Promise<AttachEvidenceState> {
    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) return { error: "Please select a file." };

    const reference = (formData.get("reference") as string | null)?.trim() || null;

    const requested = await requestEvidenceUploadUrl(projectId, file.name, file.size);
    if ("error" in requested) return { error: requested.error };

    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from("evidence")
      .uploadToSignedUrl(requested.path, requested.token, file, {
        contentType: requested.contentType,
      });
    if (uploadError) return { error: `Upload failed: ${uploadError.message}` };

    return attachEvidence(projectId, requested.path, file.name, reference);
  }

  const [state, formAction, pending] = useActionState<AttachEvidenceState, FormData>(
    orchestrate,
    {}
  );
  const [hasFile, setHasFile] = useState(false);

  return (
    <form action={formAction} className="space-y-3">
      <UploadDropzone
        accept="application/pdf,image/png,image/jpeg,image/tiff,message/rfc822,.eml,application/vnd.ms-outlook,.msg"
        hint="PDF, JPEG, PNG, TIFF, or a forwarded email (.eml/.msg) — 50 MB max"
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
