"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { reExtractProject, type ReExtractConflict } from "@/app/actions/field-flags";
import { FieldFlagReview } from "@/components/field-flag-review";

export function ReExtractButton({
  projectId,
  stakeholderView,
}: {
  projectId: string;
  stakeholderView?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ReExtractConflict[]>([]);

  async function handleClick() {
    setPending(true);
    setMessage(null);
    setConflicts([]);
    const result = await reExtractProject(projectId);
    setPending(false);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    const parts: string[] = [];
    if (result.newFlags) parts.push(`${result.newFlags} new field${result.newFlags === 1 ? "" : "s"} to review`);
    if (result.updatedFlags) parts.push(`${result.updatedFlags} updated`);
    setMessage(parts.length ? parts.join(" · ") : "No changes found.");
    setConflicts(result.conflicts);
    router.refresh();
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 disabled:opacity-50"
      >
        {pending ? "Re-extracting…" : "Re-extract from documents"}
      </button>
      {message && <p className="mt-1 text-xs text-zinc-500">{message}</p>}

      {conflicts.length > 0 && (
        <div className="mt-3 space-y-3">
          <p className="text-xs font-medium text-amber-800">
            Re-extraction found new values that conflict with an already-resolved field — review before
            keeping either:
          </p>
          {conflicts.map((c) => (
            <div key={c.flagId}>
              <p className="mb-1 text-xs font-medium text-zinc-700">{c.label}</p>
              <FieldFlagReview
                flagId={c.flagId}
                label={c.label}
                currentValue={c.resolvedValue}
                candidates={c.newCandidates}
                initiallyExpanded
                initialConflict={{ resolvedByEmail: c.resolvedByEmail, resolvedValue: c.resolvedValue }}
                flagType="inconsistency"
                stakeholderView={stakeholderView}
                onResolved={() => setConflicts((prev) => prev.filter((x) => x.flagId !== c.flagId))}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
