"use client";

import { useActionState, useState } from "react";
import { resumeProject, type PauseState } from "@/app/actions/projects";

export function ResumeButton({
  projectId,
  daysPaused,
}: {
  projectId: string;
  daysPaused: number;
}) {
  const bound = resumeProject.bind(null, projectId);
  const [state, formAction, pending] = useActionState<PauseState, FormData>(bound, {});
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30">
          <div className="mx-4 w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-xl text-center">
            <p className="text-base font-semibold text-zinc-900">Resume project?</p>
            <p className="mt-2 text-sm text-zinc-500">
              Paused {daysPaused} day{daysPaused !== 1 ? "s" : ""} ago. The delivery date will
              be pushed forward by {daysPaused} calendar day{daysPaused !== 1 ? "s" : ""}.
            </p>
            {state.error && <p className="mt-3 text-sm text-red-600">{state.error}</p>}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="flex-1 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <form action={formAction} className="flex-1">
                <button
                  type="submit"
                  disabled={pending}
                  className="w-full rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {pending ? "Resuming…" : "Confirm"}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
      >
        Resume project
      </button>
    </>
  );
}
