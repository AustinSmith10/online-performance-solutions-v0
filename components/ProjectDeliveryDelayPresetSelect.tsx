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
  const [saved, setSaved] = useState<DeliveryDelayPreset>(initialValue);
  const [draft, setDraft] = useState<DeliveryDelayPreset>(initialValue);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  function optionLabel(value: DeliveryDelayPreset): string {
    if (!durations) return LABELS[value];
    if (value === "expedited") return "Expedited — sent immediately";
    return `${LABELS[value]} — ${formatDelayDuration(durations[value])} after approval`;
  }

  function handleSave() {
    setJustSaved(false);
    startTransition(async () => {
      const result = await setProjectDeliveryDelayPreset(projectId, draft);
      if (result.error) {
        setError(result.error);
      } else {
        setError(null);
        setSaved(draft);
        setJustSaved(true);
      }
    });
  }

  const dirty = draft !== saved;

  return (
    <div className="space-y-2">
      <select
        value={draft}
        disabled={pending}
        onChange={(e) => {
          setDraft(e.target.value as DeliveryDelayPreset);
          setJustSaved(false);
        }}
        className="block w-full max-w-xs rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50"
      >
        {(Object.keys(LABELS) as DeliveryDelayPreset[]).map((value) => (
          <option key={value} value={value}>
            {optionLabel(value)}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={pending || !dirty}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {!dirty && justSaved && <span className="text-xs text-green-700">Saved ✓</span>}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
