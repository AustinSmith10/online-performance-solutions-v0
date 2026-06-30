"use client";

import { useActionState, useState, useTransition, useEffect } from "react";
import {
  updateSectionLabels,
  updateSingleSectionLabel,
} from "@/app/actions/templates";
import { useUnsavedChanges } from "@/components/UnsavedChangesProvider";

interface Props {
  templateId: string;
  isActivated?: boolean;
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

const SECTIONS = [
  {
    key: "extract",
    title: "Extracted fields section",
    badgeLabel: "Extracted",
    badgeStyle: { background: "#E6F1FB", color: "#0C447C" },
    borderColor: "#378ADD",
    labelField: "label_extract" as const,
    descField: "label_extract_desc" as const,
    labelHint: "Shown above fields auto-extracted from uploaded documents.",
    descHint: "Optional — appears below the heading in smaller text.",
    fixedHeading: false,
    fixedNote: null,
  },
  {
    key: "trustee",
    title: "Trustee Entity section",
    badgeLabel: "System",
    badgeStyle: { background: "#F1EFE8", color: "#444441" },
    borderColor: "#888780",
    labelField: null,
    descField: "label_trustee_desc" as const,
    labelHint: null,
    descHint: "Optional — appears below the heading in smaller text.",
    fixedHeading: true,
    fixedNote: "Heading is fixed. This section only appears when the template includes a trustee field.",
  },
  {
    key: "org",
    title: "Organisation fields section",
    badgeLabel: "Org config",
    badgeStyle: { background: "#EEEDFE", color: "#3C3489" },
    borderColor: "#7F77DD",
    labelField: "label_org" as const,
    descField: "label_org_desc" as const,
    labelHint: "Shown above fields pre-filled from organisation config.",
    descHint: "Optional — appears below the heading in smaller text.",
    fixedHeading: false,
    fixedNote: null,
  },
  {
    key: "client",
    title: "Client fields section",
    badgeLabel: "Client input",
    badgeStyle: { background: "#EAF3DE", color: "#27500A" },
    borderColor: "#1D9E75",
    labelField: "label_client" as const,
    descField: "label_client_desc" as const,
    labelHint: "Shown above fields the client must fill in manually.",
    descHint: "Optional — appears below the heading in smaller text.",
    fixedHeading: false,
    fixedNote: null,
  },
] as const;

type DescField = "label_extract_desc" | "label_trustee_desc" | "label_org_desc" | "label_client_desc";
type LabelField = "label_extract" | "label_org" | "label_client";

function getLabelValue(labels: Props["labels"], field: LabelField | null): string {
  if (!field) return "";
  const map: Record<LabelField, string> = {
    label_extract: labels.extract,
    label_org: labels.org,
    label_client: labels.client,
  };
  return map[field] ?? "";
}

function getDescValue(labels: Props["labels"], field: DescField): string {
  const map: Record<DescField, string> = {
    label_extract_desc: labels.extractDesc ?? "",
    label_trustee_desc: labels.trusteeDesc ?? "",
    label_org_desc: labels.orgDesc ?? "",
    label_client_desc: labels.clientDesc ?? "",
  };
  return map[field] ?? "";
}

export function SectionLabelsForm({ templateId, labels, isActivated = false }: Props) {
  if (isActivated) {
    return <ActivatedSectionLabels templateId={templateId} labels={labels} />;
  }
  return <DraftSectionLabels templateId={templateId} labels={labels} />;
}

// ---------------------------------------------------------------------------
// Draft mode — all editable at once, single save button
// ---------------------------------------------------------------------------

function DraftSectionLabels({ templateId, labels }: Omit<Props, "isActivated">) {
  const action = updateSectionLabels.bind(null, templateId);
  const [state, formAction, pending] = useActionState(action, {});

  const [isDirty, setIsDirty] = useState(false);
  useUnsavedChanges("sections-draft", isDirty);
  useEffect(() => { if (state.success) queueMicrotask(() => setIsDirty(false)); }, [state.success]);

  return (
    <form action={formAction} className="space-y-3" onInput={() => setIsDirty(true)}>
      {SECTIONS.map((section) => (
        <div
          key={section.key}
          className="overflow-hidden rounded-lg border border-zinc-200 bg-white"
          style={{ borderLeft: `3px solid ${section.borderColor}` }}
        >
          <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50 px-4 py-3">
            <p className="text-xs font-medium text-zinc-800">{section.title}</p>
            <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={section.badgeStyle}>
              {section.badgeLabel}
            </span>
          </div>

          <div className={`p-4 ${section.fixedHeading ? "" : "grid grid-cols-2 gap-4"}`}>
            {!section.fixedHeading && section.labelField && (
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">Heading</label>
                <textarea
                  name={section.labelField}
                  defaultValue={getLabelValue(labels, section.labelField)}
                  rows={2}
                  className="w-full resize-none rounded border border-zinc-200 px-2 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                />
                {section.labelHint && (
                  <p className="mt-1 text-xs text-zinc-400">{section.labelHint}</p>
                )}
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Subtitle</label>
              <textarea
                name={section.descField}
                defaultValue={getDescValue(labels, section.descField)}
                rows={2}
                placeholder="Add a short description…"
                className="w-full resize-none rounded border border-zinc-200 px-2 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              />
              <p className="mt-1 text-xs text-zinc-400">{section.descHint}</p>
              {section.fixedNote && (
                <p className="mt-1 text-xs text-zinc-400">{section.fixedNote}</p>
              )}
            </div>
          </div>
        </div>
      ))}

      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
      {state.success && <p className="text-xs text-green-600">Section labels saved.</p>}

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

// ---------------------------------------------------------------------------
// Activated mode — per-card edit
// ---------------------------------------------------------------------------

function ActivatedSectionLabels({ templateId, labels }: Omit<Props, "isActivated">) {
  return (
    <div className="space-y-3">
      {SECTIONS.map((section) => (
        <SectionCard
          key={section.key}
          templateId={templateId}
          labels={labels}
          section={section}
        />
      ))}
    </div>
  );
}

function SectionCard({
  templateId,
  labels,
  section,
}: {
  templateId: string;
  labels: Props["labels"];
  section: (typeof SECTIONS)[number];
}) {
  const [editing, setEditing] = useState(false);
  const [isSavePending, startSaveTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | undefined>();
  useUnsavedChanges(`section-card-${section.key}`, editing);

  const currentLabel = section.labelField ? getLabelValue(labels, section.labelField) : null;
  const currentDesc = getDescValue(labels, section.descField);

  function handleSave(fd: FormData) {
    startSaveTransition(async () => {
      const result = await updateSingleSectionLabel(templateId, {}, fd);
      if (result.error) {
        setSaveError(result.error);
      } else {
        setSaveError(undefined);
        setEditing(false);
      }
    });
  }

  return (
    <div
      className="overflow-hidden rounded-lg border border-zinc-200 bg-white"
      style={{ borderLeft: `3px solid ${section.borderColor}` }}
    >
      {/* Card header */}
      <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50 px-4 py-3">
        <p className="text-xs font-medium text-zinc-800">{section.title}</p>
        <div className="flex items-center gap-3">
          <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={section.badgeStyle}>
            {section.badgeLabel}
          </span>
          {!editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs text-zinc-500 hover:text-zinc-900"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Card body */}
      {editing ? (
        <div className="bg-blue-50/40 p-4">
          <form action={handleSave} className={`${section.fixedHeading ? "" : "grid grid-cols-2 gap-4"}`}>
            {!section.fixedHeading && section.labelField && (
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">Heading</label>
                <textarea
                  name={section.labelField}
                  defaultValue={currentLabel ?? ""}
                  rows={2}
                  className="w-full resize-none rounded border border-zinc-200 px-2 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                />
                {section.labelHint && (
                  <p className="mt-1 text-xs text-zinc-400">{section.labelHint}</p>
                )}
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Subtitle</label>
              <textarea
                name={section.descField}
                defaultValue={currentDesc}
                rows={2}
                placeholder="Add a short description…"
                className="w-full resize-none rounded border border-zinc-200 px-2 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              />
              <p className="mt-1 text-xs text-zinc-400">{section.descHint}</p>
              {section.fixedNote && (
                <p className="mt-1 text-xs text-zinc-400">{section.fixedNote}</p>
              )}
            </div>

            {/* Save / cancel spans full width */}
            <div className={`flex items-center gap-3 pt-1 ${section.fixedHeading ? "" : "col-span-2"}`}>
              <button
                type="submit"
                disabled={isSavePending}
                className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                {isSavePending ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => { setEditing(false); setSaveError(undefined); }}
                className="text-xs text-zinc-500 hover:text-zinc-700"
              >
                Cancel
              </button>
              {saveError && <p className="text-xs text-red-600">{saveError}</p>}
            </div>
          </form>
        </div>
      ) : (
        <div className={`p-4 ${section.fixedHeading ? "" : "grid grid-cols-2 gap-4"}`}>
          {!section.fixedHeading && (
            <div>
              <p className="mb-0.5 text-xs text-zinc-400">Heading</p>
              {currentLabel ? (
                <p className="text-sm text-zinc-900">{currentLabel}</p>
              ) : (
                <p className="text-sm italic text-zinc-400">Not set</p>
              )}
            </div>
          )}
          <div>
            <p className="mb-0.5 text-xs text-zinc-400">Subtitle</p>
            {currentDesc ? (
              <p className="text-sm text-zinc-900">{currentDesc}</p>
            ) : (
              <p className="text-sm italic text-zinc-400">Not set</p>
            )}
            {section.fixedNote && (
              <p className="mt-1 text-xs text-zinc-400">{section.fixedNote}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
