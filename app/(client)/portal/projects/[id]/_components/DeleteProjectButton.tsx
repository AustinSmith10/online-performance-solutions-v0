"use client";

import { useState, useTransition } from "react";
import { softDeleteProject } from "@/app/actions/recovery";

type Phase = "idle" | "confirming" | "pending";

export function DeleteProjectButton({ projectId }: { projectId: string }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    setPhase("pending");
    startTransition(async () => {
      const result = await softDeleteProject(projectId);
      if (result?.error) {
        setError(result.error);
        setPhase("confirming");
      }
      // on success, server redirects to /portal?deleted=1
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setPhase("confirming"); setError(null); }}
        className="text-sm text-red-600 hover:text-red-800"
      >
        Delete report request
      </button>

      {phase !== "idle" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30">
          <div className="mx-4 w-full max-w-sm rounded-xl border border-red-200 bg-white p-8 shadow-xl">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <svg className="h-6 w-6 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <p className="text-base font-semibold text-zinc-900 text-center">Move to recovery bin?</p>
            <p className="mt-2 text-sm text-zinc-500 text-center">
              This report request will be moved to your recovery bin. You can restore it within 30 days.
            </p>
            {error && <p className="mt-3 text-sm text-red-600 text-center">{error}</p>}
            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                className="w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isPending ? "Deleting…" : "Yes, move to recovery bin"}
              </button>
              <button
                type="button"
                onClick={() => { setPhase("idle"); setError(null); }}
                disabled={isPending}
                className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
