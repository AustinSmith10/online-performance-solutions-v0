"use client";

import { useActionState, useState } from "react";
import { purgeProject } from "@/app/actions/recovery";

export function PurgeButton({ projectId }: { projectId: string }) {
  const boundAction = purgeProject.bind(null, projectId);
  const [state, formAction, pending] = useActionState(boundAction, {});
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded border border-red-200 bg-white px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
      >
        Delete forever
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <p className="max-w-xs text-right text-xs font-medium text-red-700">
        This will permanently remove the project and all its files. This cannot be undone.
      </p>
      {state.error && (
        <p className="text-xs text-red-600">{state.error}</p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
        >
          Cancel
        </button>
        <form action={formAction}>
          <button
            type="submit"
            disabled={pending}
            className="rounded border border-red-300 bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {pending ? "Deleting…" : "Yes, delete forever"}
          </button>
        </form>
      </div>
    </div>
  );
}
