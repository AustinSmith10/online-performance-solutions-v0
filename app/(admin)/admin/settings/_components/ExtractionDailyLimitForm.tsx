"use client";

import { useActionState } from "react";
import {
  updateExtractionDailyLimitAction,
  type UpdateExtractionDailyLimitState,
} from "@/app/actions/settings";

export function ExtractionDailyLimitForm({ limit }: { limit: number }) {
  const [state, action, pending] = useActionState<UpdateExtractionDailyLimitState, FormData>(
    updateExtractionDailyLimitAction,
    {}
  );

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-zinc-900">AI extraction budget</h2>
      <p className="mt-0.5 text-xs text-zinc-500">
        Maximum number of AI document extractions a single user can trigger in a rolling 24-hour
        window. Bounds spend from a compromised or careless account — raise this if legitimate
        users are hitting the limit during normal use.
      </p>

      {state.errors?.form?.map((e) => (
        <p key={e} className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {e}
        </p>
      ))}

      {state.saved && (
        <p className="mt-4 text-sm font-medium text-green-700">Extraction budget updated.</p>
      )}

      <form action={action} className="mt-5 flex items-end gap-4">
        <div>
          <label className="block text-sm font-medium text-zinc-700">Extractions per user / 24h</label>
          <input
            name="limit"
            type="number"
            min={1}
            step={1}
            defaultValue={limit}
            required
            className="mt-1 block w-40 rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          />
          {state.errors?.limit && <p className="mt-1 text-xs text-red-600">{state.errors.limit[0]}</p>}
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
