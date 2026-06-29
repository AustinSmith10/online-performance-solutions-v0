"use client";

import { useActionState, useState } from "react";
import { resendPbdrEmail, type ResendPbdrEmailState } from "@/app/actions/conversion";

export function ResendPbdrButton({ projectId }: { projectId: string }) {
  const boundAction = resendPbdrEmail.bind(null, projectId);
  const [state, formAction, pending] = useActionState<ResendPbdrEmailState, FormData>(
    boundAction,
    {}
  );
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30">
          <div className="mx-4 w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-xl text-center">
            <p className="text-base font-semibold text-zinc-900">Resend delivery email?</p>
            <p className="mt-2 text-sm text-zinc-500">
              A fresh 30-day download link will be sent to the submitter and delivery recipient.
            </p>
            {state.error && <p className="mt-3 text-sm text-red-600">{state.error}</p>}
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
                  {pending ? "Sending…" : "Confirm"}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
      >
        Resend delivery email
      </button>
    </>
  );
}
