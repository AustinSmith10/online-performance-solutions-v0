"use client";

import { useActionState } from "react";
import {
  updateBusinessTimezoneAction,
  type UpdateBusinessTimezoneState,
} from "@/app/actions/settings";
import { AU_TIMEZONES, type AuTimezone } from "@/lib/settings/timezone";

export function BusinessTimezoneForm({ timeZone }: { timeZone: AuTimezone }) {
  const [state, action, pending] = useActionState<UpdateBusinessTimezoneState, FormData>(
    updateBusinessTimezoneAction,
    {}
  );

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-zinc-900">Timezone</h2>
      <p className="mt-0.5 text-xs text-zinc-500">
        The business timezone for the whole platform. Dates on generated documents and filenames,
        email dates, due dates, and the business-hours window all use this zone.
      </p>

      {state.errors?.form?.map((e) => (
        <p key={e} className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {e}
        </p>
      ))}

      {state.saved && (
        <p className="mt-4 text-sm font-medium text-green-700">Timezone updated.</p>
      )}

      <form action={action} className="mt-5 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 sm:max-w-xs">
          <label htmlFor="business-timezone" className="block text-sm font-medium text-zinc-700">
            Business timezone
          </label>
          <select
            id="business-timezone"
            name="timeZone"
            defaultValue={timeZone}
            className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          >
            {AU_TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
      </form>
    </div>
  );
}
