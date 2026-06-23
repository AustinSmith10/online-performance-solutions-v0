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
