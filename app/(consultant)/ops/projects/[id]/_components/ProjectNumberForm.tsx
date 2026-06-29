"use client";

import { useActionState, useEffect, useState } from "react";
import { saveProjectNumber, type ProjectNumberState } from "@/app/actions/projects";

export function ProjectNumberForm({ projectId }: { projectId: string }) {
  const boundAction = saveProjectNumber.bind(null, projectId);
  const [state, formAction, pending] = useActionState<ProjectNumberState, FormData>(
    boundAction,
    {}
  );
  const [overlayVisible, setOverlayVisible] = useState(false);

  useEffect(() => {
    if (!state.success) return;
    const t1 = setTimeout(() => setOverlayVisible(true), 0);
    const t2 = setTimeout(() => setOverlayVisible(false), 3500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [state.success]);

  return (
    <>
      {overlayVisible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30">
          <div className="mx-4 w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-xl text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <svg className="h-6 w-6 text-green-600" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-base font-semibold text-zinc-900">Project number saved</p>
            <p className="mt-2 text-sm text-zinc-500">
              Your PBDB is being generated — it will appear in the files section in a moment. Refresh if it doesn&rsquo;t appear shortly.
            </p>
            <button
              type="button"
              onClick={() => setOverlayVisible(false)}
              className="mt-6 w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
            >
              Got it
            </button>
          </div>
        </div>
      )}

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
    </>
  );
}
