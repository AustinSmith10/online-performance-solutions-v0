"use client";

import { useActionState, useState } from "react";
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
        className="self-start shrink-0 rounded border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
      >
        Delete organisation
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30">
          <div className="mx-4 w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-xl">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <svg className="h-6 w-6 text-red-600" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
            </div>

            <p className="text-base font-semibold text-zinc-900 text-center">
              Delete {orgName}?
            </p>
            <p className="mt-2 text-sm text-zinc-500 text-center">
              This can be undone from the recovery bin.
            </p>

            <ul className="mt-3 space-y-1 text-sm text-zinc-600">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-red-400">•</span>
                All in-progress projects will be deleted alongside the client (completed/delivered ones are kept)
              </li>
              {userCount > 0 && (
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-red-400">•</span>
                  {userCount} user account{userCount === 1 ? "" : "s"} will remain — only the client record is deleted
                </li>
              )}
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-red-400">•</span>
                Templates and stakeholders will be deleted, and restored together if you undo this
              </li>
            </ul>

            {state.error && (
              <p className="mt-3 text-sm text-red-600 text-center">{state.error}</p>
            )}

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <form action={action} className="flex-1">
                <button
                  type="submit"
                  disabled={pending}
                  className="w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {pending ? "Deleting…" : "Yes, delete"}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
