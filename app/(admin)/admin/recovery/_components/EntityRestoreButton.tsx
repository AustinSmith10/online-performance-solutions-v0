"use client";

import { useActionState } from "react";

type BoundAction = (prevState: { error?: string }, formData: FormData) => Promise<{ error?: string }>;

export function EntityRestoreButton({ action }: { action: BoundAction }) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction}>
      {state.error && <p className="mb-1 text-xs text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      >
        {pending ? "Restoring…" : "Restore"}
      </button>
    </form>
  );
}
