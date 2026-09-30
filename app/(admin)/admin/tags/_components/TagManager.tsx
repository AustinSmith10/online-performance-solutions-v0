"use client";

import { useActionState, useState, useTransition } from "react";
import { createTag, updateTag, deleteTag, type TagActionState } from "@/app/actions/tags";
import { TagChip } from "@/components/TagChip";

interface ManagedTag {
  id: string;
  name: string;
  color: string;
  assignedCount: number;
}

const INPUT =
  "rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none";
const BTN =
  "press rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50";

function CreateTagForm() {
  const [state, action, pending] = useActionState<TagActionState, FormData>(createTag, {});
  const [color, setColor] = useState("#2563eb");
  return (
    <form action={action} className="rounded-lg border border-zinc-200 bg-white p-4">
      <p className="mb-3 text-sm font-semibold text-zinc-900">New tag</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-700">
          Name
          <input name="name" required maxLength={40} placeholder="e.g. VIP" className={`${INPUT} w-48`} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-700">
          Colour
          <input
            type="color"
            name="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-9 w-14 cursor-pointer rounded-md border border-zinc-200 bg-white p-1"
          />
        </label>
        <button type="submit" disabled={pending} className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50">
          {pending ? "Creating…" : "Create tag"}
        </button>
      </div>
      {state.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
    </form>
  );
}

function TagRow({ tag }: { tag: ManagedTag }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, startDelete] = useTransition();
  const [state, action, pending] = useActionState<TagActionState, FormData>(async (prev, formData) => {
    const result = await updateTag(tag.id, prev, formData);
    if (result.success) setEditing(false);
    return result;
  }, {});

  return (
    <li className="px-4 py-3">
      {editing ? (
        <form action={action} className="flex flex-wrap items-center gap-3">
          <input name="name" required maxLength={40} defaultValue={tag.name} aria-label="Tag name" className={`${INPUT} w-48`} />
          <input
            type="color"
            name="color"
            defaultValue={tag.color}
            aria-label="Tag colour"
            className="h-9 w-14 cursor-pointer rounded-md border border-zinc-200 bg-white p-1"
          />
          <button type="submit" disabled={pending} className={BTN}>
            {pending ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={() => setEditing(false)} className={BTN}>
            Cancel
          </button>
          {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <TagChip tag={tag} />
          <span className="text-xs text-zinc-500">
            {tag.assignedCount === 0 ? "Not assigned" : `${tag.assignedCount} account${tag.assignedCount === 1 ? "" : "s"}`}
          </span>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={() => setEditing(true)} className={BTN}>
              Edit
            </button>
            {confirming ? (
              <>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() =>
                    startDelete(async () => {
                      const result = await deleteTag(tag.id);
                      if (result.error) setDeleteError(result.error);
                    })
                  }
                  className="press rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {deleting ? "Deleting…" : `Delete and remove from ${tag.assignedCount}`}
                </button>
                <button type="button" onClick={() => setConfirming(false)} className={BTN}>
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirming(true)} className={BTN}>
                Delete
              </button>
            )}
          </div>
          {deleteError && <p className="w-full text-sm text-red-600">{deleteError}</p>}
        </div>
      )}
    </li>
  );
}

export function TagManager({ tags }: { tags: ManagedTag[] }) {
  return (
    <div className="space-y-4">
      <CreateTagForm />
      {tags.length === 0 ? (
        <p className="rounded-lg border border-zinc-200 bg-white px-4 py-6 text-sm text-zinc-500">No tags yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white">
          {tags.map((t) => (
            <TagRow key={t.id} tag={t} />
          ))}
        </ul>
      )}
    </div>
  );
}
