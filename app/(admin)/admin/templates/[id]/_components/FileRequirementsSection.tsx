"use client";

import { useState, useTransition } from "react";
import { deleteFileRequirement, updateFileRequirement } from "@/app/actions/file-requirements";
import { useUnsavedChanges } from "@/components/UnsavedChangesProvider";

type FileRequirement = {
  id: string;
  name: string;
  slug: string;
  max_count: number;
  required: boolean;
  no_duplicates: boolean;
  extraction: boolean;
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
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
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
      const result = await updateFileRequirement(templateId, requirement.id, {}, fd);
      if (result.error || result.fieldErrors) {
        const first = result.error ?? Object.values(result.fieldErrors ?? {}).flat()[0];
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
              <label className="mb-1 block text-xs font-medium text-zinc-600">Name</label>
              <input
                name="name"
                type="text"
                required
                defaultValue={requirement.name}
                className="w-full rounded border border-zinc-200 px-2 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              />
            </div>
            <div className="shrink-0">
              <label className="mb-1 block text-xs font-medium text-zinc-600">Max uploads</label>
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

          {saveError && (
            <p className="text-xs text-red-600">{saveError}</p>
          )}

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
              onClick={() => { setEditing(false); setSaveError(undefined); }}
              className="text-xs text-zinc-500 hover:text-zinc-700"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-zinc-200 bg-white p-4 transition-opacity ${isDeletePending ? "opacity-40" : ""}`}>
      {/* Name + actions */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-900">{requirement.name}</p>
          <p className="mt-0.5 font-mono text-xs text-zinc-400">{requirement.slug}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3 pt-0.5">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-zinc-500 hover:text-zinc-900"
          >
            Edit
          </button>
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
        <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-500">
          Max {requirement.max_count}
        </span>
      </div>
    </div>
  );
}
