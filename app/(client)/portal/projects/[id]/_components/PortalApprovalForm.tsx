"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { submitPortalApproval, type PortalApprovalState } from "@/app/actions/portalApproval";
import { DownloadCard } from "@/components/DownloadCard";

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.25" />
      <path
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.568 3 7.291l3-3.291z"
      />
    </svg>
  );
}

interface Props {
  reviewId: string;
  projectId: string;
  pbdbDownloadUrl: string | null;
  pbdbFilename?: string | null;
  expiresAt: string;
  onSubmitted?: () => void;
  bare?: boolean;
}

export function PortalApprovalForm({ reviewId, projectId: _projectId, pbdbDownloadUrl, pbdbFilename, expiresAt, onSubmitted, bare }: Props) {
  const router = useRouter();
  const boundAction = submitPortalApproval.bind(null, reviewId);
  const [state, formAction, pending] = useActionState<PortalApprovalState, FormData>(
    boundAction,
    {}
  );
  const [response, setResponse] = useState<"approved" | "rejected">("approved");

  // On the project detail page (no modal), auto-refresh after showing success
  useEffect(() => {
    if (!state.submitted || onSubmitted) return;
    const t = setTimeout(() => router.refresh(), 2500);
    return () => clearTimeout(t);
  }, [state.submitted, onSubmitted, router]);

  const expiryLabel = new Date(expiresAt).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  if (state.submitted) {
    const approved = state.response === "approved";
    return (
      <div className={bare ? undefined : "rounded-lg border border-amber-200 bg-amber-50 p-5"}>
        <div className={`rounded-lg p-5 ${approved ? "border border-green-200 bg-green-50" : "border border-amber-200 bg-amber-50"}`}>
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${approved ? "bg-green-100" : "bg-amber-100"}`}>
              {approved ? (
                <svg className="h-4 w-4 text-green-600" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="h-4 w-4 text-amber-600" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                </svg>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-semibold ${approved ? "text-green-900" : "text-amber-900"}`}>
                {approved ? "Brief approved — thank you" : "Changes requested — we'll be in touch"}
              </p>
              <p className={`mt-1 text-sm ${approved ? "text-green-800" : "text-amber-800"}`}>
                {approved
                  ? "Your approval has been recorded. We'll finalise the report and deliver it to you shortly."
                  : "Your comments have been sent to our team. We'll review your feedback and resubmit the brief for your approval."}
              </p>
            </div>
          </div>

          {onSubmitted && (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={onSubmitted}
                className={`rounded-md px-4 py-2 text-sm font-medium text-white ${approved ? "bg-green-700 hover:bg-green-800" : "bg-amber-700 hover:bg-amber-800"}`}
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={bare ? undefined : "rounded-lg border border-amber-200 bg-amber-50 p-5"}>
      <h2 className="text-sm font-semibold text-amber-900">Your brief review is required</h2>
      <p className="mt-1 text-sm text-amber-800">
        A quick response helps keep your report on schedule. Please review and reply before{" "}
        <strong>{expiryLabel}</strong>.
      </p>

      {pbdbDownloadUrl && (
        <div className="mt-3">
          <DownloadCard
            href={pbdbDownloadUrl}
            filename={pbdbFilename}
            originalFilename={pbdbFilename}
            buttonLabel="Download brief"
            wrapperClassName="flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-white px-4 py-3"
          >
            <p className="text-sm font-medium text-zinc-900">Brief document</p>
          </DownloadCard>
        </div>
      )}

      <form action={formAction} className="mt-5 space-y-4">
        <fieldset>
          <legend className="text-sm font-medium text-zinc-900">Your response</legend>
          <div className="mt-2 space-y-2">
            <label className="flex cursor-pointer items-center gap-3 rounded-md border border-zinc-200 bg-white px-4 py-3 hover:bg-zinc-50 has-[:checked]:border-green-400 has-[:checked]:bg-green-50">
              <input
                type="radio"
                name="response"
                value="approved"
                checked={response === "approved"}
                onChange={() => setResponse("approved")}
                className="h-4 w-4 border-zinc-300 text-green-600 focus:ring-green-500"
                disabled={pending}
              />
              <div>
                <span className="text-sm font-medium text-zinc-900">Approve</span>
                <p className="text-xs text-zinc-500">I approve this brief as submitted.</p>
              </div>
            </label>

            <label className="flex cursor-pointer items-center gap-3 rounded-md border border-zinc-200 bg-white px-4 py-3 hover:bg-zinc-50 has-[:checked]:border-red-400 has-[:checked]:bg-red-50">
              <input
                type="radio"
                name="response"
                value="rejected"
                checked={response === "rejected"}
                onChange={() => setResponse("rejected")}
                className="h-4 w-4 border-zinc-300 text-red-600 focus:ring-red-500"
                disabled={pending}
              />
              <div>
                <span className="text-sm font-medium text-zinc-900">Request changes</span>
                <p className="text-xs text-zinc-500">I need changes before I can approve.</p>
              </div>
            </label>
          </div>
        </fieldset>

        <div>
          <label htmlFor="portal-comments" className="block text-sm font-medium text-zinc-700">
            {response === "rejected" ? "What needs to change" : "Comments"}{" "}
            <span className="font-normal text-zinc-400">
              {response === "rejected" ? "(required)" : "(optional)"}
            </span>
          </label>
          {response === "rejected" && (
            <p className="mt-0.5 text-xs text-zinc-500">
              Reference specific sections, page numbers, or clauses where possible — this helps our team resolve your concern quickly.
            </p>
          )}
          <textarea
            id="portal-comments"
            name="comments"
            rows={4}
            required={response === "rejected"}
            disabled={pending}
            placeholder={
              response === "rejected"
                ? "e.g. Page 4, Section J.0 — the thermal bridging U-value appears incorrect. Please revise before resubmitting."
                : "Any additional notes for the team…"
            }
            className="mt-1.5 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-60"
          />
        </div>

        {state.error && (
          <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
              response === "rejected"
                ? "bg-red-600 hover:bg-red-700"
                : "bg-green-700 hover:bg-green-800"
            }`}
          >
            {pending && <Spinner className="h-4 w-4" />}
            {pending
              ? "Submitting…"
              : response === "rejected"
              ? "Submit — request changes"
              : "Submit — approve brief"}
          </button>
        </div>
      </form>
    </div>
  );
}
