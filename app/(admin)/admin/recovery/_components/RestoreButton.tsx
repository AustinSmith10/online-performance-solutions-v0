"use client";

import { useActionState } from "react";
import { restoreProject } from "@/app/actions/recovery";
import { PILL_NEUTRAL } from "./pill";

export function RestoreButton({ projectId, label }: { projectId: string; label?: string }) {
  const boundAction = restoreProject.bind(null, projectId);
  const [state, formAction, pending] = useActionState(boundAction, {});

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
