"use client";

import { useActionState, useState } from "react";
import { waiveStakeholderResponse, type WaiveState } from "@/app/actions/stakeholders";
import { requestEvidenceUploadUrl } from "@/app/actions/evidence";
import { createClient } from "@/lib/supabase/client";
import { UploadDropzone } from "@/components/UploadDropzone";

interface Props {
  reviewId: string;
  projectId: string;
  stakeholderName: string;
  // Consultants can waive too, but must justify it with evidence (e.g. proof
  // the stakeholder is unreachable) — admin's waive stays reason-only.
  requireEvidence?: boolean;
}

export function WaiveForm({ reviewId, projectId, stakeholderName, requireEvidence }: Props) {
  const [file, setFile] = useState<File | null>(null);

  async function orchestrate(prevState: WaiveState, formData: FormData): Promise<WaiveState> {
    if (requireEvidence) {
      if (!file || file.size === 0) {
        return { error: "Attach evidence — waiving as a consultant requires it." };
      }
      const requested = await requestEvidenceUploadUrl(projectId, file.name, file.size);
      if ("error" in requested) return { error: requested.error };

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from("evidence")
        .uploadToSignedUrl(requested.path, requested.token, file, {
          contentType: requested.contentType,
        });
      if (uploadError) return { error: `Upload failed: ${uploadError.message}` };

      formData.append("storagePath", requested.path);
      formData.append("filename", file.name);
    }
    return waiveStakeholderResponse(reviewId, projectId, prevState, formData);
  }

  const [state, formAction, pending] = useActionState<WaiveState, FormData>(orchestrate, {});
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30">
          <div className="mx-4 w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-xl">
            <p className="text-base font-semibold text-zinc-900">
              Waive response for {stakeholderName}?
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              This will mark the review as waived and cannot be undone. Provide a written reason.
            </p>
            <form action={formAction} className="mt-4 space-y-4">
              <div>
                <label htmlFor="waive-reason" className="mb-1.5 block text-xs font-medium text-zinc-700">
                  Reason for waiving
                </label>
                <input
                  id="waive-reason"
                  name="reason"
                  type="text"
                  required
                  minLength={10}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Stakeholder unreachable after 3 attempts"
                  className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none"
                />
              </div>
              {requireEvidence && (
                <div>
                  <span className="mb-1.5 block text-xs font-medium text-zinc-700">
                    Evidence <span className="font-normal text-zinc-400">(required)</span>
                  </span>
                  <UploadDropzone
                    accept="application/pdf,image/png,image/jpeg,image/tiff,message/rfc822,.eml,application/vnd.ms-outlook,.msg"
                    hint="PDF, JPEG, PNG, TIFF, or a forwarded email (.eml/.msg) — 50 MB max"
                    pending={pending}
                    success={state.error ? false : undefined}
                    error={state.error}
                    required
                    onFile={setFile}
                  />
                </div>
              )}
              {!requireEvidence && state.error && <p className="text-sm text-red-600">{state.error}</p>}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending || reason.length < 10 || (requireEvidence && !file)}
                  className="flex-1 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
                >
                  {pending ? "Waiving…" : "Waive response"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
      >
        Waive response
      </button>
    </>
  );
}
