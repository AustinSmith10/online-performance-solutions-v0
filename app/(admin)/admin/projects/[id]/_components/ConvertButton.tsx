"use client";

import { useActionState } from "react";
import { triggerPbdrConversion, type ConvertState } from "@/app/actions/conversion";

export function ConvertButton({ projectId }: { projectId: string }) {
  const boundAction = triggerPbdrConversion.bind(null, projectId);
  const [state, formAction, pending] = useActionState<ConvertState, FormData>(
    boundAction,
    {}
  );

  if (state.success) {
    return (
      <p className="text-sm text-green-700 font-medium">
        PBDR delivered. Project marked complete.
      </p>
    );
  }

  return (
    <form action={formAction}>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        {pending ? "Converting…" : "Convert & deliver PBDR"}
      </button>
      {state.error && (
        <p className="mt-2 text-sm text-red-600">{state.error}</p>
      )}
    </form>
  );
}
