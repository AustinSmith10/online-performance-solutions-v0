"use client";

import { useActionState, useState } from "react";
import {
  overridePaymentGateAction,
  reconcileOverrideAction,
  type OverrideState,
  type ReconcileState,
} from "@/app/actions/credits";

interface Props {
  projectId: string;
  alreadyOverridden: boolean;
  /** True once payment has been resolved by any means (normal deduction or a prior override) — nothing left to override. */
  paymentResolved?: boolean;
}

function ReconcileButton({ projectId }: { projectId: string }) {
  const boundAction = reconcileOverrideAction.bind(null, projectId);
  const [state, action, pending] = useActionState<ReconcileState, FormData>(boundAction, {});
  const [open, setOpen] = useState(false);

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30">
          <div className="mx-4 w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-xl text-center">
            <p className="text-base font-semibold text-zinc-900">Mark override as reconciled?</p>
            <p className="mt-2 text-sm text-zinc-500">
              This confirms payment has been collected and clears the override flag.
            </p>
            {state.error && <p className="mt-3 text-sm text-red-600">{state.error}</p>}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <form action={action} className="flex-1">
                <button
                  type="submit"
                  disabled={pending}
                  className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
                >
                  {pending ? "Clearing…" : "Confirm"}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm text-zinc-500">
          Override is active. Once payment is collected, mark this project as reconciled to clear the flag.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Mark as reconciled
        </button>
      </div>
    </>
  );
}

export function OverrideForm({ projectId, alreadyOverridden, paymentResolved }: Props) {
  const boundAction = overridePaymentGateAction.bind(null, projectId);
  const [state, action, pending] = useActionState<OverrideState, FormData>(boundAction, {});
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (alreadyOverridden) {
    return <ReconcileButton projectId={projectId} />;
  }

  if (paymentResolved) {
    return (
      <button
        type="button"
        disabled
        title="Payment has already been resolved — there is no payment gate to override."
        className="cursor-not-allowed rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs font-medium text-zinc-400"
      >
        Apply payment override
      </button>
    );
  }

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30">
          <div className="mx-4 w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-xl">
            <p className="text-base font-semibold text-zinc-900">Apply payment override?</p>
            <p className="mt-1 text-sm text-zinc-500">
              This bypasses the credit gate and flags the project as Override — Payment Pending.
              The reason will be logged to the audit trail.
            </p>
            <form action={action} className="mt-4 space-y-4">
              <div>
                <label htmlFor="override-reason" className="mb-1.5 block text-xs font-medium text-zinc-700">
                  Written reason (required)
                </label>
                <textarea
                  id="override-reason"
                  name="reason"
                  rows={3}
                  required
                  minLength={10}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Explain why the payment gate is being bypassed…"
                  className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none"
                />
              </div>
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
                  disabled={pending || reason.length < 10}
                  className="flex-1 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {pending ? "Applying…" : "Apply override"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-50"
      >
        Apply payment override
      </button>
    </>
  );
}
