"use client";

import { useActionState, useState } from "react";
import {
  acceptAssignment,
  declineAssignment,
  type AcceptDeclineState,
} from "@/app/actions/projects";

// Inline Accept / Decline for an admin-pushed assignment still awaiting the
// consultant's response. Lives directly on the highlighted project card in the
// Workspace list (issue #95) — no separate "Needs your response" tray. Accept
// fires immediately; Decline asks to confirm, since it returns the job to the
// unassigned pool and notifies the admin team.
export function InlineAssignmentActions({
  projectId,
  label,
}: {
  projectId: string;
  label: string;
}) {
  const boundAccept = acceptAssignment.bind(null, projectId);
  const boundDecline = declineAssignment.bind(null, projectId);
  const [acceptState, acceptFormAction, acceptPending] = useActionState<AcceptDeclineState, FormData>(
    boundAccept,
    {}
  );
  const [declineState, declineFormAction, declinePending] = useActionState<AcceptDeclineState, FormData>(
    boundDecline,
    {}
  );
  const [confirmingDecline, setConfirmingDecline] = useState(false);
  const busy = acceptPending || declinePending;

  return (
    <>
      <form action={acceptFormAction}>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {acceptPending ? "Accepting…" : "Accept"}
        </button>
      </form>
      <button
        type="button"
        onClick={() => setConfirmingDecline(true)}
        disabled={busy}
        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      >
        Decline
      </button>
      {acceptState.error && <p className="w-full text-xs text-red-600">{acceptState.error}</p>}

      {confirmingDecline && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center backdrop-blur-sm bg-black/30">
          <div className="mx-4 w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-xl">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <svg className="h-6 w-6 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-base font-semibold text-zinc-900 text-center">Decline this assignment?</p>
            <p className="mt-1 text-sm font-medium text-zinc-600 text-center">{label}</p>
            <p className="mt-2 text-sm text-zinc-500 text-center">
              This project will return to the unassigned pool and the admin team will be notified.
            </p>
            {declineState.error && (
              <p className="mt-3 text-sm text-red-600 text-center">{declineState.error}</p>
            )}
            <div className="mt-6 flex flex-col gap-2">
              <form action={declineFormAction}>
                <button
                  type="submit"
                  disabled={declinePending}
                  className="w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {declinePending ? "Declining…" : "Yes, decline"}
                </button>
              </form>
              <button
                type="button"
                onClick={() => setConfirmingDecline(false)}
                disabled={declinePending}
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
