"use client";

import { useState, useTransition } from "react";
import {
  setProjectDeliveryDelayPreset,
  setProjectPbdbDeliveryDelayPreset,
} from "@/app/actions/projects";
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
  docType = "pbdr",
  projectedSendDate,
}: {
  projectId: string;
  initialValue: DeliveryDelayPreset;
  /** When provided, each option shows its actual configured duration inline
   *  (e.g. "Normal — 1 working day") instead of just the bare preset name. */
  durations?: DeliveryDelayDurations;
  /** Which doc type's independent delay preset this controls (#110). Defaults
   *  to "pbdr" for existing callers (the final-report delivery-delay setting). */
  docType?: "pbdb" | "pbdr";
  /** ISO date-time this doc would actually be sent if triggered now with the
   *  currently-saved preset (#176). Shown as a caption so the send date is
   *  never confused with the project's contractual due date. Recomputed
   *  server-side on save, so it reflects `initialValue`, not the local draft. */
  projectedSendDate?: string;
}) {
  const [saved, setSaved] = useState<DeliveryDelayPreset>(initialValue);
  const [draft, setDraft] = useState<DeliveryDelayPreset>(initialValue);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  function optionLabel(value: DeliveryDelayPreset): string {
    if (!durations) return LABELS[value];
    if (value === "expedited") return "Expedited — sent immediately";
    const trigger = docType === "pbdb" ? "after QA complete" : "after approval";
    return `${LABELS[value]} — ${formatDelayDuration(durations[value])} ${trigger}`;
  }

  function handleSave() {
    setJustSaved(false);
    startTransition(async () => {
      const setPreset = docType === "pbdb" ? setProjectPbdbDeliveryDelayPreset : setProjectDeliveryDelayPreset;
      const result = await setPreset(projectId, draft);
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
      {projectedSendDate && (
        <p className="text-xs text-zinc-500">
          {dirty && "Saved setting: "}Sends on{" "}
          <span className="font-medium text-zinc-700">
            {new Date(projectedSendDate).toLocaleDateString("en-AU", {
              weekday: "short",
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </span>
          , this is the date the{" "}
          {docType === "pbdb" ? "PBDB is sent for review" : "PBDR is sent to the client"}.
        </p>
      )}
    </div>
  );
}
