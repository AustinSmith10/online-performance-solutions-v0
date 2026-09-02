"use client";

import { useState, type ChangeEvent } from "react";
import { validateProjectNumber } from "@/lib/projects/project-number";

/**
 * Shared client-side behaviour for every "set project number" input (admin
 * project page, admin dashboard drawer, consultant step + card). Tracks the
 * value and surfaces `showError` so the field can highlight red when the
 * entry isn't the required `^\d{6}$` format (legacy numbers excepted, matching
 * the server validator).
 *
 * Red shows once the user has interacted — blurred the field or attempted a
 * save — or straight away if the last save came back with an error. It clears
 * as soon as the value becomes a valid format again.
 */
export function useProjectNumberField(initial = "", serverError?: string | null) {
  const [value, setValue] = useState(initial);
  const [interacted, setInteracted] = useState(false);

  const invalidFormat = value.trim() !== "" && !validateProjectNumber(value).ok;
  const showError = invalidFormat && (interacted || !!serverError);

  return {
    value,
    setValue,
    showError,
    /** Call from the form's onSubmit so a blocked/failed save turns the field red. */
    markSubmitted: () => setInteracted(true),
    /** Spread onto the <input>; merge your own className / name / pattern etc. */
    inputProps: {
      value,
      onChange: (e: ChangeEvent<HTMLInputElement>) => setValue(e.target.value),
      onBlur: () => setInteracted(true),
      // Fires when a Save attempt is blocked by the `pattern` / `required`
      // constraint (the form's onSubmit doesn't run in that case).
      onInvalid: () => setInteracted(true),
      "aria-invalid": showError || undefined,
    },
  };
}

/** Border/ring classes for the input, red when `showError`. */
export function projectNumberInputClass(showError: boolean, extra = ""): string {
  const base =
    "block w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 disabled:opacity-50";
  const tone = showError
    ? "border-red-400 focus:border-red-500 focus:ring-red-500"
    : "border-zinc-300 focus:border-zinc-500 focus:ring-zinc-500";
  return `${base} ${tone} ${extra}`.trim();
}
