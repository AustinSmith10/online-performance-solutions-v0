"use client";

import { useActionState } from "react";
import { updateSectionLabels } from "@/app/actions/templates";

interface Props {
  templateId: string;
  labels: { extract: string; org: string; client: string };
}

export function SectionLabelsForm({ templateId, labels }: Props) {
  const action = updateSectionLabels.bind(null, templateId);
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-4">
      {[
        { key: "extract", field: "label_extract", current: labels.extract, hint: "Shown above fields auto-extracted from uploaded documents" },
        { key: "org",     field: "label_org",     current: labels.org,     hint: "Shown above fields pre-filled from organisation config" },
        { key: "client",  field: "label_client",  current: labels.client,  hint: "Shown above fields the client must fill in manually" },
      ].map(({ key, field, current, hint }) => (
        <div key={key}>
          <label className="mb-1 block text-xs font-medium text-zinc-700">
            {key === "extract" ? "Extracted fields section" : key === "org" ? "Organisation fields section" : "Client fields section"}
          </label>
          <input
            type="text"
            name={field}
            defaultValue={current}
            placeholder={current}
            className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400"
          />
          <p className="mt-0.5 text-xs text-zinc-400">{hint}</p>
        </div>
      ))}

      {state.error && (
        <p className="text-xs text-red-600">{state.error}</p>
      )}
      {state.success && (
        <p className="text-xs text-green-600">Section labels saved.</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save labels"}
      </button>
    </form>
  );
}
