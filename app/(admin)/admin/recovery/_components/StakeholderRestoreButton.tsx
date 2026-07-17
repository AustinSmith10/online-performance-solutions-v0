"use client";

import { useState, useTransition } from "react";
import { restoreOrgStakeholder, restoreProjectStakeholder } from "@/app/actions/stakeholders";

export function StakeholderRestoreButton({
  scope,
  scopeId,
  stakeholderId,
}: {
  scope: "org" | "project";
  scopeId: string;
  stakeholderId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  function handleRestore() {
    startTransition(async () => {
      if (scope === "org") await restoreOrgStakeholder(scopeId, stakeholderId);
      else await restoreProjectStakeholder(scopeId, stakeholderId);
      setDone(true);
    });
  }

  if (done) return <span className="text-xs text-zinc-400">Restored</span>;

  return (
    <button
      type="button"
      onClick={handleRestore}
      disabled={isPending}
      className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
    >
      {isPending ? "Restoring…" : "Restore"}
    </button>
  );
}
