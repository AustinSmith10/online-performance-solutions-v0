"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveProjectNumber, type ProjectNumberState } from "@/app/actions/projects";
import { EditIconButton } from "@/components/EditIconButton";
import { useUnsavedChanges } from "@/components/UnsavedChangesProvider";

export function ProjectNumberCard({
  projectId,
  projectNumber,
}: {
  projectId: string;
  projectNumber: string | null;
}) {
  const router = useRouter();
  const boundAction = saveProjectNumber.bind(null, projectId);
  const [state, formAction, pending] = useActionState<ProjectNumberState, FormData>(boundAction, {});
  const [editing, setEditing] = useState(false);
  useUnsavedChanges("consultant-project-number-card", editing);

  useEffect(() => {
    if (state.success) {
      queueMicrotask(() => setEditing(false));
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-sm font-semibold text-zinc-500">
          #
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Project number</p>
      </div>

      {projectNumber && !editing ? (
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5">
            <svg className="h-3.5 w-3.5 shrink-0 text-green-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
            </svg>
            <span className="text-sm font-medium text-zinc-900">{projectNumber}-S</span>
          </span>
          <EditIconButton onClick={() => setEditing(true)} label="Edit project number" />
        </div>
      ) : (
        <form action={formAction} className="space-y-2.5">
          <div>
            <input
              id="project_number"
              name="project_number"
              type="text"
              required
              disabled={pending}
              defaultValue={projectNumber ?? ""}
              placeholder="e.g. 25-001"
              className="block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50"
            />
            <p className="mt-1 text-xs text-zinc-400">
              The suffix <span className="font-mono">-S</span> is appended automatically.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save"}
            </button>
            {projectNumber && (
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={pending}
                className="text-sm text-zinc-500 hover:text-zinc-700 disabled:opacity-50"
              >
                Cancel
              </button>
            )}
          </div>
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        </form>
      )}
    </div>
  );
}
