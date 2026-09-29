"use client";

import { useActionState, useState } from "react";
import { Drawer } from "@/components/Drawer";
import {
  deleteUser,
  restoreUser,
  resetUserPassword,
  resendInvite,
  softDeleteUser,
  restoreDeletedUser,
  type DeleteUserState,
  type RestoreUserState,
  type ResetPasswordState,
  type ResendInviteState,
  type SoftDeleteUserState,
  type RestoreDeletedUserState,
} from "@/app/actions/admin-users";

type Props = {
  userId: string;
  userEmail: string;
  isActive: boolean;
  canDeactivate: boolean;
  isDeleted?: boolean;
  canDelete?: boolean;
  inviteFailed?: boolean;
};

export function UserHeaderActions({
  userId,
  userEmail,
  isActive,
  canDeactivate,
  isDeleted = false,
  canDelete = false,
  inviteFailed = false,
}: Props) {
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

  const boundResendInvite = resendInvite.bind(null, userId);
  const [resendState, resendAction, resendPending] = useActionState<ResendInviteState, FormData>(
    boundResendInvite,
    {}
  );

  const boundSoftDelete = softDeleteUser.bind(null, userId);
  const [softDeleteState, softDeleteAction, softDeletePending] = useActionState<
    SoftDeleteUserState,
    FormData
  >(boundSoftDelete, {});

  const boundRestoreDeleted = restoreDeletedUser.bind(null, userId);
  const [restoreDeletedState, restoreDeletedAction, restoreDeletedPending] = useActionState<
    RestoreDeletedUserState,
    FormData
  >(boundRestoreDeleted, {});

  const [showDeactivateOverlay, setShowDeactivateOverlay] = useState(false);
  const [showRestoreOverlay, setShowRestoreOverlay] = useState(false);
  const [showResetOverlay, setShowResetOverlay] = useState(false);
  const [showSoftDeleteOverlay, setShowSoftDeleteOverlay] = useState(false);

  if (isDeleted) {
    return (
      <form action={restoreDeletedAction} className="flex flex-wrap items-center gap-2 sm:shrink-0">
        {restoreDeletedState.error && (
          <p role="alert" className="text-xs text-red-600">{restoreDeletedState.error}</p>
        )}
        <button
          type="submit"
          disabled={restoreDeletedPending}
          className="press-subtle rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {restoreDeletedPending ? "Restoring…" : "Restore from recovery bin"}
        </button>
      </form>
    );
  }

  const BTN = "press-subtle rounded-md border bg-white px-3 py-1.5 text-xs font-medium disabled:opacity-50";

  return (
    <>
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">
        <form action={resendAction}>
          <button
            type="submit"
            disabled={resendPending}
            className={`${BTN} ${
              inviteFailed
                ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            {resendPending
              ? "Sending…"
              : resendState.success
              ? "Invite sent ✓"
              : inviteFailed
              ? "Resend invite (failed)"
              : "Resend invite"}
          </button>
          {resendState.error && (
            <p role="alert" className="mt-1 text-xs text-red-600">{resendState.error}</p>
          )}
        </form>

        <button
          type="button"
          onClick={() => setShowResetOverlay(true)}
          className={`${BTN} border-zinc-200 text-zinc-600 hover:bg-zinc-50`}
        >
          Reset password
        </button>

        {canDeactivate && (
          isActive ? (
            <button
              type="button"
              onClick={() => setShowDeactivateOverlay(true)}
              className={`${BTN} border-amber-300 text-amber-800 hover:bg-amber-50`}
            >
              Deactivate
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowRestoreOverlay(true)}
              className={`${BTN} border-zinc-200 text-zinc-600 hover:bg-zinc-50`}
            >
              Restore
            </button>
          )
        )}

        {canDelete && (
          <button
            type="button"
            onClick={() => setShowSoftDeleteOverlay(true)}
            className={`${BTN} border-red-300 text-red-700 hover:bg-red-50`}
          >
            Delete
          </button>
        )}
      </div>

      <Drawer
        isOpen={showSoftDeleteOverlay}
        onClose={() => setShowSoftDeleteOverlay(false)}
        title="Delete this account?"
      >
        <p className="text-sm text-zinc-600">
          <span className="font-medium text-zinc-900">{userEmail}</span> will be moved to the
          recovery bin and hidden from listings. This is separate from deactivation and can be
          undone.
        </p>
        {softDeleteState.error && <ErrorNote>{softDeleteState.error}</ErrorNote>}
        <ConfirmRow
          onCancel={() => setShowSoftDeleteOverlay(false)}
          action={softDeleteAction}
          pending={softDeletePending}
          label="Delete"
          pendingLabel="Deleting…"
          tone="danger"
        />
      </Drawer>

      <Drawer
        isOpen={showResetOverlay}
        onClose={() => setShowResetOverlay(false)}
        title="Reset password?"
      >
        {resetState.link ? (
          <div className="pane-in flex flex-col gap-2">
            <p className="text-sm text-zinc-600">Reset link generated.</p>
            <input
              readOnly
              aria-label="Reset link"
              value={resetState.link}
              className="w-full rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-700"
              onFocus={(e) => e.currentTarget.select()}
            />
            <p className="text-xs text-zinc-500">Copy and share this with the user.</p>
            <button
              type="button"
              onClick={() => setShowResetOverlay(false)}
              className="press-subtle mt-2 w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm text-zinc-600">
              Generate a one-time reset link for{" "}
              <span className="font-medium text-zinc-900">{userEmail}</span>.
            </p>
            {resetState.error && <ErrorNote>{resetState.error}</ErrorNote>}
            <ConfirmRow
              onCancel={() => setShowResetOverlay(false)}
              action={resetAction}
              pending={resetPending}
              label="Generate link"
              pendingLabel="Generating…"
              tone="primary"
            />
          </>
        )}
      </Drawer>

      <Drawer
        isOpen={showDeactivateOverlay}
        onClose={() => setShowDeactivateOverlay(false)}
        title="Deactivate account?"
      >
        <p className="text-sm text-zinc-600">
          <span className="font-medium text-zinc-900">{userEmail}</span> will be prevented from
          logging in. This can be reversed.
        </p>
        {deleteState.error && <ErrorNote>{deleteState.error}</ErrorNote>}
        <ConfirmRow
          onCancel={() => setShowDeactivateOverlay(false)}
          action={deleteAction}
          pending={deletePending}
          label="Deactivate"
          pendingLabel="Deactivating…"
          tone="warning"
        />
      </Drawer>

      <Drawer
        isOpen={showRestoreOverlay}
        onClose={() => setShowRestoreOverlay(false)}
        title="Restore account?"
      >
        <p className="text-sm text-zinc-600">
          <span className="font-medium text-zinc-900">{userEmail}</span> will be able to log in
          again.
        </p>
        {restoreState.error && <ErrorNote>{restoreState.error}</ErrorNote>}
        <ConfirmRow
          onCancel={() => setShowRestoreOverlay(false)}
          action={restoreAction}
          pending={restorePending}
          label="Restore account"
          pendingLabel="Restoring…"
          tone="primary"
        />
      </Drawer>
    </>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rise-in mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
      {children}
    </p>
  );
}

function ConfirmRow({
  onCancel,
  action,
  pending,
  label,
  pendingLabel,
  tone,
}: {
  onCancel: () => void;
  action: (formData: FormData) => void;
  pending: boolean;
  label: string;
  pendingLabel: string;
  tone: "danger" | "warning" | "primary";
}) {
  return (
    <div className="mt-5 flex gap-3">
      <button
        type="button"
        onClick={onCancel}
        className="press-subtle flex-1 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
      >
        Cancel
      </button>
      <form action={action} className="flex-1">
        <button
          type="submit"
          disabled={pending}
          className={`press-subtle w-full rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
            tone === "danger"
              ? "bg-red-600 hover:bg-red-700"
              : tone === "warning"
              ? "bg-amber-700 hover:bg-amber-800"
              : "bg-zinc-900 hover:bg-zinc-700"
          }`}
        >
          {pending ? pendingLabel : label}
        </button>
      </form>
    </div>
  );
}
