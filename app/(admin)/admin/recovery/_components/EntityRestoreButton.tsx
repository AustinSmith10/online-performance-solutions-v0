"use client";

import { useActionState } from "react";
import { PILL_NEUTRAL } from "./pill";

type BoundAction = (prevState: { error?: string }, formData: FormData) => Promise<{ error?: string }>;

export function EntityRestoreButton({ action, label }: { action: BoundAction; label?: string }) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <button
        type="submit"
        disabled={pending}
        aria-label={label ? `Restore ${label}` : undefined}
        className={PILL_NEUTRAL}
      >
        {pending ? "Restoring…" : "Restore"}
      </button>
      {state.error && (
        <p role="alert" className="max-w-48 text-right text-xs text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
