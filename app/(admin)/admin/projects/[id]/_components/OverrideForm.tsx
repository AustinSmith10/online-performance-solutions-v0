"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  overridePaymentGateAction,
  reconcileOverrideAction,
  type OverrideState,
  type ReconcileState,
} from "@/app/actions/credits";

interface Props {
  projectId: string;
  alreadyOverridden: boolean;
}

function ReconcileButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const boundAction = reconcileOverrideAction.bind(null, projectId);
  const [state, action, pending] = useActionState<ReconcileState, FormData>(boundAction, {});

  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);

  return (
    <div className="space-y-2">
      <p className="text-sm text-zinc-500">
        Override is active. Once payment is collected, mark this project as reconciled to clear the flag.
      </p>
      {state.error && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>
      )}
      <form action={action}>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {pending ? "Clearing…" : "Mark as reconciled"}
        </button>
      </form>
    </div>
  );
}

export function OverrideForm({ projectId, alreadyOverridden }: Props) {
  const router = useRouter();
  const boundAction = overridePaymentGateAction.bind(null, projectId);
  const [state, action, pending] = useActionState<OverrideState, FormData>(boundAction, {});

  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);

  if (alreadyOverridden) {
    return <ReconcileButton projectId={projectId} />;
  }

  return (
    <div className="space-y-3">
      {state.error && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>
      )}
      {state.success && (
        <p className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-700">
          Override applied. Project flagged as Override — Payment Pending.
        </p>
      )}

      <form action={action} className="space-y-3">
        <div>
          <label htmlFor="reason" className="mb-1 block text-xs font-medium text-zinc-600">
            Written reason (required — logged to audit trail)
          </label>
          <textarea
            id="reason"
            name="reason"
            rows={3}
            required
            minLength={10}
            placeholder="Explain why the payment gate is being bypassed…"
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {pending ? "Applying…" : "Apply payment override"}
        </button>
      </form>
    </div>
  );
}
