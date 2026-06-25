"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { submitPortalApproval, type PortalApprovalState } from "@/app/actions/portalApproval";

function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block rounded-full border-2 border-current border-t-transparent animate-spin ${className}`}
      aria-hidden
    />
  );
}

interface Props {
  reviewId: string;
  projectId: string;
  pbdbDownloadUrl: string | null;
  expiresAt: string;
}

export function PortalApprovalForm({ reviewId, projectId: _projectId, pbdbDownloadUrl, expiresAt }: Props) {
  const router = useRouter();
  const boundAction = submitPortalApproval.bind(null, reviewId);
  const [state, formAction, pending] = useActionState<PortalApprovalState, FormData>(
    boundAction,
    {}
  );
  const [response, setResponse] = useState<"approved" | "rejected">("approved");

  useEffect(() => {
    if (state.submitted) {
      router.refresh();
    }
  }, [state.submitted, router]);

  const expiryLabel = new Date(expiresAt).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
      <h2 className="text-sm font-semibold text-amber-900">Your PBDB review is required</h2>
      <p className="mt-1 text-sm text-amber-800">
        Please review the document below and submit your response before{" "}
        <strong>{expiryLabel}</strong>.
      </p>

      {pbdbDownloadUrl && (
        <a
          href={pbdbDownloadUrl}
          className="mt-3 inline-flex items-center gap-2 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-50"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download PBDB document
        </a>
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
                <p className="text-xs text-zinc-500">I approve this PBDB as submitted.</p>
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
              : "Submit — approve PBDB"}
          </button>
        </div>
      </form>
    </div>
  );
}
