"use client";

import { useActionState } from "react";
import { dispatchToStakeholders, type DispatchState } from "@/app/actions/stakeholders";

export function DispatchButton({ projectId }: { projectId: string }) {
  const boundAction = dispatchToStakeholders.bind(null, projectId);
  const [state, formAction, pending] = useActionState<DispatchState, FormData>(
    boundAction,
    {}
  );

  return (
    <form action={formAction}>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        {pending ? "Dispatching…" : "Dispatch to stakeholders"}
      </button>
      {state.error && (
        <p className="mt-2 text-sm text-red-600">{state.error}</p>
      )}
    </form>
  );
}
