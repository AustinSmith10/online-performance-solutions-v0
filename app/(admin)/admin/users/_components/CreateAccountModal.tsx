"use client";

import { useActionState, useState, useEffect, useRef } from "react";
import { createUserAccount, type CreateAccountState } from "@/app/actions/admin-users";
import type { Client } from "@/types";

export function CreateAccountModal({
  orgs,
  callerRole,
}: {
  orgs: Pick<Client, "id" | "name">[];
  callerRole: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<CreateAccountState, FormData>(
    createUserAccount,
    {}
  );

  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => firstFieldRef.current?.focus(), 50);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
      >
        + Create account
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="mx-4 w-full max-w-md rounded-xl border border-zinc-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
              <div>
                <h2 className="text-base font-semibold text-zinc-900">Create account</h2>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Account created immediately — a welcome email with a password-setup link is sent.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="ml-4 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                aria-label="Close"
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>

            <form action={action} className="space-y-4 p-6">
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">Email address</label>
                <input
                  ref={firstFieldRef}
                  name="email"
                  type="email"
                  required
                  className="block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                />
                {state.errors?.email?.map((e) => (
                  <p key={e} className="mt-1 text-xs text-red-600">{e}</p>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700">First name</label>
                  <input
                    name="first_name"
                    type="text"
                    required
                    className="block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                  />
                  {state.errors?.first_name?.map((e) => (
                    <p key={e} className="mt-1 text-xs text-red-600">{e}</p>
                  ))}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700">Last name</label>
                  <input
                    name="last_name"
                    type="text"
                    required
                    className="block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                  />
                  {state.errors?.last_name?.map((e) => (
                    <p key={e} className="mt-1 text-xs text-red-600">{e}</p>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">Role</label>
                <select
                  name="role"
                  defaultValue="stakeholder"
                  className="block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                >
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
                  Client <span className="text-zinc-400">(required for stakeholder)</span>
                </label>
                <select
                  name="client_id"
                  defaultValue=""
                  className="block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                >
                  <option value="">None</option>
                  {orgs.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
                {state.errors?.client_id?.map((e) => (
                  <p key={e} className="mt-1 text-xs text-red-600">{e}</p>
                ))}
              </div>

              {state.errors?.form?.map((e) => (
                <p key={e} className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{e}</p>
              ))}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
                >
                  {pending ? "Creating…" : "Create account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
