"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { setOrgFrozenFromCredits, type FreezeState } from "@/app/actions/credits";

interface Props {
  orgId: string;
  isFrozen: boolean;
}

export function FreezeForm({ orgId, isFrozen }: Props) {
  const router = useRouter();
  const boundAction = setOrgFrozenFromCredits.bind(null, orgId, !isFrozen);
  const [state, action, pending] = useActionState<FreezeState, FormData>(boundAction, {});

  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);

  return (
    <div className="space-y-2">
      {state.error && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>
      )}
      <form action={action}>
        <button
          type="submit"
          disabled={pending}
          className={`rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
            isFrozen
              ? "bg-green-700 hover:bg-green-800"
              : "bg-red-600 hover:bg-red-700"
          }`}
        >
          {pending
            ? isFrozen ? "Unfreezing…" : "Freezing…"
            : isFrozen ? "Unfreeze account" : "Freeze account"}
        </button>
      </form>
    </div>
  );
}
