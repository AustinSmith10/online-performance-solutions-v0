"use client";

import { useState, useTransition } from "react";
import { setProjectDeliveryDelayPreset } from "@/app/actions/projects";
import {
  formatDelayDuration,
  type DeliveryDelayDurations,
  type DeliveryDelayPreset,
} from "@/lib/delivery/delivery-delay";

const LABELS: Record<DeliveryDelayPreset, string> = {
  expedited: "Expedited (immediate)",
  normal: "Normal",
  extended: "Extended",
};

export function ProjectDeliveryDelayPresetSelect({
  projectId,
  initialValue,
  durations,
}: {
  projectId: string;
  initialValue: DeliveryDelayPreset;
  /** When provided, each option shows its actual configured duration inline
   *  (e.g. "Normal — 1 working day") instead of just the bare preset name. */
  durations?: DeliveryDelayDurations;
}) {
  const [preset, setPreset] = useState<DeliveryDelayPreset>(initialValue);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function optionLabel(value: DeliveryDelayPreset): string {
    if (!durations) return LABELS[value];
    if (value === "expedited") return "Expedited — sent immediately";
    return `${LABELS[value]} — ${formatDelayDuration(durations[value])} after approval`;
  }

  function handleChange(next: DeliveryDelayPreset) {
    const previous = preset;
    setPreset(next);
    startTransition(async () => {
      const result = await setProjectDeliveryDelayPreset(projectId, next);
      if (result.error) {
        setError(result.error);
        setPreset(previous);
      } else {
        setError(null);
      }
    });
  }

  return (
    <div className="space-y-2">
      <select
        value={preset}
        disabled={pending}
        onChange={(e) => handleChange(e.target.value as DeliveryDelayPreset)}
        className="block w-full max-w-xs rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50"
      >
        {(Object.keys(LABELS) as DeliveryDelayPreset[]).map((value) => (
          <option key={value} value={value}>
            {optionLabel(value)}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
