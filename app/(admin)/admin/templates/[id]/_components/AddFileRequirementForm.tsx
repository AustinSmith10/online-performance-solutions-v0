"use client";

import { useTransition, useState } from "react";
import { createFileRequirement } from "@/app/actions/file-requirements";
import { useUnsavedChanges } from "@/components/UnsavedChangesProvider";

function toSlug(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function AddFileRequirementForm({ templateId }: { templateId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  useUnsavedChanges("add-file-req", name.trim().length > 0);

  function handleCreate(fd: FormData) {
    startTransition(async () => {
      const result = await createFileRequirement(templateId, {}, fd);
      if (result.error) {
        setError(result.error);
      } else {
        setError(undefined);
        setName("");
        setSlug("");
        setSlugEdited(false);
      }
    });
  }

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    setName(e.target.value);
    if (!slugEdited) setSlug(toSlug(e.target.value));
  }

  return (
    <form action={handleCreate} className="space-y-3">
      <p className="text-xs font-medium text-zinc-700">Add file requirement</p>

      {/* Name · Identifier · Max — one row */}
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-xs text-zinc-500">
            Name <span className="text-red-400">*</span>
          </label>
          <input
            name="name"
            type="text"
            value={name}
            onChange={handleNameChange}
            placeholder="e.g. Building Plans"
            className="w-full rounded border border-zinc-200 px-2 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
          />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs text-zinc-500">Identifier</label>
          <input
            name="slug"
            type="text"
            value={slug}
            onChange={(e) => { setSlug(e.target.value); setSlugEdited(true); }}
            placeholder="building_plans"
            className="w-full rounded border border-zinc-200 px-2 py-1.5 font-mono text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
          />
        </div>
        <div className="shrink-0">
          <label className="mb-1 block text-xs text-zinc-500">Max uploads</label>
          <input
            name="max_count"
            type="number"
            min={1}
            max={20}
            defaultValue={1}
            className="w-16 rounded border border-zinc-200 px-2 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
          />
        </div>
      </div>

      {/* Checkboxes + submit — one row */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-zinc-700">
            <input
              type="checkbox"
              name="required"
              className="h-3.5 w-3.5 rounded border-zinc-300 accent-zinc-900"
            />
            Required
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-zinc-700">
            <input
              type="checkbox"
              name="no_duplicates"
              className="h-3.5 w-3.5 rounded border-zinc-300 accent-zinc-900"
            />
            No duplicates
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-zinc-700">
            <input
              type="checkbox"
              name="extraction"
              className="h-3.5 w-3.5 rounded border-zinc-300 accent-zinc-900"
            />
            Extraction
            <span className="text-zinc-400">(send to AI)</span>
          </label>
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="shrink-0 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {isPending ? "Adding…" : "Add requirement"}
        </button>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      )}
    </form>
  );
}
