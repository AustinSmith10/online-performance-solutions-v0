"use client";

import { useActionState } from "react";
import {
  updateAdminNavRestrictionsAction,
  type UpdateAdminNavRestrictionsState,
} from "@/app/actions/settings";
import { RESTRICTABLE_NAV_ITEMS, type AdminNavKey } from "@/lib/settings/admin-nav-restrictions";

export function AdminNavRestrictionsForm({ restricted }: { restricted: AdminNavKey[] }) {
  const [state, action, pending] = useActionState<UpdateAdminNavRestrictionsState, FormData>(
    updateAdminNavRestrictionsAction,
    {}
  );

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-zinc-900">Admin nav visibility</h2>
      <p className="mt-0.5 text-xs text-zinc-500">
        Check an item to hide it from plain admins — it stays visible to super admins. Dashboard
        is always visible to everyone.
      </p>

      {state.errors?.form?.map((e) => (
        <p key={e} className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {e}
        </p>
      ))}

      {state.saved && (
        <p className="mt-4 text-sm font-medium text-green-700">Nav visibility updated.</p>
      )}

      <form action={action} className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {RESTRICTABLE_NAV_ITEMS.map((item) => (
          <label key={item.key} className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              name="restricted"
              value={item.key}
              defaultChecked={restricted.includes(item.key)}
              className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
            />
            {item.label}
          </label>
        ))}

        <div className="sm:col-span-2 mt-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
