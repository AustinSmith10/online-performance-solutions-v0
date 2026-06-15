"use client";

import { useState, useTransition } from "react";
import { softDeleteProject } from "@/app/actions/recovery";

export function DeleteProjectButton({ projectId }: { projectId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    startTransition(async () => {
      const result = await softDeleteProject(projectId);
      if (result?.error) setError(result.error);
    });
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-sm text-red-600 hover:text-red-800"
      >
        Delete report request
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-3">
      <p className="text-sm text-red-800 font-medium">
        Move this report request to the recovery bin?
      </p>
      <p className="text-xs text-red-700">
        You can restore it within 30 days from your recovery bin.
      </p>
      {error && <p className="text-xs text-red-700">{error}</p>}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending}
          className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {isPending ? "Deleting…" : "Yes, delete"}
        </button>
        <button
          type="button"
          onClick={() => { setConfirming(false); setError(null); }}
          disabled={isPending}
          className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
