"use client";

import { useActionState, useState } from "react";
import { purgeProject } from "@/app/actions/recovery";
import { PILL_DANGER_OUTLINE, PILL_DANGER_SOLID, PILL_MUTED } from "./pill";

export function PurgeButton({ projectId, label }: { projectId: string; label?: string }) {
  const boundAction = purgeProject.bind(null, projectId);
  const [state, formAction, pending] = useActionState(boundAction, {});
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={label ? `Delete ${label} forever` : undefined}
        className={PILL_DANGER_OUTLINE}
      >
        Delete forever
      </button>
    );
  }

  // Cancel sits where "Delete forever" was, so a double-click on the original
  // button lands on the safe choice, not the destructive one.
  return (
    <div className="rise-in flex flex-col items-end gap-2">
      <p role="alert" className="max-w-xs text-right text-xs font-medium text-red-700">
        This will permanently remove the project and all its files. This cannot be undone.
      </p>
      {state.error && <p className="text-xs text-red-700">{state.error}</p>}
      <div className="flex items-center gap-2">
        <form action={formAction}>
          <button type="submit" disabled={pending} className={PILL_DANGER_SOLID}>
            {pending ? "Deleting…" : "Yes, delete forever"}
          </button>
        </form>
        <button type="button" onClick={() => setConfirming(false)} disabled={pending} className={PILL_MUTED}>
          Cancel
        </button>
      </div>
    </div>
  );
}
