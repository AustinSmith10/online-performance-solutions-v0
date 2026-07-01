"use client";

import { useActionState } from "react";
import { createUserAccount, type CreateAccountState } from "@/app/actions/admin-users";
import type { Client } from "@/types";

export function InviteUserForm({
  orgs,
  preselectedOrgId,
  callerRole,
}: {
  orgs: Pick<Client, "id" | "name">[];
  preselectedOrgId?: string;
  callerRole: string;
}) {
  const [state, action, pending] = useActionState<CreateAccountState, FormData>(
    createUserAccount,
    {}
  );

  return (
    <form action={action} className="space-y-5">
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">
          Email address
        </label>
        <input
          name="email"
          type="email"
          required
          autoFocus
          className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
        />
        {state.errors?.email?.map((e) => (
          <p key={e} className="mt-1 text-xs text-red-600">{e}</p>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            First name
          </label>
          <input
            name="first_name"
            type="text"
            required
            className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          />
          {state.errors?.first_name?.map((e) => (
            <p key={e} className="mt-1 text-xs text-red-600">{e}</p>
          ))}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            Last name
          </label>
          <input
            name="last_name"
            type="text"
            required
            className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          />
          {state.errors?.last_name?.map((e) => (
            <p key={e} className="mt-1 text-xs text-red-600">{e}</p>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">
          Role
        </label>
        <select
          name="role"
          defaultValue="stakeholder"
          className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
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
          defaultValue={preselectedOrgId ?? ""}
          className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
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
        <p key={e} className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {e}
        </p>
      ))}

      <div className="pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {pending ? "Creating account…" : "Create account"}
        </button>
      </div>
    </form>
  );
}
