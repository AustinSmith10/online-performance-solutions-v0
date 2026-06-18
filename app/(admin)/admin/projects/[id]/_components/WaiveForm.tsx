"use client";

import { useActionState } from "react";
import { waiveStakeholderResponse, type WaiveState } from "@/app/actions/stakeholders";

interface Props {
  reviewId: string;
  projectId: string;
  stakeholderName: string;
}

export function WaiveForm({ reviewId, projectId, stakeholderName }: Props) {
  const boundAction = waiveStakeholderResponse.bind(null, reviewId, projectId);
  const [state, formAction, pending] = useActionState<WaiveState, FormData>(
    boundAction,
    {}
  );

  if (state.saved) {
    return <p className="text-xs text-green-700">Waived.</p>;
  }

  return (
    <form action={formAction} className="mt-2 space-y-2">
      <input
        name="reason"
        type="text"
        required
        placeholder={`Reason for waiving ${stakeholderName}…`}
        className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-xs focus:border-zinc-500 focus:outline-none"
        minLength={10}
      />
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
      >
        {pending ? "Waiving…" : "Waive response"}
      </button>
    </form>
  );
}
