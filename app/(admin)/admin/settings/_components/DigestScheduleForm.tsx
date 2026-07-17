"use client";

import { useActionState } from "react";
import {
  updateDigestScheduleAction,
  type UpdateDigestScheduleState,
} from "@/app/actions/settings";
import type { DigestSchedule } from "@/lib/settings/digest-schedule";

export function DigestScheduleForm({ schedule }: { schedule: DigestSchedule }) {
  const [state, action, pending] = useActionState<UpdateDigestScheduleState, FormData>(
    updateDigestScheduleAction,
    {}
  );

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-zinc-900">Available requests digest</h2>
      <p className="mt-0.5 text-xs text-zinc-500">
        Send times for the twice-daily digest emailed to consultants and admins when there are
        available requests to pick up.
      </p>

      {state.errors?.form?.map((e) => (
        <p key={e} className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {e}
        </p>
      ))}

      {state.saved && (
        <p className="mt-4 text-sm font-medium text-green-700">Schedule updated.</p>
      )}

      <form action={action} className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Morning send time" error={state.errors?.morning?.[0]}>
          <input
            name="morning"
            type="time"
            defaultValue={schedule.morning}
            required
            className={input}
          />
        </Field>

        <Field label="Afternoon send time" error={state.errors?.afternoon?.[0]}>
          <input
            name="afternoon"
            type="time"
            defaultValue={schedule.afternoon}
            required
            className={input}
          />
        </Field>

        <div className="sm:col-span-2">
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

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700">{label}</label>
      <div className="mt-1">{children}</div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

const input =
  "block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500";
