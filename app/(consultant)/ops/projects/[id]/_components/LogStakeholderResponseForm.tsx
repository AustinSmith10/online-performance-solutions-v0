"use client";

import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  logStakeholderResponseOnBehalf,
  extractStakeholderCommentsFromEmail,
  type LogResponseState,
  type ResponseMode,
} from "@/app/actions/stakeholders";
import { requestEvidenceUploadUrl } from "@/app/actions/evidence";
import { createClient } from "@/lib/supabase/client";
import { withResolvedType } from "@/lib/supabase/withResolvedType";
import { UploadDropzone } from "@/components/UploadDropzone";

const MODE_OPTIONS: { value: ResponseMode; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "teams", label: "Teams" },
  { value: "call", label: "Call" },
  { value: "sms", label: "SMS" },
];

const OTHER_RESPONDENT = "__other__";

const STATUS_LABELS: Record<string, string> = {
  approved_without_comments: "Approved",
  approved_with_comments: "Approved with comments",
  rejected_with_comments: "Rejected",
  waived: "Waived",
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

/** A response already recorded for this reviewer (#192) — logged on their behalf, or their own portal/link response. */
export interface ExistingResponse {
  status: string;
  comments: string | null;
  respondedAt: string | null;
  // null = the stakeholder responded themselves (portal or approval link).
  responseMode: ResponseMode | null;
  respondentName: string | null;
  loggedByEmail: string | null;
  evidenceFilename: string | null;
}

function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Props {
  reviewId: string;
  projectId: string;
  stakeholderName: string;
  stakeholderEmail: string;
  // The project's known stakeholder roster — populates the Respondent
  // dropdown (the person who told the consultant the response, which may
  // differ from the stakeholder this review row is for, e.g. an assistant
  // relaying on their behalf).
  roster: { name: string; email: string }[];
  // Set when the stakeholder already replied by email (#68) and the webhook
  // auto-attached that reply as evidence — lets the consultant reuse it
  // instead of being forced through a fresh upload. Evidence is optional
  // either way (#111).
  prefilledEvidence?: { storagePath: string; filename: string };
  prefilledComments?: string;
  // Set when this reviewer already responded (#192): the dialog opens
  // pre-filled with that response and requires an explicit "Replace existing
  // response" confirmation naming it before saving.
  existing?: ExistingResponse;
  // True when this is the last response the round is waiting on — saving it
  // closes the round, after which nothing in it can be corrected.
  closesRound?: boolean;
}

export function LogStakeholderResponseForm({
  reviewId,
  projectId,
  stakeholderName,
  stakeholderEmail,
  roster,
  prefilledEvidence,
  prefilledComments,
  existing,
  closesRound,
}: Props) {
  const [open, setOpen] = useState(false);
  const existingDecision: "approved" | "rejected" | "" = existing?.status.startsWith("approved")
    ? "approved"
    : existing?.status.startsWith("rejected")
      ? "rejected"
      : "";
  const [response, setResponse] = useState<"approved" | "rejected" | "">(existingDecision);
  const [comments, setComments] = useState(existing?.comments ?? prefilledComments ?? "");
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [confirmFinal, setConfirmFinal] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [useEmailEvidence, setUseEmailEvidence] = useState(!!prefilledEvidence);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [mode, setMode] = useState<ResponseMode | "">(existing?.responseMode ?? "");
  const initialRespondent = existing?.respondentName ?? stakeholderName;
  const [respondentChoice, setRespondentChoice] = useState<string>(
    roster.some((r) => r.name === initialRespondent) ? initialRespondent : OTHER_RESPONDENT
  );
  const [respondentOther, setRespondentOther] = useState(
    roster.some((r) => r.name === initialRespondent) ? "" : initialRespondent
  );
  const [respondedAt, setRespondedAt] = useState(() =>
    toDatetimeLocalValue(existing?.respondedAt ? new Date(existing.respondedAt) : new Date())
  );
  const replace = existing ? { previousStatus: existing.status } : null;

  const respondentFinal =
    respondentChoice === OTHER_RESPONDENT ? respondentOther.trim() : respondentChoice;

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
    if (!mode) return { error: "Select how the stakeholder responded." };
    if (!respondentFinal) return { error: "Select or enter who responded." };
    if (!respondedAt) return { error: "Enter when the stakeholder responded." };
    if (existing && !confirmReplace) {
      return { error: `Confirm you want to replace the existing "${statusLabel(existing.status)}" response.` };
    }
    if (closesRound && !confirmFinal) {
      return { error: "Confirm this final response — it closes the round and can't be changed afterward." };
    }

    const respondedAtIso = new Date(respondedAt).toISOString();

    if (useEmailEvidence && prefilledEvidence) {
      return logStakeholderResponseOnBehalf(
        reviewId,
        projectId,
        selectedResponse,
        enteredComments,
        prefilledEvidence,
        mode,
        respondentFinal,
        respondedAtIso,
        replace
      );
    }

    if (!selectedFile || selectedFile.size === 0) {
      // Evidence is optional (#111) — proceed with no attachment.
      return logStakeholderResponseOnBehalf(
        reviewId,
        projectId,
        selectedResponse,
        enteredComments,
        null,
        mode,
        respondentFinal,
        respondedAtIso,
        replace
      );
    }

    const requested = await requestEvidenceUploadUrl(projectId, selectedFile.name, selectedFile.size);
    if ("error" in requested) return { error: requested.error };

    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from("evidence")
      .uploadToSignedUrl(
        requested.path,
        requested.token,
        withResolvedType(selectedFile, requested.contentType)
      );
    if (uploadError) return { error: `Upload failed: ${uploadError.message}` };

    return logStakeholderResponseOnBehalf(
      reviewId,
      projectId,
      selectedResponse,
      enteredComments,
      { storagePath: requested.path, filename: selectedFile.name },
      mode,
      respondentFinal,
      respondedAtIso,
      replace
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
    !!response &&
    (response !== "rejected" || comments.trim().length > 0) &&
    !!mode &&
    !!respondentFinal &&
    !!respondedAt &&
    (!existing || confirmReplace) &&
    (!closesRound || confirmFinal);

  return (
    <>
      {open && typeof document !== "undefined" &&
        createPortal(
        // Portalled to <body> (#177): rendered inline, a transformed/stacking
        // ancestor on the project page traps this `fixed` overlay below the
        // Documents-tab content that renders later in the DOM. z above every
        // other layer, matching DocumentPreviewModal / PbdrPreviewButton.
        <div className="fixed inset-0 z-[100] flex items-center justify-center backdrop-blur-sm bg-black/30 p-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl">
            <p className="text-base font-semibold text-zinc-900">
              {existing ? `Replace response for ${stakeholderName}?` : `Log response for ${stakeholderName}?`}
            </p>
            <p className="mt-0.5 text-xs text-zinc-400">{stakeholderEmail}</p>
            {existing ? (
              <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-xs text-zinc-600">
                <p>
                  <span className="font-semibold text-zinc-800">Current response: {statusLabel(existing.status)}</span>
                  {existing.respondedAt && (
                    <>
                      {" "}
                      ·{" "}
                      {new Date(existing.respondedAt).toLocaleString("en-AU", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </>
                  )}
                </p>
                <p className="mt-0.5">
                  {existing.responseMode
                    ? `Logged${existing.loggedByEmail ? ` by ${existing.loggedByEmail}` : ""} via ${
                        MODE_OPTIONS.find((m) => m.value === existing.responseMode)?.label ?? existing.responseMode
                      }${existing.respondentName ? ` — respondent: ${existing.respondentName}` : ""}`
                    : existing.status === "waived"
                      ? "Waived by staff"
                      : "Submitted by the stakeholder themselves (portal or approval link)"}
                </p>
                {existing.comments && (
                  <p className="mt-1 whitespace-pre-wrap italic text-zinc-700">&ldquo;{existing.comments}&rdquo;</p>
                )}
                {existing.evidenceFilename && <p className="mt-1">Evidence: {existing.evidenceFilename}</p>}
              </div>
            ) : (
              <p className="mt-2 text-sm text-zinc-500">
                For stakeholders who replied by phone or email instead of using the portal.
                Attaching evidence is optional — you always confirm the response before submitting.
              </p>
            )}

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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor={`log-response-mode-${reviewId}`}
                    className="mb-1.5 block text-xs font-medium text-zinc-700"
                  >
                    Mode
                  </label>
                  <select
                    id={`log-response-mode-${reviewId}`}
                    required
                    value={mode}
                    onChange={(e) => setMode(e.target.value as ResponseMode)}
                    className="w-full rounded-md border border-zinc-200 px-2.5 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
                  >
                    <option value="" disabled>
                      Select…
                    </option>
                    {MODE_OPTIONS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor={`log-response-when-${reviewId}`}
                    className="mb-1.5 block text-xs font-medium text-zinc-700"
                  >
                    Date &amp; time
                  </label>
                  <input
                    id={`log-response-when-${reviewId}`}
                    type="datetime-local"
                    required
                    value={respondedAt}
                    onChange={(e) => setRespondedAt(e.target.value)}
                    className="w-full rounded-md border border-zinc-200 px-2.5 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor={`log-response-respondent-${reviewId}`}
                  className="mb-1.5 block text-xs font-medium text-zinc-700"
                >
                  Respondent
                </label>
                <select
                  id={`log-response-respondent-${reviewId}`}
                  value={respondentChoice}
                  onChange={(e) => setRespondentChoice(e.target.value)}
                  className="w-full rounded-md border border-zinc-200 px-2.5 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
                >
                  {roster.map((r) => (
                    <option key={r.email} value={r.name}>
                      {r.name}
                    </option>
                  ))}
                  <option value={OTHER_RESPONDENT}>Other…</option>
                </select>
                {respondentChoice === OTHER_RESPONDENT && (
                  <input
                    type="text"
                    required
                    placeholder="Who responded?"
                    value={respondentOther}
                    onChange={(e) => setRespondentOther(e.target.value)}
                    className="mt-1.5 w-full rounded-md border border-zinc-200 px-2.5 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none"
                  />
                )}
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
                  Evidence <span className="font-normal text-zinc-400">(optional)</span>
                </span>
                {prefilledEvidence && (
                  <label className="mb-2 flex items-center gap-1.5 text-xs text-zinc-700">
                    <input
                      type="checkbox"
                      checked={useEmailEvidence}
                      onChange={(e) => setUseEmailEvidence(e.target.checked)}
                    />
                    Use their email reply ({prefilledEvidence.filename}) as evidence
                  </label>
                )}
                {!useEmailEvidence && (
                  <UploadDropzone
                    accept="application/pdf,image/png,image/jpeg,image/tiff,message/rfc822,.eml,application/vnd.ms-outlook,.msg"
                    hint="PDF, JPEG, PNG, TIFF, or a forwarded email (.eml/.msg) — 50 MB max"
                    pending={pending}
                    success={state.success}
                    error={state.error}
                    required={false}
                    onFile={setFile}
                  />
                )}
              </div>

              {existing && (
                <label className="flex cursor-pointer items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <input
                    type="checkbox"
                    checked={confirmReplace}
                    onChange={(e) => setConfirmReplace(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-semibold">Replace existing response</span> — this overwrites the
                    recorded &ldquo;{statusLabel(existing.status)}&rdquo;. The original stays in the audit log.
                  </span>
                </label>
              )}

              {closesRound && (
                <label className="flex cursor-pointer items-start gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900">
                  <input
                    type="checkbox"
                    checked={confirmFinal}
                    onChange={(e) => setConfirmFinal(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-semibold">This is the final response for this round.</span> Saving it
                    closes the round — none of its responses can be changed afterward.
                  </span>
                </label>
              )}

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
                  {pending ? "Submitting…" : existing ? "Replace response" : "Log response"}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
      >
        {existing ? "Replace response" : "Log response"}
      </button>
    </>
  );
}
