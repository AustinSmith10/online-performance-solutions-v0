"use client";

import { useActionState, useState } from "react";
import { dispatchToStakeholders, type DispatchState } from "@/app/actions/stakeholders";

export function DispatchButton({ projectId }: { projectId: string }) {
  const boundAction = dispatchToStakeholders.bind(null, projectId);
  const [state, formAction, pending] = useActionState<DispatchState, FormData>(
    boundAction,
    {}
  );
  const [confirming, setConfirming] = useState(false);

  if (state.success) {
    return (
      <p className="text-sm text-green-700 font-medium">
        {state.scheduledFor
          ? `Dispatch scheduled for ${new Date(state.scheduledFor).toLocaleString("en-AU")}.`
          : state.stakeholderNames && state.stakeholderNames.length > 0
            ? `PBDB dispatched to ${state.stakeholderNames.join(", ")}.`
            : "Dispatched to stakeholders."}
      </p>
    );
  }

  return (
    <>
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30">
          <div className="mx-4 w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-xl text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
              <svg className="h-6 w-6 text-amber-600" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-base font-semibold text-zinc-900">Dispatch to stakeholders?</p>
            <p className="mt-2 text-sm text-zinc-500">
              Emails the QA&apos;d PBDB out for stakeholder review, applying the delivery timing
              selected above (immediately, or staged for later).
            </p>
            {state.error && (
              <p className="mt-3 text-sm text-red-600">{state.error}</p>
            )}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="flex-1 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <form action={formAction} className="flex-1">
                <button
                  type="submit"
                  disabled={pending}
                  className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
                >
                  {pending ? "Dispatching…" : "Confirm"}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          Dispatch to stakeholders
        </button>
        {state.error && !confirming && (
          <p className="mt-2 text-sm text-red-600">{state.error}</p>
        )}
      </div>
    </>
  );
}
