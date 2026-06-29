"use client";

import { useActionState, useState } from "react";
import { selfAssignProject, type SelfAssignState } from "@/app/actions/projects";

export function SelfAssignButton({ projectId, address }: { projectId: string; address: string }) {
  const boundAction = selfAssignProject.bind(null, projectId);
  const [state, formAction, pending] = useActionState<SelfAssignState, FormData>(
    boundAction,
    {}
  );
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
      >
        Pick up →
      </button>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30">
          <div className="mx-4 w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-xl">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
              <svg className="h-6 w-6 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-base font-semibold text-zinc-900 text-center">Pick up this job?</p>
            {address && (
              <p className="mt-1 text-sm font-medium text-zinc-600 text-center">{address}</p>
            )}
            <p className="mt-2 text-sm text-zinc-500 text-center">
              This project will be assigned to you and removed from the available jobs list.
            </p>
            {state.error && (
              <p className="mt-3 text-sm text-red-600 text-center">{state.error}</p>
            )}
            <div className="mt-6 flex flex-col gap-2">
              <form action={formAction}>
                <button
                  type="submit"
                  disabled={pending}
                  className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
                >
                  {pending ? "Picking up…" : "Yes, pick up job"}
                </button>
              </form>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={pending}
                className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
