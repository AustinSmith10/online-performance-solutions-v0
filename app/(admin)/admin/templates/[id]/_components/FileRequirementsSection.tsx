"use client";

import Link from "next/link";
import { useTransition, useState } from "react";
import {
  createFileRequirement,
  deleteFileRequirement,
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

interface Props {
  templateId: string;
  requirements: FileRequirement[];
}

function toSlug(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function FileRequirementsSection({ templateId, requirements }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);

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
    <div className="divide-y divide-zinc-50">
      {requirements.length > 0 && (
        <div className="overflow-x-auto">
        <table className="w-full min-w-[580px] text-sm">
          <thead className="border-b border-zinc-100">
            <tr>
              <th className="px-5 py-3 text-left font-medium text-zinc-500">Name</th>
              <th className="px-5 py-3 text-left font-medium text-zinc-500">Identifier</th>
              <th className="px-5 py-3 text-center font-medium text-zinc-500">Max</th>
              <th className="px-5 py-3 text-center font-medium text-zinc-500">Required</th>
              <th className="px-5 py-3 text-center font-medium text-zinc-500">No Dup.</th>
              <th className="px-5 py-3 text-center font-medium text-zinc-500">Extraction</th>
              <th className="w-24 px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {requirements.map((r) => (
              <RequirementRow key={r.id} templateId={templateId} requirement={r} />
            ))}
          </tbody>
        </table>
        </div>
      )}

      <form action={handleCreate} className="space-y-4 px-5 py-5">
        <p className="text-xs font-medium text-zinc-700">Add file requirement</p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
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

          <div>
            <label className="mb-1 block text-xs text-zinc-500">
              Identifier <span className="text-zinc-400">(internal key)</span>
            </label>
            <input
              name="slug"
              type="text"
              value={slug}
              onChange={(e) => { setSlug(e.target.value); setSlugEdited(true); }}
              placeholder="e.g. building_plans"
              className="w-full rounded border border-zinc-200 px-2 py-1.5 font-mono text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Max uploads</label>
            <input
              name="max_count"
              type="number"
              min={1}
              max={20}
              defaultValue={1}
              className="w-20 rounded border border-zinc-200 px-2 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
            />
          </div>

          <div className="flex flex-col gap-2 pt-4">
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
        </div>

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {isPending ? "Adding…" : "Add requirement"}
        </button>
      </form>
    </div>
  );
}

function RequirementRow({
  templateId,
  requirement,
}: {
  templateId: string;
  requirement: FileRequirement;
}) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      await deleteFileRequirement(templateId, requirement.id);
    });
  }

  return (
    <tr className={isPending ? "opacity-40" : ""}>
      <td className="px-5 py-3 text-xs font-medium text-zinc-900">{requirement.name}</td>
      <td className="px-5 py-3 font-mono text-xs text-zinc-500">{requirement.slug}</td>
      <td className="px-5 py-3 text-center text-xs text-zinc-700">{requirement.max_count}</td>
      <td className="px-5 py-3 text-center text-xs">
        {requirement.required ? (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Yes</span>
        ) : (
          <span className="text-zinc-300">—</span>
        )}
      </td>
      <td className="px-5 py-3 text-center text-xs">
        {requirement.no_duplicates ? (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Yes</span>
        ) : (
          <span className="text-zinc-300">—</span>
        )}
      </td>
      <td className="px-5 py-3 text-center text-xs">
        {requirement.extraction ? (
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">Yes</span>
        ) : (
          <span className="text-zinc-300">—</span>
        )}
      </td>
      <td className="px-5 py-3 text-right">
        <div className="flex items-center justify-end gap-3">
          <Link
            href={`/admin/templates/${templateId}/file-requirements/${requirement.id}`}
            className="text-xs text-zinc-500 hover:text-zinc-900"
          >
            Edit
          </Link>
          <button
            onClick={handleDelete}
            disabled={isPending}
            className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
          >
            Remove
          </button>
        </div>
      </td>
    </tr>
  );
}
