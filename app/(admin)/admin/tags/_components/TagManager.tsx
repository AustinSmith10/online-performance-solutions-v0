"use client";

import { useActionState, useState, useTransition } from "react";
import { createTag, updateTag, deleteTag, type TagActionState } from "@/app/actions/tags";
import { TagChip } from "@/components/TagChip";
import { TAG_SWATCHES, DEFAULT_TAG_COLOR } from "@/lib/tags/color";

interface ManagedTag {
  id: string;
  name: string;
  color: string;
  assignedCount: number;
}

const INPUT =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500";
const BTN_SECONDARY =
  "press rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors duration-150 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-50 [@media(pointer:coarse)]:min-h-10";
const BTN_PRIMARY =
  "press rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-50 [@media(pointer:coarse)]:min-h-10";

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Eight curated colours for the common case, plus a Custom option for when
 * they run out (a colour wheel and a hex field). Any colour is safe: the chip
 * darkens its label until it passes contrast (lib/tags/color.ts). `onChange`
 * only ever receives a valid #rrggbb, so an in-progress hex never reaches the form.
 */
function SwatchPicker({ value, onChange, idPrefix }: { value: string; onChange: (hex: string) => void; idPrefix: string }) {
  const isPreset = TAG_SWATCHES.some((s) => s.hex.toLowerCase() === value.toLowerCase());
  const [customOpen, setCustomOpen] = useState(!isPreset);
  const [text, setText] = useState(value);
  const customActive = customOpen || !isPreset;

  function commitText(next: string) {
    const withHash = next.startsWith("#") ? next : `#${next}`;
    setText(next);
    if (HEX.test(withHash)) onChange(withHash.toLowerCase());
  }

  const ring = (on: boolean) =>
    on ? "ring-2 ring-zinc-900 ring-offset-2" : "ring-1 ring-inset ring-black/10 hover:ring-black/25";
  const target =
    "press h-7 w-7 rounded-full transition-shadow duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10";

  return (
    <div className="space-y-2.5">
      <div role="radiogroup" aria-label="Tag colour" className="flex flex-wrap items-center gap-1.5">
        {TAG_SWATCHES.map((s) => {
          const checked = !customActive && s.hex.toLowerCase() === value.toLowerCase();
          return (
            <button
              key={s.hex}
              id={`${idPrefix}-${s.name}`}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={s.name}
              title={s.name}
              onClick={() => {
                setCustomOpen(false);
                setText(s.hex);
                onChange(s.hex);
              }}
              className={`${target} ${ring(checked)}`}
              style={{ backgroundColor: s.hex }}
            />
          );
        })}
        <button
          id={`${idPrefix}-custom`}
          type="button"
          role="radio"
          aria-checked={customActive}
          aria-label="Custom colour"
          title="Custom colour"
          onClick={() => {
            setCustomOpen(true);
            setText(value);
          }}
          className={`${target} ${ring(customActive)}`}
          style={{
            background: customActive && HEX.test(value) ? value : "conic-gradient(from 0deg, #ef4444, #f59e0b, #22c55e, #06b6d4, #6366f1, #d946ef, #ef4444)",
          }}
        />
      </div>
      {customActive && (
        <div className="rise-in flex flex-wrap items-center gap-2">
          <input
            type="color"
            aria-label="Pick a colour"
            value={HEX.test(value) ? value : "#2563eb"}
            onChange={(e) => {
              setText(e.target.value);
              onChange(e.target.value.toLowerCase());
            }}
            className="h-9 w-11 cursor-pointer rounded-md border border-zinc-300 bg-white p-1 [@media(pointer:coarse)]:h-10"
          />
          <label className="sr-only" htmlFor={`${idPrefix}-hex`}>
            Hex colour
          </label>
          <input
            id={`${idPrefix}-hex`}
            value={text}
            onChange={(e) => commitText(e.target.value.trim())}
            maxLength={7}
            spellCheck={false}
            autoComplete="off"
            placeholder="#2563eb"
            aria-invalid={!HEX.test(text.startsWith("#") ? text : `#${text}`)}
            className="w-28 rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          />
          {!HEX.test(text.startsWith("#") ? text : `#${text}`) && (
            <span className="text-xs text-zinc-500">Enter 6 hex digits, e.g. #2563eb</span>
          )}
        </div>
      )}
    </div>
  );
}

