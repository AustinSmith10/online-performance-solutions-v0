"use client";

import { useActionState } from "react";
import { pauseProject, type PauseState } from "@/app/actions/projects";

export function PauseForm({ projectId }: { projectId: string }) {
  const bound = pauseProject.bind(null, projectId);
  const [state, formAction, pending] = useActionState<PauseState, FormData>(bound, {});

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label htmlFor="pause-reason" className="mb-1.5 block text-xs font-medium text-zinc-700">
          Reason for pause
        </label>
        <textarea
          id="pause-reason"
          name="reason"
          rows={2}
          required
          placeholder="e.g. Client requested hold pending DA outcome"
          className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none"
        />
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
      >
        {pending ? "Pausing…" : "Pause project"}
      </button>
    </form>
  );
}
