"use client";

import { useActionState } from "react";
import {
  updateDeliveryDelayDurationsAction,
  type UpdateDeliveryDelayDurationsState,
} from "@/app/actions/settings";
import type { DeliveryDelayDurations, DelayUnit } from "@/lib/delivery/delivery-delay";

export function DeliveryDelayDurationsForm({ durations }: { durations: DeliveryDelayDurations }) {
  const [state, action, pending] = useActionState<UpdateDeliveryDelayDurationsState, FormData>(
    updateDeliveryDelayDurationsAction,
    {}
  );

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-zinc-900">Delivery delay durations</h2>
      <p className="mt-0.5 text-xs text-zinc-500">
        How long the Normal and Extended delivery-delay presets hold PBDR generation and final
        client delivery — in whole working days by default, or hours for finer control. Expedited
        is always immediate and isn&apos;t configurable. Set per-project on each project&apos;s
        detail page.
      </p>

      {state.errors?.form?.map((e) => (
        <p key={e} className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {e}
        </p>
      ))}

      {state.saved && (
        <p className="mt-4 text-sm font-medium text-green-700">Delivery delay durations updated.</p>
      )}

      <form action={action} className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DurationField
          label="Normal delay"
          valueName="normalValue"
          unitName="normalUnit"
          defaultValue={durations.normal.value}
          defaultUnit={durations.normal.unit}
          error={state.errors?.normalValue?.[0]}
        />

        <DurationField
          label="Extended delay"
          valueName="extendedValue"
          unitName="extendedUnit"
          defaultValue={durations.extended.value}
          defaultUnit={durations.extended.unit}
          error={state.errors?.extendedValue?.[0]}
        />

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

function DurationField({
  label,
  valueName,
  unitName,
  defaultValue,
  defaultUnit,
  error,
}: {
  label: string;
  valueName: string;
  unitName: string;
  defaultValue: number;
  defaultUnit: DelayUnit;
  error?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700">{label}</label>
      <div className="mt-1 flex gap-2">
        <input
          name={valueName}
          type="number"
          min={1}
          step={1}
          defaultValue={defaultValue}
          required
          className={input}
        />
        <select name={unitName} defaultValue={defaultUnit} className={input}>
          <option value="workingDays">Working days</option>
          <option value="hours">Hours</option>
        </select>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

const input =
  "block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500";
