"use client";

import type { OrgFormState } from "@/app/actions/organisations";
import type { Organisation } from "@/types";

const AU_STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];

type Props = {
  state: OrgFormState;
  defaults?: Partial<Organisation>;
};

export function OrgFormFields({ state, defaults }: Props) {
  return (
    <>
      <Field label="Organisation name" error={state.errors?.name}>
        <input
          name="name"
          type="text"
          defaultValue={defaults?.name ?? ""}
          required
          className={input()}
        />
      </Field>

      <Field label="Payment method" error={state.errors?.payment_method}>
        <select
          name="payment_method"
          defaultValue={defaults?.payment_method ?? "upfront"}
          className={input()}
        >
          <option value="upfront">Upfront</option>
          <option value="credit_deduction">Credit deduction</option>
          <option value="deferred">Deferred</option>
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="State / territory" error={state.errors?.state_territory}>
          <select
            name="state_territory"
            defaultValue={defaults?.state_territory ?? ""}
            className={input()}
          >
            <option value="">Select…</option>
            {AU_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Delivery working days"
          error={state.errors?.delivery_working_days}
        >
          <input
            name="delivery_working_days"
            type="number"
            min={1}
            max={30}
            defaultValue={defaults?.delivery_working_days ?? 5}
            className={input()}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Abandoned draft days"
          error={state.errors?.abandoned_draft_days}
        >
          <input
            name="abandoned_draft_days"
            type="number"
            min={1}
            max={90}
            defaultValue={defaults?.abandoned_draft_days ?? 14}
            className={input()}
          />
        </Field>

        <Field label="Credit limit (deferred)" error={state.errors?.credit_limit}>
          <input
            name="credit_limit"
            type="number"
            min={0}
            defaultValue={defaults?.credit_limit ?? 0}
            className={input()}
          />
        </Field>
      </div>

    </>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string[];
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-zinc-700">
        {label}
      </label>
      {children}
      {error?.map((e) => (
        <p key={e} className="mt-1 text-xs text-red-600">
          {e}
        </p>
      ))}
    </div>
  );
}

function input() {
  return "mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500";
}
