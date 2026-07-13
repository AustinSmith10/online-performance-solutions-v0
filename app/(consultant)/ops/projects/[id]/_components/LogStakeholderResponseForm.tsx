"use client";

import { useActionState, useEffect, useState } from "react";
import {
  logStakeholderResponseOnBehalf,
  extractStakeholderCommentsFromEmail,
  type LogResponseState,
} from "@/app/actions/stakeholders";
import { requestEvidenceUploadUrl } from "@/app/actions/evidence";
import { createClient } from "@/lib/supabase/client";
import { UploadDropzone } from "@/components/UploadDropzone";

interface Props {
  reviewId: string;
  projectId: string;
  stakeholderName: string;
  stakeholderEmail: string;
}

export function LogStakeholderResponseForm({
  reviewId,
  projectId,
  stakeholderName,
  stakeholderEmail,
}: Props) {
  const [open, setOpen] = useState(false);
  const [response, setResponse] = useState<"approved" | "rejected" | "">("");
  const [comments, setComments] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  async function orchestrate(
    _prev: LogResponseState,
    formData: FormData
  ): Promise<LogResponseState> {
    const selectedResponse = formData.get("response") as string | null;
    const enteredComments = (formData.get("comments") as string | null)?.trim() || null;
    const selectedFile = formData.get("file") as File | null;

    if (selectedResponse !== "approved" && selectedResponse !== "rejected") {
      return { error: "Select approve or reject." };
    }
    if (selectedResponse === "rejected" && !enteredComments) {
      return { error: "Comments are required for a rejection." };
    }
    if (!selectedFile || selectedFile.size === 0) {
      return { error: "Attach evidence — the form can't be submitted without it." };
    }

    const requested = await requestEvidenceUploadUrl(projectId, selectedFile.name, selectedFile.size);
    if ("error" in requested) return { error: requested.error };

    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from("evidence")
      .uploadToSignedUrl(requested.path, requested.token, selectedFile, {
        contentType: requested.contentType,
      });
    if (uploadError) return { error: `Upload failed: ${uploadError.message}` };

    return logStakeholderResponseOnBehalf(
      reviewId,
      projectId,
      selectedResponse,
      enteredComments,
      requested.path,
      selectedFile.name
    );
  }

  const [state, formAction, pending] = useActionState<LogResponseState, FormData>(orchestrate, {});

  useEffect(() => {
    if (state.success) {
      const timer = setTimeout(() => setOpen(false), 600);
      return () => clearTimeout(timer);
    }
  }, [state.success]);

  const canExtract = !!file && file.name.toLowerCase().endsWith(".eml");

  async function handleExtract() {
    if (!file) return;
    setExtracting(true);
    setExtractError(null);
    try {
      const text = await file.text();
      const result = await extractStakeholderCommentsFromEmail(text);
      if ("error" in result) {
        setExtractError(result.error);
      } else {
        setComments(result.text);
      }
    } catch {
      setExtractError("Could not read this file.");
    } finally {
      setExtracting(false);
    }
  }

  const canSubmit =
    !!response && (response !== "rejected" || comments.trim().length > 0) && !!file;

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30 p-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl">
            <p className="text-base font-semibold text-zinc-900">
              Log response for {stakeholderName}?
            </p>
            <p className="mt-0.5 text-xs text-zinc-400">{stakeholderEmail}</p>
            <p className="mt-2 text-sm text-zinc-500">
              For stakeholders who replied by phone or email instead of using the portal.
              Evidence is required, and you always confirm the response before submitting.
            </p>

            <form action={formAction} className="mt-4 space-y-4">
              <div>
                <span className="mb-1.5 block text-xs font-medium text-zinc-700">Response</span>
                <div className="flex gap-4">
                  <label className="flex items-center gap-1.5 text-sm text-zinc-900">
                    <input
                      type="radio"
                      name="response"
                      value="approved"
                      required
                      checked={response === "approved"}
                      onChange={() => setResponse("approved")}
                    />
                    Approve
                  </label>
                  <label className="flex items-center gap-1.5 text-sm text-zinc-900">
                    <input
                      type="radio"
                      name="response"
                      value="rejected"
                      required
                      checked={response === "rejected"}
                      onChange={() => setResponse("rejected")}
                    />
                    Reject
                  </label>
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor={`log-response-comments-${reviewId}`} className="block text-xs font-medium text-zinc-700">
                    Comments{" "}
                    <span className="font-normal text-zinc-400">
                      {response === "rejected" ? "(required — what needs to change)" : "(optional)"}
                    </span>
                  </label>
                  {canExtract && (
                    <button
                      type="button"
                      onClick={handleExtract}
                      disabled={extracting}
                      className="text-xs font-medium text-blue-600 hover:underline disabled:opacity-50"
                    >
                      {extracting ? "Extracting…" : "Extract from email"}
                    </button>
                  )}
                </div>
                <textarea
                  id={`log-response-comments-${reviewId}`}
                  name="comments"
                  rows={4}
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder="What did the stakeholder say?"
                  className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none"
                />
                {extractError && <p className="mt-1 text-xs text-red-600">{extractError}</p>}
              </div>

              <div>
                <span className="mb-1.5 block text-xs font-medium text-zinc-700">
                  Evidence <span className="font-normal text-zinc-400">(required)</span>
                </span>
                <UploadDropzone
                  accept="application/pdf,image/png,image/jpeg,image/tiff,message/rfc822,.eml,application/vnd.ms-outlook,.msg"
                  hint="PDF, JPEG, PNG, TIFF, or a forwarded email (.eml/.msg) — 50 MB max"
                  pending={pending}
                  success={state.success}
                  error={state.error}
                  required
                  onFile={setFile}
                />
              </div>

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
                  disabled={pending || !canSubmit}
                  className="flex-1 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
                >
                  {pending ? "Submitting…" : "Log response"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
      >
        Log response
      </button>
    </>
  );
}
