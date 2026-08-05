"use client";

import { useActionState } from "react";
import {
  updateFileRequirement,
  type FileRequirementState,
} from "@/app/actions/file-requirements";

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
};

export function EditForm({
  templateId,
  requirement,
}: {
  templateId: string;
  requirement: FileRequirement;
}) {
  const action = updateFileRequirement.bind(null, templateId, requirement.id);
  const [state, formAction, pending] = useActionState<FileRequirementState, FormData>(
    action,
    {}
  );

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">Name</label>
        <input
          name="name"
          type="text"
          defaultValue={requirement.name}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
        />
        {state.fieldErrors?.name?.map((e) => (
          <p key={e} className="mt-1 text-xs text-red-600">{e}</p>
        ))}
      </div>

      <div>
        <p className="mb-1 text-sm font-medium text-zinc-700">Identifier</p>
        <p className="rounded-md border border-zinc-100 bg-zinc-50 px-3 py-2 font-mono text-sm text-zinc-500">
          {requirement.slug}
        </p>
        <p className="mt-1 text-xs text-zinc-400">
          Cannot be changed after creation.
        </p>
      </div>

      <div className="w-36">
        <label className="mb-1 block text-sm font-medium text-zinc-700">Max uploads</label>
        <input
          name="max_count"
          type="number"
          min={1}
          max={20}
          defaultValue={requirement.max_count}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
        />
        {state.fieldErrors?.max_count?.map((e) => (
          <p key={e} className="mt-1 text-xs text-red-600">{e}</p>
        ))}
      </div>

      <div className="space-y-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            name="required"
            defaultChecked={requirement.required}
            className="h-4 w-4 rounded border-zinc-300 accent-zinc-900"
          />
          Required — client cannot submit without this file
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            name="no_duplicates"
            defaultChecked={requirement.no_duplicates}
            className="h-4 w-4 rounded border-zinc-300 accent-zinc-900"
          />
          No duplicates — filenames within this slot must be unique
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            name="extraction"
            defaultChecked={requirement.extraction}
            className="h-4 w-4 rounded border-zinc-300 accent-zinc-900"
          />
          Extraction — send to AI for field extraction
        </label>
      </div>

      <div className="space-y-3 rounded-md border border-zinc-100 bg-zinc-50/60 p-4">
        <p className="text-sm font-medium text-zinc-700">Upload verification (optional)</p>
        <p className="text-xs text-zinc-500">
          Checked on every stakeholder upload into this slot. A soft warning only — never blocks the upload.
        </p>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            AI judge hint
          </label>
          <input
            name="ai_judge_hint"
            type="text"
            defaultValue={requirement.ai_judge_hint ?? ""}
            placeholder="e.g. A Stockland Purchase Order — letterhead, PO number, cost table"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            Required text markers (one per line)
          </label>
          <textarea
            name="marker_text_patterns"
            rows={3}
            defaultValue={(requirement.marker_text_patterns ?? []).join("\n")}
            placeholder={"Purchase Order\nPO Number"}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
          />
        </div>
        <div className="flex items-end gap-4">
          <div className="w-28">
            <label className="mb-1 block text-sm font-medium text-zinc-700">Min pages</label>
            <input
              name="marker_page_count_min"
              type="number"
              min={1}
              defaultValue={requirement.marker_page_count_min ?? ""}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
            />
          </div>
          <div className="w-28">
            <label className="mb-1 block text-sm font-medium text-zinc-700">Max pages</label>
            <input
              name="marker_page_count_max"
              type="number"
              min={1}
              defaultValue={requirement.marker_page_count_max ?? ""}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
            />
          </div>
          {state.fieldErrors?.marker_page_count?.map((e) => (
            <p key={e} className="text-xs text-red-600">{e}</p>
          ))}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Regex</label>
          <input
            name="marker_regex"
            type="text"
            defaultValue={requirement.marker_regex ?? ""}
            placeholder="PO-\d+"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm focus:border-zinc-500 focus:outline-none"
          />
          {state.fieldErrors?.marker_regex?.map((e) => (
            <p key={e} className="mt-1 text-xs text-red-600">{e}</p>
          ))}
        </div>
      </div>

      {state.error && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}
      {state.success && (
        <p className="text-sm text-green-600">Saved.</p>
      )}

      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        <a
          href={`/admin/templates/${templateId}`}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Cancel
        </a>
      </div>
    </form>
  );
}