function TagForm({
  initial,
  submitLabel,
  action,
  onDone,
  onCancel,
  idPrefix,
}: {
  initial?: { name: string; color: string };
  submitLabel: string;
  action: (prev: TagActionState, fd: FormData) => Promise<TagActionState>;
  onDone?: () => void;
  onCancel?: () => void;
  idPrefix: string;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? DEFAULT_TAG_COLOR);
  const [state, formAction, pending] = useActionState<TagActionState, FormData>(async (prev, fd) => {
    const result = await action(prev, fd);
    if (result.success) {
      if (!initial) setName("");
      onDone?.();
    }
    return result;
  }, {});

  return (
    <form action={formAction} className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-56">
          <label htmlFor={`${idPrefix}-name`} className="mb-1.5 block text-xs font-medium text-zinc-700">
            Name
          </label>
          <input
            id={`${idPrefix}-name`}
            name="name"
            required
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. VIP, Manager, Test account"
            className={INPUT}
          />
        </div>
        <div>
          <span className="mb-1.5 block text-xs font-medium text-zinc-700">Colour</span>
          <SwatchPicker value={color} onChange={setColor} idPrefix={idPrefix} />
        </div>
      </div>
      <input type="hidden" name="color" value={color} />
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-zinc-500">Preview</span>
        <TagChip tag={{ id: "preview", name: name.trim() || "Tag name", color }} className={name.trim() ? "" : "opacity-60"} />
        <div className="ml-auto flex items-center gap-2">
          {onCancel && (
            <button type="button" onClick={onCancel} className={BTN_SECONDARY}>
              Cancel
            </button>
          )}
          <button type="submit" disabled={pending || !name.trim()} className={BTN_PRIMARY}>
            {pending ? "Saving…" : submitLabel}
          </button>
        </div>
      </div>
      {state.error && (
        <p role="alert" className="rise-in text-sm text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}

function TagRow({ tag }: { tag: ManagedTag }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, startDelete] = useTransition();

  if (editing) {
    return (
      <li className="rise-in bg-zinc-50/60 px-4 py-4">
        <TagForm
          idPrefix={`edit-${tag.id}`}
          initial={{ name: tag.name, color: tag.color }}
          submitLabel="Save changes"
          action={(prev, fd) => updateTag(tag.id, prev, fd)}
          onDone={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <TagChip tag={tag} className="max-w-[16rem]" />
        <span className="text-xs tabular-nums text-zinc-500">
          {tag.assignedCount === 0 ? "Not assigned yet" : `${tag.assignedCount} account${tag.assignedCount === 1 ? "" : "s"}`}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {confirming ? (
            <>
              <button type="button" onClick={() => setConfirming(false)} className={BTN_SECONDARY}>
                Keep tag
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() =>
                  startDelete(async () => {
                    const result = await deleteTag(tag.id);
                    if (result.error) setDeleteError(result.error);
                  })
                }
                className="press rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors duration-150 hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:opacity-50 [@media(pointer:coarse)]:min-h-10"
              >
                {deleting ? "Deleting…" : tag.assignedCount > 0 ? `Delete, remove from ${tag.assignedCount}` : "Delete tag"}
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setEditing(true)} className={BTN_SECONDARY}>
                Edit
              </button>
              <button type="button" onClick={() => setConfirming(true)} className={BTN_SECONDARY}>
                Delete
              </button>
            </>
          )}
        </div>
      </div>
      {deleteError && (
        <p role="alert" className="rise-in mt-2 text-xs text-red-600">
          {deleteError}
        </p>
      )}
    </li>
  );
}

export function TagManager({ tags }: { tags: ManagedTag[] }) {
  return (
    <div className="space-y-4">
      <section aria-labelledby="new-tag" className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-5">
        <h2 id="new-tag" className="mb-3 text-sm font-semibold text-zinc-900">
          New tag
        </h2>
        <TagForm idPrefix="new" submitLabel="Create tag" action={createTag} />
      </section>

      <section aria-labelledby="all-tags" className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="flex items-center gap-2 border-b border-zinc-100 px-4 py-3">
          <h2 id="all-tags" className="text-sm font-semibold text-zinc-900">
            All tags
          </h2>
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium tabular-nums text-zinc-700">{tags.length}</span>
        </div>
        {tags.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-medium text-zinc-900">No tags yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-500">
              Create one above, then add it to accounts from a user&apos;s page or the account list.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {tags.map((t) => (
              <TagRow key={t.id} tag={t} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
