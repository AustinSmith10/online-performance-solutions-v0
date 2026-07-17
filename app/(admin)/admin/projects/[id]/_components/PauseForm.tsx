"use client";

import { useActionState, useState } from "react";
import { pauseProject, type PauseState } from "@/app/actions/projects";

export function PauseForm({ projectId }: { projectId: string }) {
  const bound = pauseProject.bind(null, projectId);
  const [state, formAction, pending] = useActionState<PauseState, FormData>(bound, {});
  const [open, setOpen] = useState(false);

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30">
          <div className="mx-4 w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-xl">
            <p className="text-base font-semibold text-zinc-900">Pause project?</p>
            <p className="mt-1 text-sm text-zinc-500">
              The project will be frozen at its current stage. Provide a reason below.
            </p>
            <form action={formAction} className="mt-4 space-y-4">
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
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="flex-1 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
                >
                  {pending ? "Pausing…" : "Pause project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 whitespace-nowrap rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
      >
        Pause project
      </button>
    </>
  );
}
