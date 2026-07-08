"use client";

import { useActionState, useState } from "react";
import {
  acceptAssignment,
  declineAssignment,
  type AcceptDeclineState,
} from "@/app/actions/projects";

export function PendingAssignmentModal({
  projectId,
  label,
  clientName,
  submittedLabel,
  expectedDeliveryLabel,
  onCancel,
}: {
  projectId: string;
  label: string;
  clientName: string;
  submittedLabel: string;
  expectedDeliveryLabel: string;
  onCancel: () => void;
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30">
      <div className="mx-4 w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-zinc-900">New assignment</h2>
          <button
            type="button"
            onClick={onCancel}
            disabled={acceptPending || declinePending}
            className="shrink-0 text-zinc-400 hover:text-zinc-600 disabled:opacity-50"
            aria-label="Close"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
        <p className="mt-1 text-sm text-zinc-500">
          You&rsquo;ve been assigned this project. Accept to add it to your workspace, or decline to
          return it to the unassigned pool.
        </p>

        <div className="mt-5 divide-y divide-zinc-100 rounded-lg border border-zinc-100">
          <ModalRow label="Project" value={label} />
          <ModalRow label="Client" value={clientName} />
          <ModalRow label="Submitted" value={submittedLabel} />
          <ModalRow label="Expected delivery" value={expectedDeliveryLabel} />
        </div>

        {acceptState.error && (
          <p className="mt-3 text-sm text-red-600">{acceptState.error}</p>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          <form action={acceptFormAction} className="flex-1">
            <button
              type="submit"
              disabled={acceptPending || declinePending}
              className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {acceptPending ? "Accepting…" : "Accept"}
            </button>
          </form>
          <button
            type="button"
            onClick={() => setConfirmingDecline(true)}
            disabled={acceptPending || declinePending}
            className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            Decline
          </button>
        </div>
      </div>

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
    </div>
  );
}

function ModalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-4 px-4 py-2.5">
      <span className="w-32 shrink-0 text-sm text-zinc-500">{label}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-zinc-900">{value}</span>
    </div>
  );
}
