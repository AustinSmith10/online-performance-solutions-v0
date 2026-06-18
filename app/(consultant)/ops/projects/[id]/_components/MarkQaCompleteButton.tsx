"use client";

import { useActionState } from "react";
import { markQaComplete, type MarkQaCompleteState } from "@/app/actions/projects";

export function MarkQaCompleteButton({ projectId }: { projectId: string }) {
  const boundAction = markQaComplete.bind(null, projectId);
  const [state, formAction, pending] = useActionState<MarkQaCompleteState, FormData>(
    boundAction,
    {}
  );

  return (
    <form action={formAction}>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Mark QA complete"}
        </button>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      </div>
    </form>
  );
}
