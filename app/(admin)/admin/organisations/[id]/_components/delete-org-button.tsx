"use client";

import { useActionState, useState } from "react";
import { deleteOrganisation, type DeleteOrgState } from "@/app/actions/organisations";

interface Props {
  orgId: string;
  orgName: string;
  userCount: number;
}

export function DeleteOrgButton({ orgId, orgName, userCount }: Props) {
  const boundAction = deleteOrganisation.bind(null, orgId);
  const [state, action, pending] = useActionState<DeleteOrgState, FormData>(boundAction, {});
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="self-start shrink-0 rounded border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
      >
        Delete organisation
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 sm:items-end">
      <p className="text-xs font-medium text-red-700 sm:max-w-sm sm:text-right">
        This will permanently delete <span className="font-semibold">{orgName}</span>
        {userCount > 0 && (
          <>
            {" "}and disaffiliate{" "}
            <span className="font-semibold">
              {userCount} user{userCount === 1 ? "" : "s"}
            </span>{" "}
            (their accounts are kept but lose org membership)
          </>
        )}
        . This cannot be undone.
      </p>
      {state.error && (
        <p className="max-w-sm text-right text-xs text-red-600">{state.error}</p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
        >
          Cancel
        </button>
        <form action={action}>
          <button
            type="submit"
            disabled={pending}
            className="rounded border border-red-300 bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {pending ? "Deleting…" : "Yes, delete organisation"}
          </button>
        </form>
      </div>
    </div>
  );
}
