"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { setOrgFrozenFromCredits, type FreezeState } from "@/app/actions/credits";
import { Drawer } from "@/components/Drawer";

interface Props {
  orgId: string;
  isFrozen: boolean;
}

export function FreezeForm({ orgId, isFrozen }: Props) {
  const router = useRouter();
  const boundAction = setOrgFrozenFromCredits.bind(null, orgId, !isFrozen);
  const [state, action, pending] = useActionState<FreezeState, FormData>(boundAction, {});
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (state.success) {
      router.refresh();
      queueMicrotask(() => setConfirming(false));
    }
  }, [state.success, router]);

  return (
    <div className="space-y-2">
      {state.error && (
        <p className="rise-in rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>
      )}
      {isFrozen ? (
        // Unfreezing restores service, so it stays one click.
        <form action={action}>
          <button
            type="submit"
            disabled={pending}
            className="press-subtle rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
          >
            {pending ? "Unfreezing…" : "Unfreeze account"}
          </button>
        </form>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="press-subtle rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Freeze account
          </button>
          <Drawer
            isOpen={confirming}
            onClose={() => (pending ? undefined : setConfirming(false))}
            title="Freeze this account?"
          >
            <p className="text-sm text-zinc-600">
              This immediately blocks all deferred dispatch for this client. You can unfreeze it at any time.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={pending}
                className="press-subtle flex-1 rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <form action={action} className="flex-1">
                <button
                  type="submit"
                  disabled={pending}
                  className="press-subtle w-full rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {pending ? "Freezing…" : "Freeze account"}
                </button>
              </form>
            </div>
          </Drawer>
        </>
      )}
    </div>
  );
}
