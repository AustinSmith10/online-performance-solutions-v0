"use client";

import { useActionState } from "react";
import { saveProjectNumber, type ProjectNumberState } from "@/app/actions/projects";

export function ProjectNumberForm({ projectId }: { projectId: string }) {
  const boundAction = saveProjectNumber.bind(null, projectId);
  const [state, formAction, pending] = useActionState<ProjectNumberState, FormData>(
    boundAction,
    {}
  );

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label
          htmlFor="project_number"
          className="block text-sm font-medium text-zinc-700 mb-1.5"
        >
          DDEG project number
        </label>
        <input
          id="project_number"
          name="project_number"
          type="text"
          required
          disabled={pending}
          placeholder="e.g. 25-001"
          className="block w-full max-w-xs rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50"
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {pending ? "Generating PBDB…" : "Set project number & generate PBDB"}
        </button>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      </div>
    </form>
  );
}
