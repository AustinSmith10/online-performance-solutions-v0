"use client";

import { useActionState } from "react";
import { restoreProject } from "@/app/actions/recovery";

export function RestoreButton({ projectId }: { projectId: string }) {
  const boundAction = restoreProject.bind(null, projectId);
  const [state, formAction, pending] = useActionState(boundAction, {});

  return (
    <form action={formAction}>
      {state.error && (
        <p className="mb-1 text-xs text-red-600">{state.error}</p>
      )}
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
