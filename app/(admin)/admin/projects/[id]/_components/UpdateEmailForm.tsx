"use client";

import { useActionState, useState } from "react";
import { updateStakeholderEmail, type UpdateEmailState } from "@/app/actions/stakeholders";

interface Props {
  reviewId: string;
  projectId: string;
  currentEmail: string;
}

export function UpdateEmailForm({ reviewId, projectId, currentEmail }: Props) {
  const boundAction = updateStakeholderEmail.bind(null, reviewId, projectId);
  const [state, formAction, pending] = useActionState<UpdateEmailState, FormData>(
    boundAction,
    {}
  );
  const [open, setOpen] = useState(false);
  const [newEmail, setNewEmail] = useState(currentEmail);

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30">
          <div className="mx-4 w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-xl">
            <p className="text-base font-semibold text-zinc-900">Update stakeholder email?</p>
            <p className="mt-1 text-sm text-zinc-500">
              The approval link will be resent to the new address.
            </p>
            <div className="mt-4 space-y-2 rounded-md border border-zinc-100 bg-zinc-50 px-4 py-3 text-sm">
              <div className="flex items-baseline gap-2">
                <span className="w-12 shrink-0 text-xs text-zinc-400">From</span>
                <span className="font-mono text-xs text-zinc-600 break-all">{currentEmail}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="w-12 shrink-0 text-xs text-zinc-400">To</span>
                <span className="font-mono text-xs font-medium text-zinc-900 break-all">{newEmail}</span>
              </div>
            </div>
            <form
              action={formAction}
              className="mt-4 space-y-4"
              onSubmit={() => setOpen(false)}
            >
              <input type="hidden" name="email" value={newEmail} />
              {state.error && <p className="text-sm text-red-600">{state.error}</p>}
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
                  disabled={pending || newEmail === currentEmail || !newEmail}
                  className="flex-1 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
                >
                  {pending ? "Saving…" : "Confirm & resend"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <form className="mt-2 flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); setOpen(true); }}>
        <input
          type="email"
          required
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs focus:border-zinc-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={newEmail === currentEmail || !newEmail}
          className="shrink-0 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          Update email & resend
        </button>
      </form>
    </>
  );
}
