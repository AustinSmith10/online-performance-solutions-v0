"use client";

import { useActionState, useState } from "react";
import { Drawer } from "@/components/Drawer";
import { deleteClient, type DeleteClientState } from "@/app/actions/clients";

interface Props {
  orgId: string;
  orgName: string;
  userCount: number;
}

export function DeleteOrgButton({ orgId, orgName, userCount }: Props) {
  const boundAction = deleteClient.bind(null, orgId);
  const [state, action, pending] = useActionState<DeleteClientState, FormData>(boundAction, {});
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="press-subtle self-start shrink-0 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition-colors duration-150 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
      >
        Delete client
      </button>

      <Drawer
        isOpen={open}
        onClose={() => (pending ? undefined : setOpen(false))}
        title={`Delete ${orgName}?`}
        subtitle="This can be undone from the recovery bin."
      >
        <ul className="space-y-1.5 text-sm text-zinc-600">
          <li className="flex items-start gap-2">
            <span aria-hidden="true" className="mt-0.5 text-red-500">•</span>
            All in-progress projects will be deleted alongside the client (completed/delivered ones are kept)
          </li>
          {userCount > 0 && (
            <li className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-0.5 text-red-500">•</span>
              {userCount} user account{userCount === 1 ? "" : "s"} will remain — only the client record is deleted
            </li>
          )}
          <li className="flex items-start gap-2">
            <span aria-hidden="true" className="mt-0.5 text-red-500">•</span>
            Templates and stakeholders will be deleted, and restored together if you undo this
          </li>
        </ul>

        {state.error && (
          <p role="alert" className="mt-3 text-sm text-red-600">{state.error}</p>
        )}

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={pending}
            className="press-subtle flex-1 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors duration-150 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-50"
          >
            Cancel
          </button>
          <form action={action} className="flex-1">
            <button
              type="submit"
              disabled={pending}
              className="press-subtle w-full rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:opacity-50"
            >
              {pending ? "Deleting…" : "Yes, delete"}
            </button>
          </form>
        </div>
      </Drawer>
    </>
  );
}
