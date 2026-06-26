"use client";

import { useActionState, useState } from "react";
import {
  deleteUser,
  resetUserPassword,
  type DeleteUserState,
  type ResetPasswordState,
} from "@/app/actions/admin-users";
import type { User } from "@/types";

type Props = {
  user: Pick<User, "id" | "email" | "role">;
};

export function DangerZone({ user }: Props) {
  const boundDelete = deleteUser.bind(null, user.id);
  const [deleteState, deleteAction, deletePending] = useActionState<DeleteUserState, FormData>(
    boundDelete,
    {}
  );

  const boundReset = resetUserPassword.bind(null, user.id);
  const [resetState, resetAction, resetPending] = useActionState<ResetPasswordState, FormData>(
    boundReset,
    {}
  );

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-5 space-y-5">
      <h2 className="text-sm font-semibold text-red-800">Danger zone</h2>

      {/* Reset password */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <p className="text-sm font-medium text-zinc-900">Reset password</p>
          <p className="text-xs text-zinc-500 mt-0.5">
            Generates a one-time password reset link for this user.
          </p>
        </div>

        {resetState.link ? (
          <div className="flex flex-col gap-1 min-w-0 sm:items-end">
            <p className="text-xs text-green-700 font-medium">Reset link generated.</p>
            <input
              readOnly
              value={resetState.link}
              className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-xs font-mono text-zinc-700 truncate sm:w-72"
              onFocus={(e) => e.currentTarget.select()}
            />
            <p className="text-xs text-zinc-400">Copy and share this link with the user.</p>
          </div>
        ) : confirmingReset ? (
          <div className="flex flex-col gap-2 sm:items-end">
            <p className="text-xs font-medium text-zinc-700 sm:text-right">
              Send a password reset link to <span className="font-semibold">{user.email}</span>?
            </p>
            {resetState.error && (
              <p className="text-xs text-red-600">{resetState.error}</p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmingReset(false)}
                className="rounded border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <form action={resetAction}>
                <button
                  type="submit"
                  disabled={resetPending}
                  className="rounded border border-zinc-400 bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
                >
                  {resetPending ? "Generating…" : "Generate link"}
                </button>
              </form>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingReset(true)}
            className="self-start shrink-0 rounded border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Reset password
          </button>
        )}
      </div>

      <hr className="border-red-200" />

      {/* Delete account */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <p className="text-sm font-medium text-zinc-900">Delete account</p>
          <p className="text-xs text-zinc-500 mt-0.5">
            Permanently removes this account from the system. Cannot be undone.
          </p>
        </div>

        {confirmingDelete ? (
          <div className="flex flex-col gap-2 sm:items-end">
            <p className="text-xs font-medium text-red-700 sm:max-w-xs sm:text-right">
              This will permanently delete <span className="font-semibold">{user.email}</span> and
              all associated data. This cannot be undone.
            </p>
            {deleteState.error && (
              <p className="text-xs text-red-600 sm:max-w-xs sm:text-right">{deleteState.error}</p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="rounded border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <form action={deleteAction}>
                <button
                  type="submit"
                  disabled={deletePending}
                  className="rounded border border-red-300 bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {deletePending ? "Deleting…" : "Yes, delete account"}
                </button>
              </form>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="self-start shrink-0 rounded border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
          >
            Delete account
          </button>
        )}
      </div>
    </div>
  );
}
