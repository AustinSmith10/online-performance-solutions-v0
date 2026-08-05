"use client";

import { useActionState, useState } from "react";
import { revertPbdrToPbdb, type RevertState } from "@/app/actions/conversion";

export function RevertButton({ projectId }: { projectId: string }) {
  const boundAction = revertPbdrToPbdb.bind(null, projectId);
  const [state, formAction, pending] = useActionState<RevertState, FormData>(
    boundAction,
    {}
  );
  const [confirming, setConfirming] = useState(false);

  if (state.success) {
    return (
      <p className="text-sm text-red-700 font-medium">
        Reverted to PBDB — upload a corrected version to resume the QA cycle.
      </p>
    );
  }

  return (
    <>
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30">
          <div className="mx-4 w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-xl">
            <p className="text-base font-semibold text-zinc-900 text-center">Revert to PBDB?</p>
            <p className="mt-2 text-sm text-zinc-500 text-center">
              Sends this project back to the PBDB QA cycle so the consultant can correct and
              re-upload it. The stakeholders will need to review and approve again before it can
              be re-converted to PBDR.
            </p>
            <form action={formAction} className="mt-4">
              <label htmlFor="revert-reason" className="block text-xs font-medium text-zinc-700">
                Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                id="revert-reason"
                name="reason"
                rows={3}
                required
                placeholder="e.g. Stakeholder flagged an incorrect setback dimension after approval."
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
              />
              {state.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="flex-1 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {pending ? "Reverting…" : "Confirm revert"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
      >
        Revert to PBDB
      </button>
    </>
  );
}
