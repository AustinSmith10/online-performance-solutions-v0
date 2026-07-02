"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useActionState } from "react";
import { createUserAccount, type CreateAccountState } from "@/app/actions/admin-users";

const input =
  "mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500";

interface Props {
  orgId: string;
  orgName: string;
  callerRole: string;
}

export function OrgCreateAccountModal({ orgId, orgName, callerRole }: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [state, action, pending] = useActionState<CreateAccountState, FormData>(
    createUserAccount,
    {}
  );

  useEffect(() => { queueMicrotask(() => setMounted(true)); }, []);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open]);

  const modal = (
    <>
      <div
        onClick={() => setOpen(false)}
        aria-hidden="true"
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        style={{ opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none", transition: "opacity 200ms" }}
      />
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ pointerEvents: open ? "auto" : "none" }}
        aria-modal="true"
        role="dialog"
      >
        <div
          className="w-full max-w-md rounded-xl border border-zinc-200 bg-white shadow-xl"
          style={{
            transform: open ? "scale(1)" : "scale(0.97)",
            opacity: open ? 1 : 0,
            transition: "transform 200ms, opacity 200ms",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between border-b border-zinc-100 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">Create account</h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                A welcome email with a password-setup link will be sent to the user.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="ml-3 shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
            >
              ✕
            </button>
          </div>

          <div className="p-5">
            <form action={action} className="space-y-4">
              {/* client_id hidden — pre-filled to this org */}
              <input type="hidden" name="client_id" value={orgId} />

              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">Email address</label>
                <input name="email" type="email" required autoFocus className={input} />
                {state.errors?.email?.map((e) => (
                  <p key={e} className="mt-1 text-xs text-red-600">{e}</p>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700">First name</label>
                  <input name="first_name" type="text" required className={input} />
                  {state.errors?.first_name?.map((e) => (
                    <p key={e} className="mt-1 text-xs text-red-600">{e}</p>
                  ))}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700">Last name</label>
                  <input name="last_name" type="text" required className={input} />
                  {state.errors?.last_name?.map((e) => (
                    <p key={e} className="mt-1 text-xs text-red-600">{e}</p>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">Role</label>
                <select name="role" defaultValue="stakeholder" className={input}>
                  <option value="stakeholder">Stakeholder</option>
                  <option value="consultant">Consultant</option>
                  {callerRole === "super_admin" && <option value="admin">Admin</option>}
                </select>
                {state.errors?.role?.map((e) => (
                  <p key={e} className="mt-1 text-xs text-red-600">{e}</p>
                ))}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">
                  Client
                </label>
                <select name="client_id_display" disabled className={`${input} opacity-60`}>
                  <option>{orgName}</option>
                </select>
                <p className="mt-1 text-xs text-zinc-400">Pre-set to current organisation</p>
              </div>

              {state.errors?.form?.map((e) => (
                <p key={e} className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{e}</p>
              ))}

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
                >
                  {pending ? "Creating…" : "Create account"}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-green-200 bg-white px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50"
      >
        Create account
      </button>
      {mounted && createPortal(modal, document.body)}
    </>
  );
}
