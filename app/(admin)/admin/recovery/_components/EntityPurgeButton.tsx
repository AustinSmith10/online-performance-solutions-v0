"use client";

import { useActionState, useState } from "react";
import { PILL_DANGER_OUTLINE, PILL_DANGER_SOLID, PILL_MUTED } from "./pill";

type PurgeState = { error?: string; success?: boolean };
type BoundAction = (prevState: PurgeState, formData: FormData) => Promise<PurgeState>;

export function EntityPurgeButton({
  action,
  warning,
  label,
  confirmName,
}: {
  action: BoundAction;
  warning: string;
  label?: string;
  // High-impact purges (a client cascades to its templates and stakeholders)
  // make the admin type the name before the destructive button unlocks.
  confirmName?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");

  if (state.success) {
    return (
      <span role="status" className="text-xs text-zinc-500">
        Deleted
      </span>
    );
  }

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

  const nameOk = !confirmName || typed.trim().toLowerCase() === confirmName.trim().toLowerCase();

  return (
    <div className="flex flex-col items-end gap-2">
      <p role="alert" className="max-w-xs text-right text-xs font-medium text-red-700">
        {warning}
      </p>
      {confirmName && (
        <div className="flex flex-col items-end gap-1">
          <label htmlFor={`purge-confirm-${confirmName}`} className="text-xs text-zinc-600">
            Type <span className="font-semibold text-zinc-900">{confirmName}</span> to confirm
          </label>
          <input
            id={`purge-confirm-${confirmName}`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className="w-56 rounded-md border border-zinc-300 px-2 py-1 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          />
        </div>
      )}
      {state.error && <p className="text-xs text-red-700">{state.error}</p>}
      <div className="flex items-center gap-2">
        <form action={formAction}>
          <button type="submit" disabled={pending || !nameOk} className={PILL_DANGER_SOLID}>
            {pending ? "Deleting…" : "Yes, delete forever"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setTyped("");
          }}
          disabled={pending}
          className={PILL_MUTED}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
