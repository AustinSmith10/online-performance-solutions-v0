"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { purgeProject } from "@/app/actions/recovery";

type Phase = "idle" | "confirming" | "success";

export function PurgeButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const boundAction = purgeProject.bind(null, projectId);
  const [state, formAction, pending] = useActionState(boundAction, {});
  const [phase, setPhase] = useState<Phase>("idle");

  useEffect(() => {
    if (!state.success) return;
    const t = setTimeout(() => setPhase("success"), 0);
    return () => clearTimeout(t);
  }, [state.success]);

  useEffect(() => {
    if (phase !== "success") return;
    const t = setTimeout(() => router.push("/portal/recovery"), 2500);
    return () => clearTimeout(t);
  }, [phase, router]);

  return (
    <>
      <button
        type="button"
        onClick={() => setPhase("confirming")}
        className="rounded border border-red-200 bg-white px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
      >
        Delete forever
      </button>

      {(phase === "confirming" || phase === "success") && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30">
          {phase === "success" ? (
            <div className="mx-4 w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-xl text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100">
                <svg className="h-6 w-6 text-zinc-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                </svg>
              </div>
              <p className="text-base font-semibold text-zinc-900">Project permanently deleted</p>
              <p className="mt-2 text-sm text-zinc-500">
                All files and data for this project have been removed and cannot be recovered.
              </p>
            </div>
          ) : (
            <div className="mx-4 w-full max-w-sm rounded-xl border border-red-200 bg-white p-8 shadow-xl">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                <svg className="h-6 w-6 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <p className="text-base font-semibold text-zinc-900 text-center">Permanently delete this project?</p>
              <p className="mt-2 text-sm text-zinc-500 text-center">
                This will remove the project and all its files forever. <span className="font-medium text-red-600">This cannot be undone.</span>
              </p>
              {state.error && <p className="mt-3 text-sm text-red-600 text-center">{state.error}</p>}
              <div className="mt-6 flex flex-col gap-2">
                <form action={formAction}>
                  <button
                    type="submit"
                    disabled={pending}
                    className="w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {pending ? "Deleting…" : "Yes, delete forever"}
                  </button>
                </form>
                <button
                  type="button"
                  onClick={() => setPhase("idle")}
                  disabled={pending}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
