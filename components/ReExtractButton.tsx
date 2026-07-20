"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { reExtractProject } from "@/app/actions/field-flags";

export function ReExtractButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setMessage(null);
    const result = await reExtractProject(projectId);
    setPending(false);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    const parts: string[] = [];
    if (result.newFlags) parts.push(`${result.newFlags} new field${result.newFlags === 1 ? "" : "s"} to review`);
    if (result.updatedFlags) parts.push(`${result.updatedFlags} updated`);
    if (result.conflicts.length) {
      parts.push(
        `${result.conflicts.length} conflict${result.conflicts.length === 1 ? "" : "s"} with already-resolved values: ${result.conflicts
          .map((c) => c.label)
          .join(", ")}`
      );
    }
    setMessage(parts.length ? parts.join(" · ") : "No changes found.");
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
    </div>
  );
}
