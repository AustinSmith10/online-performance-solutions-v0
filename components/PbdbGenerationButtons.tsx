"use client";

import { useActionState, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { generatePbdbForProject, type GeneratePbdbState } from "@/app/actions/projects";

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.25" />
      <path
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.568 3 7.291l3-3.291z"
      />
    </svg>
  );
}

export function GeneratePbdbButton({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  // The ?pbdb_generated=1 redirect (which drives PbdbGeneratedBanner) happens
  // server-side inside the action itself — see the comment there for why a
  // client-side effect here isn't reliable.
  const boundAction = generatePbdbForProject.bind(null, projectId, pathname);
  const [state, formAction, pending] = useActionState<GeneratePbdbState, FormData>(boundAction, {});

  return (
    <form action={formAction}>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        {pending && <Spinner />}
        {pending ? "Generating…" : "Generate PBDB"}
      </button>
      {state.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
    </form>
  );
}

export function RegeneratePbdbButton({
  projectId,
  disabledMessage,
}: {
  projectId: string;
  /** If set, regeneration is unavailable — this note is shown instead of a button. */
  disabledMessage?: string;
}) {
  const pathname = usePathname();
  const boundAction = generatePbdbForProject.bind(null, projectId, pathname);
  const [state, formAction, pending] = useActionState<GeneratePbdbState, FormData>(boundAction, {});
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (state.success) queueMicrotask(() => setConfirming(false));
  }, [state.success]);

  if (disabledMessage) {
    return <p className="text-xs text-zinc-400">{disabledMessage}</p>;
  }

  return (
    <>
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30">
          <div className="mx-4 w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-xl text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
              <svg className="h-6 w-6 text-amber-600" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <p className="text-base font-semibold text-zinc-900">Regenerate PBDB?</p>
            <p className="mt-2 text-sm text-zinc-500">
              This will create a new version of the PBDB. Existing versions will be kept.
            </p>
            {state.error && <p className="mt-3 text-sm text-red-600">{state.error}</p>}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={pending}
                className="flex-1 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <form action={formAction} className="flex-1">
                <button
                  type="submit"
                  disabled={pending}
                  className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
                >
                  {pending ? "Regenerating…" : "Confirm"}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={pending}
        className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      >
        Regenerate
      </button>
      {state.error && !confirming && <p className="mt-2 text-xs text-red-600">{state.error}</p>}
    </>
  );
}
