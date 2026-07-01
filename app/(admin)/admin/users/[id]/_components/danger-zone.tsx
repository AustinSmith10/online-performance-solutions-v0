"use client";

import { useActionState, useState } from "react";
import {
  deleteUser,
  restoreUser,
  resetUserPassword,
  type DeleteUserState,
  type RestoreUserState,
  type ResetPasswordState,
} from "@/app/actions/admin-users";
import type { User } from "@/types";

type Props = {
  user: Pick<User, "id" | "email" | "role" | "is_active">;
};

export function DangerZone({ user }: Props) {
  const boundDelete = deleteUser.bind(null, user.id);
  const [deleteState, deleteAction, deletePending] = useActionState<DeleteUserState, FormData>(
    boundDelete,
    {}
  );

  const boundRestore = restoreUser.bind(null, user.id);
  const [restoreState, restoreAction, restorePending] = useActionState<RestoreUserState, FormData>(
    boundRestore,
    {}
  );

  const boundReset = resetUserPassword.bind(null, user.id);
  const [resetState, resetAction, resetPending] = useActionState<ResetPasswordState, FormData>(
    boundReset,
    {}
  );

  const [showDeleteOverlay, setShowDeleteOverlay] = useState(false);
  const [showRestoreOverlay, setShowRestoreOverlay] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-5 space-y-5">
      <h2 className="text-sm font-semibold text-red-800">Delete</h2>

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

      {/* Deactivate / restore account */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          {user.is_active ? (
            <>
              <p className="text-sm font-medium text-zinc-900">Deactivate account</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                Prevents this user from logging in. Can be restored at any time.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-zinc-900">Restore account</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                This account is deactivated. Restoring will allow the user to log in again.
              </p>
            </>
          )}
        </div>

        {user.is_active ? (
          <button
            type="button"
            onClick={() => setShowDeleteOverlay(true)}
            className="self-start shrink-0 rounded border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
          >
            Deactivate account
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setShowRestoreOverlay(true)}
            className="self-start shrink-0 rounded border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Restore account
          </button>
        )}
      </div>

      {/* Deactivate overlay */}
      {showDeleteOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30">
          <div className="mx-4 w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-xl">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <svg className="h-6 w-6 text-red-600" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-base font-semibold text-zinc-900 text-center">Deactivate account?</p>
            <p className="mt-2 text-sm text-zinc-500 text-center">
              <span className="font-medium text-zinc-700">{user.email}</span> will be prevented from
              logging in. This can be reversed.
            </p>
            {deleteState.error && (
              <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 text-center">
                {deleteState.error}
              </p>
            )}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteOverlay(false)}
                className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <form action={deleteAction} className="flex-1">
                <button
                  type="submit"
                  disabled={deletePending}
                  className="w-full rounded-lg border border-red-300 bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {deletePending ? "Deactivating…" : "Deactivate"}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Restore overlay */}
      {showRestoreOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30">
          <div className="mx-4 w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-xl">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <svg className="h-6 w-6 text-green-600" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-base font-semibold text-zinc-900 text-center">Restore account?</p>
            <p className="mt-2 text-sm text-zinc-500 text-center">
              <span className="font-medium text-zinc-700">{user.email}</span> will be able to log in
              again.
            </p>
            {restoreState.error && (
              <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 text-center">
                {restoreState.error}
              </p>
            )}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowRestoreOverlay(false)}
                className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <form action={restoreAction} className="flex-1">
                <button
                  type="submit"
                  disabled={restorePending}
                  className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
                >
                  {restorePending ? "Restoring…" : "Restore account"}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
