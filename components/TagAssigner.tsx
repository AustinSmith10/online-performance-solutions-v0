"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignTag, unassignTag } from "@/app/actions/tags";
import { TagChip, type TagChipData } from "@/components/TagChip";

/**
 * Add/remove tags on one account (#213). Only rendered where the server has
 * already decided the viewer may tag this account (lib/tags/permissions.ts);
 * the assign/unassign actions re-check that rule regardless.
 */
export function TagAssigner({
  targetUserId,
  assigned,
  allTags,
}: {
  targetUserId: string;
  assigned: TagChipData[];
  allTags: TagChipData[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const assignedIds = new Set(assigned.map((t) => t.id));
  const available = allTags.filter((t) => !assignedIds.has(t.id));

  function run(fn: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {assigned.map((t) => (
        <span key={t.id} className="inline-flex items-center gap-0.5">
          <TagChip tag={t} />
          <button
            type="button"
            disabled={pending}
            aria-label={`Remove tag ${t.name}`}
            onClick={() => run(() => unassignTag(t.id, targetUserId))}
            className="rounded-full px-1 text-xs leading-none text-zinc-400 hover:text-zinc-700 disabled:opacity-50 [@media(pointer:coarse)]:min-h-8 [@media(pointer:coarse)]:min-w-8"
          >
            ×
          </button>
        </span>
      ))}
      {available.length > 0 && (
        <select
          aria-label="Add a tag"
          disabled={pending}
          value=""
          onChange={(e) => e.target.value && run(() => assignTag(e.target.value, targetUserId))}
          className="rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-xs text-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-400 disabled:opacity-50"
        >
          <option value="">+ Add tag</option>
          {available.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}
      {assigned.length === 0 && available.length === 0 && <span className="text-xs text-zinc-400">No tags exist yet</span>}
      {error && <span className="w-full text-xs text-red-600">{error}</span>}
    </div>
  );
}
