"use client";

import { useActionState } from "react";
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

  return (
    <form action={formAction} className="space-y-3">
      <p className="text-xs text-zinc-500">
        Paused {daysPaused} day{daysPaused !== 1 ? "s" : ""} ago. Resuming will push
        the delivery date forward by {daysPaused} calendar day{daysPaused !== 1 ? "s" : ""}.
      </p>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
      >
        {pending ? "Resuming…" : "Resume project"}
      </button>
    </form>
  );
}
