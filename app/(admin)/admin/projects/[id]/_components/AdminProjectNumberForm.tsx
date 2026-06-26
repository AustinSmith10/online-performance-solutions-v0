"use client";

import { useActionState, useState } from "react";
import {
  adminSetProjectNumber,
  type AdminProjectNumberState,
} from "@/app/actions/projects";

interface Props {
  projectId: string;
  currentNumber: string | null;
}

export function AdminProjectNumberForm({ projectId, currentNumber }: Props) {
  const boundAction = adminSetProjectNumber.bind(null, projectId);
  const [state, action, pending] = useActionState<AdminProjectNumberState, FormData>(
    boundAction,
    {}
  );
  const [editing, setEditing] = useState(!currentNumber);

  if (state.success && !editing) {
    // Stay in read-only view after a successful save (page revalidates to show new PBDB)
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-zinc-500">
          {currentNumber
            ? "Updating the number re-generates the PBDB from the current template and field values."
            : "Set the project number to generate the initial PBDB document."}
        </p>

        {!editing && currentNumber ? (
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <span className="rounded-md bg-zinc-100 px-3 py-1.5 font-mono text-sm text-zinc-900">
              {currentNumber}
            </span>
            <span className="text-xs text-zinc-400">→ document prefix: {currentNumber}-S</span>
          </div>
        ) : (
          <form action={action} className="mt-3 space-y-3">
            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">
                Project number
              </label>
              <input
                name="project_number"
                type="text"
                defaultValue={currentNumber ?? ""}
                placeholder="e.g. 25-001"
                required
                className="block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              />
              <p className="mt-1 text-xs text-zinc-400">
                The suffix <span className="font-mono">-S</span> is appended automatically in generated documents.
              </p>
            </div>

            {state.error && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{state.error}</p>
            )}

            {state.success && (
              <p className="text-xs text-green-600">PBDB generated successfully.</p>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                {pending
                  ? "Generating…"
                  : currentNumber
                  ? "Update & re-generate"
                  : "Set & generate PBDB"}
              </button>
              {currentNumber && (
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}
      </div>

      {currentNumber && !editing && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="shrink-0 rounded border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Edit
        </button>
      )}
    </div>
  );
}
