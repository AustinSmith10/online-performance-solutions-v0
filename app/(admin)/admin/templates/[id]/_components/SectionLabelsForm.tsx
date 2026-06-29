"use client";

import { useActionState } from "react";
import { updateSectionLabels } from "@/app/actions/templates";

interface Props {
  templateId: string;
  labels: {
    extract: string;
    extractDesc?: string;
    trusteeDesc?: string;
    org: string;
    orgDesc?: string;
    client: string;
    clientDesc?: string;
  };
}

export function SectionLabelsForm({ templateId, labels }: Props) {
  const action = updateSectionLabels.bind(null, templateId);
  const [state, formAction, pending] = useActionState(action, {});

  const sections = [
    {
      key: "extract",
      labelField: "label_extract",
      descField: "label_extract_desc",
      currentLabel: labels.extract,
      currentDesc: labels.extractDesc ?? "",
      title: "Extracted fields section",
      labelHint: "Shown above fields auto-extracted from uploaded documents",
      descHint: "Optional subtitle shown below the section heading",
    },
    {
      key: "trustee",
      labelField: null,
      descField: "label_trustee_desc",
      currentLabel: null,
      currentDesc: labels.trusteeDesc ?? "",
      title: "Trustee Entity section",
      labelHint: null,
      descHint: "Optional subtitle shown below the Trustee Entity heading (only visible when template has a trustee field)",
    },
    {
      key: "org",
      labelField: "label_org",
      descField: "label_org_desc",
      currentLabel: labels.org,
      currentDesc: labels.orgDesc ?? "",
      title: "Organisation fields section",
      labelHint: "Shown above fields pre-filled from organisation config",
      descHint: "Optional subtitle shown below the section heading",
    },
    {
      key: "client",
      labelField: "label_client",
      descField: "label_client_desc",
      currentLabel: labels.client,
      currentDesc: labels.clientDesc ?? "",
      title: "Client fields section",
      labelHint: "Shown above fields the client must fill in manually",
      descHint: "Optional subtitle shown below the section heading",
    },
  ];

  return (
    <form action={formAction} className="space-y-6">
      {sections.map(({ key, labelField, descField, currentLabel, currentDesc, title, labelHint, descHint }) => (
        <div key={key} className="space-y-3">
          <p className="text-xs font-semibold text-zinc-700">{title}</p>
          {labelField && currentLabel !== null && (
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">Heading</label>
              <input
                type="text"
                name={labelField}
                defaultValue={currentLabel}
                placeholder={currentLabel}
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400"
              />
              {labelHint && <p className="mt-0.5 text-xs text-zinc-400">{labelHint}</p>}
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700">Subtitle</label>
            <input
              type="text"
              name={descField}
              defaultValue={currentDesc}
              placeholder="Add a short description for this section…"
              className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400"
            />
            <p className="mt-0.5 text-xs text-zinc-400">{descHint}</p>
          </div>
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
