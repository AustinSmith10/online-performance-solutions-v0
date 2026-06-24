"use client";

import { useState, useTransition } from "react";
import { setProjectStripTokenColor } from "@/app/actions/projects";

export function ProjectStripColorToggle({
  projectId,
  initialValue,
}: {
  projectId: string;
  initialValue: boolean;
}) {
  const [strip, setStrip] = useState(initialValue);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleToggle() {
    const next = !strip;
    startTransition(async () => {
      const result = await setProjectStripTokenColor(projectId, next);
      if (result.error) {
        setError(result.error);
      } else {
        setStrip(next);
        setError(null);
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleToggle}
          disabled={pending}
          role="switch"
          aria-checked={strip}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2 disabled:opacity-50 ${
            strip ? "bg-zinc-900" : "bg-zinc-200"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
              strip ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
        <span className="text-sm text-zinc-700">
          {strip
            ? "Client receives black text (token colour stripped)"
            : "Client receives document as-is (token colour preserved)"}
        </span>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
