"use client";

import { useActionState, useState, useEffect, useRef } from "react";
import { Drawer } from "@/components/Drawer";
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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
      >
        + Create account
      </button>

      <Drawer
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Create account"
        subtitle="Account created immediately — a welcome email with a password-setup link is sent."
      >
        <form action={action} className="space-y-4">
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
      </Drawer>
    </>
  );
}
