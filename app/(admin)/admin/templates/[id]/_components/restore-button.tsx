"use client";

import { useActionState } from "react";
import { restoreTemplate } from "@/app/actions/templates";

export function RestoreButton({ templateId }: { templateId: string }) {
  const boundAction = restoreTemplate.bind(null, templateId);
  const [state, formAction, pending] = useActionState(boundAction, {});

  return (
    <form action={formAction} className="flex items-center gap-3">
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        {pending ? "Restoring…" : "Restore template"}
      </button>
    </form>
  );
}
