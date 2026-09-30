"use client";

import { useActionState, useState } from "react";

type KillSwitchState = { saved?: boolean; errors?: { form?: string[] } };

// A platform-wide on/off switch. The current saved state is always visible as
// a chip, and turning a switch OFF takes a second, explicit confirmation
// because it affects every client, not just this admin.
export function KillSwitchForm({
  title,
  description,
  enabled,
  checkboxLabel,
  offWarning,
  savedMessage,
  action: serverAction,
}: {
  title: string;
  description: string;
  enabled: boolean;
  checkboxLabel: string;
  offWarning: string;
  savedMessage: string;
  action: (prev: KillSwitchState, formData: FormData) => Promise<KillSwitchState>;
}) {
  const [state, action, pending] = useActionState<KillSwitchState, FormData>(serverAction, {});
  const [checked, setChecked] = useState(enabled);
  const [confirming, setConfirming] = useState(false);

  // Follow the saved value when a fresh one arrives after revalidation.
  const [prevEnabled, setPrevEnabled] = useState(enabled);
  if (enabled !== prevEnabled) {
    setPrevEnabled(enabled);
    setChecked(enabled);
    setConfirming(false);
  }

  const dirty = checked !== enabled;
  const turningOff = dirty && !checked;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
            enabled ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-800"
          }`}
        >
          {enabled ? "On" : "Off"}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-zinc-500">{description}</p>

      {state.errors?.form?.map((e) => (
        <p key={e} role="alert" className="rise-in mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {e}
        </p>
      ))}

      {state.saved && (
        <p role="status" className="rise-in mt-4 text-sm font-medium text-green-700">
          {savedMessage}
        </p>
      )}

      <form action={action} className="mt-5 flex flex-wrap items-center gap-3">
        <label className="flex min-h-10 items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            name="enabled"
            checked={checked}
            onChange={(e) => {
              setChecked(e.target.checked);
              setConfirming(false);
            }}
            className="h-4 w-4 rounded-sm border-zinc-300 text-zinc-900 focus:ring-zinc-500"
          />
          {checkboxLabel}
        </label>

        {turningOff && confirming ? (
          <div className="rise-in flex w-full flex-col gap-2 rounded-lg bg-amber-50 p-3">
            <p className="text-xs font-medium text-amber-800">{offWarning}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={pending}
                className="press rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors duration-150 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                className="press rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-amber-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 disabled:opacity-50"
              >
                {pending ? "Turning off…" : "Yes, turn off"}
              </button>
            </div>
          </div>
        ) : (
          <button
            type={turningOff ? "button" : "submit"}
            onClick={turningOff ? () => setConfirming(true) : undefined}
            disabled={pending || !dirty}
            className="press rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-50"
          >
            {pending ? "Saving…" : turningOff ? "Turn off…" : "Save changes"}
          </button>
        )}
      </form>
    </div>
  );
}
