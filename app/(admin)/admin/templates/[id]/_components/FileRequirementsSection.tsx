"use client";

import { useState, useTransition } from "react";
import {
  deleteFileRequirement,
  updateFileRequirement,
} from "@/app/actions/file-requirements";
import { useUnsavedChanges } from "@/components/UnsavedChangesProvider";
import { EditIconButton } from "@/components/EditIconButton";
import { ReferenceSampleControl } from "@/components/ReferenceSampleControl";

type FileRequirement = {
  id: string;
  name: string;
  slug: string;
  max_count: number;
  required: boolean;
  no_duplicates: boolean;
  extraction: boolean;
  marker_text_patterns: string[] | null;
  marker_page_count_min: number | null;
  marker_page_count_max: number | null;
  marker_regex: string | null;
  ai_judge_hint: string | null;
  reference_sample_storage_path: string | null;
  reference_sample_signed_url: string | null;
};

interface Props {
  templateId: string;
  requirements: FileRequirement[];
}

export function FileRequirementsSection({ templateId, requirements }: Props) {
  if (requirements.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-zinc-400">
        No file requirements yet — add one above.
      </p>
    );
  }

  return (
    <div
      style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}
    >
      {requirements.map((r) => (
        <RequirementCard key={r.id} templateId={templateId} requirement={r} />
      ))}
    </div>
  );
}

function RequirementCard({
  templateId,
  requirement,
}: {
  templateId: string;
  requirement: FileRequirement;
}) {
  const [editing, setEditing] = useState(false);
  const [isDeletePending, startDeleteTransition] = useTransition();
  const [isSavePending, startSaveTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | undefined>();
  useUnsavedChanges(`req-card-${requirement.id}`, editing);

  function handleDelete() {
    startDeleteTransition(async () => {
      await deleteFileRequirement(templateId, requirement.id);
    });
  }

  function handleSave(fd: FormData) {
    startSaveTransition(async () => {
      const result = await updateFileRequirement(
        templateId,
        requirement.id,
        {},
        fd,
      );
      if (result.error || result.fieldErrors) {
        const first =
          result.error ?? Object.values(result.fieldErrors ?? {}).flat()[0];
        setSaveError(first);
      } else {
        setSaveError(undefined);
        setEditing(false);
      }
    });
  }

  if (editing) {
    return (
      <div className="rounded-lg border-2 border-blue-400 bg-blue-50/40 p-4">
        <form action={handleSave} className="space-y-3">
          {/* Name + max on one row */}
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Name
              </label>
              <input
                name="name"
                type="text"
                required
                defaultValue={requirement.name}
                className="w-full rounded border border-zinc-200 px-2 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              />
            </div>
            <div className="shrink-0">
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Max uploads
              </label>
              <input
                name="max_count"
                type="number"
                min={1}
                max={20}
                defaultValue={requirement.max_count}
                className="w-16 rounded border border-zinc-200 px-2 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              />
            </div>
          </div>

          {/* Checkboxes */}
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-zinc-700">
              <input
                type="checkbox"
                name="required"
                defaultChecked={requirement.required}
                className="h-3.5 w-3.5 rounded border-zinc-300 accent-zinc-900"
              />
              Required
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-zinc-700">
              <input
                type="checkbox"
                name="no_duplicates"
                defaultChecked={requirement.no_duplicates}
                className="h-3.5 w-3.5 rounded border-zinc-300 accent-zinc-900"
              />
              No duplicates
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-zinc-700">
              <input
                type="checkbox"
                name="extraction"
                defaultChecked={requirement.extraction}
                className="h-3.5 w-3.5 rounded border-zinc-300 accent-zinc-900"
              />
              Extraction
            </label>
          </div>

          {/* Verification (#113): deterministic markers optional, AI-judge hint recommended */}
          <div className="space-y-2 rounded-md border border-zinc-100 bg-zinc-50/60 p-3">
            <p className="text-xs font-medium text-zinc-600">
              Upload verification (optional)
            </p>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">
                AI judge hint — plain description of what this file should look
                like
              </label>
              <input
                name="ai_judge_hint"
                type="text"
                defaultValue={requirement.ai_judge_hint ?? ""}
                placeholder="e.g. A Stockland Purchase Order — letterhead, PO number, cost table"
                className="w-full rounded border border-zinc-200 px-2 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">
                Required text markers — one per line (optional)
              </label>
              <textarea
                name="marker_text_patterns"
                rows={2}
                defaultValue={(requirement.marker_text_patterns ?? []).join(
                  "\n",
                )}
                placeholder={"Purchase Order\nPO Number"}
                className="w-full rounded border border-zinc-200 px-2 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              />
            </div>
            <div className="flex items-end gap-3">
              <div className="w-20">
                <label className="mb-1 block text-xs text-zinc-500">
                  Min pages
                </label>
                <input
                  name="marker_page_count_min"
                  type="number"
                  min={1}
                  defaultValue={requirement.marker_page_count_min ?? ""}
                  className="w-full rounded border border-zinc-200 px-2 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                />
              </div>
              <div className="w-20">
                <label className="mb-1 block text-xs text-zinc-500">
                  Max pages
                </label>
                <input
                  name="marker_page_count_max"
                  type="number"
                  min={1}
                  defaultValue={requirement.marker_page_count_max ?? ""}
                  className="w-full rounded border border-zinc-200 px-2 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs text-zinc-500">
                  Regex (optional)
                </label>
                <input
                  name="marker_regex"
                  type="text"
                  defaultValue={requirement.marker_regex ?? ""}
                  placeholder="PO-\d+"
                  className="w-full rounded border border-zinc-200 px-2 py-1.5 font-mono text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                />
              </div>
            </div>
          </div>

          {saveError && <p className="text-xs text-red-600">{saveError}</p>}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={isSavePending}
              className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {isSavePending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setSaveError(undefined);
              }}
              className="text-xs text-zinc-500 hover:text-zinc-700"
            >
              Cancel
            </button>
          </div>
        </form>

        {/* Outside the Save form — its own upload action, and HTML forbids nested <form>s. */}
        <div className="mt-3">
          <ReferenceSampleControl
            templateId={templateId}
            requirementId={requirement.id}
            currentSignedUrl={requirement.reference_sample_signed_url}
            currentFilename={
              requirement.reference_sample_storage_path
                ? (requirement.reference_sample_storage_path.split("/").pop() ??
                  null)
                : null
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border border-zinc-200 bg-white p-4 transition-opacity ${isDeletePending ? "opacity-40" : ""}`}
    >
      {/* Name + actions */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-900">
            {requirement.name}
          </p>
          <p className="mt-0.5 font-mono text-xs text-zinc-400">
            {requirement.slug}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3 pt-0.5">
          <EditIconButton
            onClick={() => setEditing(true)}
            label={`Edit ${requirement.name}`}
          />
          <button
            onClick={handleDelete}
            disabled={isDeletePending}
            className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
          >
            Remove
          </button>
        </div>
      </div>

      {/* Attribute chips */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {requirement.required && (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
            Required
          </span>
        )}
        {requirement.no_duplicates && (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
            No duplicates
          </span>
        )}
        {requirement.extraction && (
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
            Extraction
          </span>
        )}
        {(requirement.ai_judge_hint ||
          (requirement.marker_text_patterns?.length ?? 0) > 0 ||
          requirement.marker_page_count_min != null ||
          requirement.marker_page_count_max != null ||
          requirement.marker_regex) && (
          <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
            Verified on upload
          </span>
        )}
        <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-500">
          Max {requirement.max_count}
        </span>
      </div>
    </div>
  );
}
