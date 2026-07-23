"use client";

import { useState, useTransition } from "react";
import { confirmProjectFileType } from "@/app/actions/projects";

const FILE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "purchase_order", label: "Purchase Order" },
  { value: "building_drawing_plans", label: "Building Drawing Plans" },
  { value: "additional", label: "Additional" },
];

// Documents attached via inbound email get a file_type *suggestion*, not a
// final answer (#101 follow-up) — this is the "needs review" affordance on
// the project's Documents panel that lets an admin/consultant confirm or
// correct it before it's treated as settled.
export function ConfirmFileTypeControl({
  projectId,
  fileId,
  currentFileType,
}: {
  projectId: string;
  fileId: string;
  currentFileType: string;
}) {
  const [selected, setSelected] = useState(currentFileType);
  const [confirmed, setConfirmed] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (confirmed) return null;

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await confirmProjectFileType(projectId, fileId, selected);
      if (result.error) {
        setError(result.error);
        return;
      }
      setConfirmed(true);
    });
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
        Needs review
      </span>
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        disabled={isPending}
        className="rounded-md border border-zinc-300 px-1.5 py-0.5 text-xs text-zinc-700"
      >
        {FILE_TYPE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={handleConfirm}
        disabled={isPending}
        className="rounded-md border border-zinc-300 px-2 py-0.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-30"
      >
        {isPending ? "Saving…" : "Confirm"}
      </button>
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </div>
  );
}
