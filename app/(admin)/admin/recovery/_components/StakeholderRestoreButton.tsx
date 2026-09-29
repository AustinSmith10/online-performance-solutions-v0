"use client";

import { useState, useTransition } from "react";
import { PILL_NEUTRAL } from "./pill";
import { restoreOrgStakeholder, restoreProjectStakeholder } from "@/app/actions/stakeholders";

export function StakeholderRestoreButton({
  scope,
  scopeId,
  stakeholderId,
  label,
}: {
  scope: "org" | "project";
  scopeId: string;
  stakeholderId: string;
  label?: string;
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

  if (done) return <span className="text-xs text-zinc-500">Restored</span>;

  return (
    <button
      type="button"
      onClick={handleRestore}
      disabled={isPending}
      aria-label={label ? `Restore ${label}` : undefined}
      className={PILL_NEUTRAL}
    >
      {isPending ? "Restoring…" : "Restore"}
    </button>
  );
}
