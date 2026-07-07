"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveProjectNumber, type ProjectNumberState } from "@/app/actions/projects";
import { EditIconButton } from "@/components/EditIconButton";
import { useUnsavedChanges } from "@/components/UnsavedChangesProvider";
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
  const [editing, setEditing] = useState(false);
  const completed = !!projectNumber;
  useUnsavedChanges("consultant-project-number", editing && completed);

  useEffect(() => {
    if (state.success) {
      queueMicrotask(() => setEditing(false));
      router.refresh();
    }
  }, [state.success, router]);

  const showForm = !completed || editing;

  return (
    <div className={`rounded-lg border ${completed ? "border-green-200 bg-green-50" : "border-zinc-200 bg-white"}`}>
      <div className="flex items-center gap-3 border-b border-zinc-100 px-5 py-4">
        <StepIndicator step={1} completed={completed} />
        <h3 className={`text-sm font-semibold ${completed ? "text-green-800" : "text-zinc-900"}`}>
          Set project number
        </h3>
      </div>

      <div className="px-5 py-4">
        {completed && !editing ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-green-700">
              Project number set: {projectNumber}-S
            </p>
            <EditIconButton
              onClick={() => setEditing(true)}
              label="Edit project number"
              className="text-green-700 hover:bg-green-100 hover:text-green-900"
            />
          </div>
        ) : (
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
                defaultValue={projectNumber ?? ""}
                placeholder="e.g. 25-001"
                className="block w-full max-w-xs rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50"
              />
              <p className="mt-1 text-xs text-zinc-400">
                The suffix <span className="font-mono">-S</span> is appended automatically in generated documents.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                {pending ? "Saving…" : "Save"}
              </button>
              {showForm && completed && (
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  disabled={pending}
                  className="text-sm text-zinc-500 hover:text-zinc-700 disabled:opacity-50"
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
