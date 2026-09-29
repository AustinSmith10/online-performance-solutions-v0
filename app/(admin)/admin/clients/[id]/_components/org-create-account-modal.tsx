"use client";

import { useState, useActionState } from "react";
import { Drawer } from "@/components/Drawer";
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
  const [state, action, pending] = useActionState<CreateAccountState, FormData>(
    createUserAccount,
    {}
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="press-subtle rounded-md border border-green-200 bg-white px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50"
      >
        Create account
      </button>
      <Drawer
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Create account"
        subtitle="A welcome email with a password-setup link will be sent to the user."
      >
        <form action={action} className="space-y-4">
          {/* client_id hidden — pre-filled to this org */}
          <input type="hidden" name="client_id" value={orgId} />

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">Email address</label>
            <input name="email" type="email" required className={input} />
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
            <p className="mt-1 text-xs text-zinc-500">Pre-set to this client</p>
          </div>

          {state.errors?.form?.map((e) => (
            <p key={e} className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{e}</p>
          ))}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={pending}
              className="press-subtle rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {pending ? "Creating…" : "Create account"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="press-subtle rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </Drawer>
    </>
  );
}
