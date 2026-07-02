"use client";

import { useActionState, useEffect, useState } from "react";
import {
  adminSetProjectNumber,
  type AdminProjectNumberState,
} from "@/app/actions/projects";
import { EditIconButton } from "@/components/EditIconButton";

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
  const [overlayVisible, setOverlayVisible] = useState(false);

  useEffect(() => {
    if (!state.success) return;
    const t1 = setTimeout(() => { setEditing(false); setOverlayVisible(true); }, 0);
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
              Generate the PBDB from the PBDB step below.
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

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-zinc-500">
            {currentNumber
              ? "Updating the number does not regenerate the PBDB automatically — use Regenerate in the PBDB step if needed."
              : "Set the project number to unlock PBDB generation."}
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

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
                >
                  {pending ? "Saving…" : currentNumber ? "Update number" : "Save"}
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
          <EditIconButton onClick={() => setEditing(true)} label="Edit project number" />
        )}
      </div>
    </>
  );
}
