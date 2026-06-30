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

type Props = {
  userId: string;
  userEmail: string;
  isActive: boolean;
  canDeactivate: boolean;
};

export function UserHeaderActions({ userId, userEmail, isActive, canDeactivate }: Props) {
  const boundDelete = deleteUser.bind(null, userId);
  const [deleteState, deleteAction, deletePending] = useActionState<DeleteUserState, FormData>(
    boundDelete,
    {}
  );

  const boundRestore = restoreUser.bind(null, userId);
  const [restoreState, restoreAction, restorePending] = useActionState<RestoreUserState, FormData>(
    boundRestore,
    {}
  );

  const boundReset = resetUserPassword.bind(null, userId);
  const [resetState, resetAction, resetPending] = useActionState<ResetPasswordState, FormData>(
    boundReset,
    {}
  );

  const [showDeactivateOverlay, setShowDeactivateOverlay] = useState(false);
  const [showRestoreOverlay, setShowRestoreOverlay] = useState(false);
  const [showResetOverlay, setShowResetOverlay] = useState(false);

  return (
    <>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => setShowResetOverlay(true)}
          className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
        >
          Reset password
        </button>

        {canDeactivate && (
          isActive ? (
            <button
              type="button"
              onClick={() => setShowDeactivateOverlay(true)}
              className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
            >
              Deactivate
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowRestoreOverlay(true)}
              className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
            >
              Restore
            </button>
          )
        )}
      </div>

      {/* Reset password overlay */}
      {showResetOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30">
          <div className="mx-4 w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-xl">
            <p className="text-base font-semibold text-zinc-900 text-center">Reset password?</p>
            {resetState.link ? (
              <div className="mt-4 flex flex-col gap-2">
                <p className="text-sm text-zinc-500 text-center">Reset link generated.</p>
                <input
                  readOnly
                  value={resetState.link}
                  className="w-full rounded border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs font-mono text-zinc-700"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <p className="text-xs text-zinc-400 text-center">Copy and share this with the user.</p>
                <button
                  type="button"
                  onClick={() => setShowResetOverlay(false)}
                  className="mt-2 w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                <p className="mt-2 text-sm text-zinc-500 text-center">
                  Generate a one-time reset link for{" "}
                  <span className="font-medium text-zinc-700">{userEmail}</span>.
                </p>
                {resetState.error && (
                  <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 text-center">
                    {resetState.error}
                  </p>
                )}
                <div className="mt-6 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowResetOverlay(false)}
                    className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    Cancel
                  </button>
                  <form action={resetAction} className="flex-1">
                    <button
                      type="submit"
                      disabled={resetPending}
                      className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
                    >
                      {resetPending ? "Generating…" : "Generate link"}
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Deactivate overlay */}
      {showDeactivateOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30">
          <div className="mx-4 w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-xl">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <svg className="h-6 w-6 text-red-600" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-base font-semibold text-zinc-900 text-center">Deactivate account?</p>
            <p className="mt-2 text-sm text-zinc-500 text-center">
              <span className="font-medium text-zinc-700">{userEmail}</span> will be prevented from
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
                onClick={() => setShowDeactivateOverlay(false)}
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
              <span className="font-medium text-zinc-700">{userEmail}</span> will be able to log in
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
    </>
  );
}
