"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveProjectNumber, type ProjectNumberState } from "@/app/actions/projects";
import { StepIndicator } from "./StepIndicator";

export function ProjectNumberForm({
  projectId,
  projectNumber,
}: {
  projectId: string;
  projectNumber: string | null;
}) {
  const router = useRouter();
  const boundAction = saveProjectNumber.bind(null, projectId);
  const [state, formAction, pending] = useActionState<ProjectNumberState, FormData>(
    boundAction,
    {}
  );
  const [editing, setEditing] = useState(!projectNumber);
  const [editKey, setEditKey] = useState(0);

  useEffect(() => {
    if (state.success) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEditing(false);
      router.refresh();
    }
  }, [state.success, router]);

  const completed = !!projectNumber && !editing;

  function handleEdit() {
    setEditKey((k) => k + 1);
    setEditing(true);
  }

  return (
    <div className={`rounded-lg border ${completed ? "border-green-200 bg-green-50" : "border-zinc-200 bg-white"}`}>
      <div className="flex items-center gap-3 border-b border-zinc-100 px-5 py-4">
        <StepIndicator step={1} completed={completed} />
        <h3 className={`text-sm font-semibold ${completed ? "text-green-800" : "text-zinc-900"}`}>
          Set project number
        </h3>
        {completed && (
          <button
            type="button"
            onClick={handleEdit}
            className="ml-auto shrink-0 rounded border border-green-300 bg-white px-3 py-1.5 text-xs font-medium text-green-800 hover:bg-green-100"
          >
            Edit
          </button>
        )}
      </div>

      <div className="px-5 py-4">
        {completed ? (
          <p className="text-xs text-green-700">Project number set: {projectNumber}-S</p>
        ) : (
          <form key={editKey} action={formAction} className="space-y-3">
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
                defaultValue={projectNumber ?? ""}
                placeholder="e.g. 25-001"
                className="block w-full max-w-xs rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50"
              />
              <p className="mt-1 text-xs text-zinc-400">
                {projectNumber ? (
                  "Updating the number does not regenerate the PBDB automatically — use Regenerate in the PBDB step if needed."
                ) : (
                  <>
                    The suffix <span className="font-mono">-S</span> is appended automatically in generated documents.
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                {pending ? "Saving…" : projectNumber ? "Update number" : "Save"}
              </button>
              {projectNumber && (
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  disabled={pending}
                  className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  Cancel
                </button>
              )}
              {state.error && <p className="text-sm text-red-600">{state.error}</p>}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
