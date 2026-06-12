"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { topUpCreditAction, type TopUpState } from "@/app/actions/credits";

interface Props {
  orgId: string;
}

export function TopUpForm({ orgId }: Props) {
  const router = useRouter();
  const boundAction = topUpCreditAction.bind(null, orgId);
  const [state, action, pending] = useActionState<TopUpState, FormData>(boundAction, {});

  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);

  return (
    <div className="space-y-3">
      {state.error && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>
      )}
      {state.success && (
        <p className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-700">
          Credits added successfully.
        </p>
      )}

      <form action={action} className="space-y-3">
        <div className="flex items-end gap-3">
          <div>
            <label htmlFor="amount" className="mb-1 block text-xs font-medium text-zinc-600">
              Credits to add
            </label>
            <input
              id="amount"
              name="amount"
              type="number"
              min={1}
              max={10000}
              required
              placeholder="e.g. 10"
              className="w-32 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="notes" className="mb-1 block text-xs font-medium text-zinc-600">
              Notes (optional)
            </label>
            <input
              id="notes"
              name="notes"
              type="text"
              placeholder="e.g. Invoice #1234"
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {pending ? "Adding…" : "Add credits"}
          </button>
        </div>
      </form>
    </div>
  );
}
