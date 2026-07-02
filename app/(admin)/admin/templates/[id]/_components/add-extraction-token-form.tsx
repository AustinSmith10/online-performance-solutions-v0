"use client";

import { useActionState, useTransition, useState, useEffect, useRef } from "react";
import {
  addExtractionOnlyToken,
  deleteExtractionToken,
  updateExtractionToken,
  type AddExtractionTokenState,
} from "@/app/actions/templates";
import { EditIconButton } from "@/components/EditIconButton";

interface Row {
  id: string;
  placeholder_token: string;
  display_label: string | null;
  extraction_hint: string | null;
  is_required: boolean;
}

interface Props {
  templateId: string;
  existingTokens: Row[];
  highlightToken?: string;
}

export function AddExtractionTokenForm({ templateId, existingTokens, highlightToken }: Props) {
  const boundAdd = addExtractionOnlyToken.bind(null, templateId);
  const [state, formAction, pending] = useActionState<AddExtractionTokenState, FormData>(
    boundAdd,
    {}
  );

  return (
    <div className="divide-y divide-zinc-50">
      {existingTokens.length > 0 && (
        <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead className="border-b border-zinc-100">
            <tr>
              <th className="px-5 py-3 text-left font-medium text-zinc-500">Token</th>
              <th className="px-5 py-3 text-left font-medium text-zinc-500">Display label</th>
              <th className="px-5 py-3 text-left font-medium text-zinc-500">Extraction hint</th>
              <th className="w-20 px-5 py-3 text-center font-medium text-zinc-500">Required</th>
              <th className="w-16 px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {existingTokens.map((row) => (
              <ExtractionOnlyRow
                key={row.id}
                templateId={templateId}
                row={row}
                highlight={row.placeholder_token === highlightToken}
              />
            ))}
          </tbody>
        </table>
        </div>
      )}

      <form action={formAction} className="space-y-4 px-5 py-5">
        <p className="text-xs font-medium text-zinc-700">Add extraction-only token</p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-zinc-500">
              Token name <span className="text-red-400">*</span>
            </label>
            <input
              name="token"
              type="text"
              required
              placeholder="EXTRACT_DEV_NAME"
              className="w-full rounded border border-zinc-200 px-2 py-1.5 font-mono text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400 uppercase"
            />
            <p className="mt-0.5 text-xs text-zinc-400">Must start with EXTRACT_</p>
          </div>

          <div>
            <label className="mb-1 block text-xs text-zinc-500">
              Display label <span className="text-red-400">*</span>
            </label>
            <input
              name="label"
              type="text"
              required
              placeholder="e.g. Development name"
              className="w-full rounded border border-zinc-200 px-2 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
            />
            <p className="mt-0.5 text-xs text-zinc-400">Shown to client if extraction confidence is low</p>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs text-zinc-500">
            Extraction hint <span className="text-red-400">*</span>
          </label>
          <textarea
            name="hint"
            required
            rows={3}
            placeholder="Tell Claude what to look for and where in the submitted documents…"
            className="w-full rounded border border-zinc-200 px-2 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400 resize-y"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            name="is_required"
            id="extraction-required"
            className="h-4 w-4 rounded border-zinc-300 accent-zinc-900"
          />
          <label htmlFor="extraction-required" className="text-xs text-zinc-700">
            Required — block submission if client cannot confirm this value
          </label>
        </div>

        {state.error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add token"}
        </button>
      </form>
    </div>
  );
}

function ExtractionOnlyRow({ templateId, row, highlight }: { templateId: string; row: Row; highlight?: boolean }) {
  const [isEditing, setIsEditing] = useState(false);
  const trRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    if (!highlight || !trRef.current) return;
    const el = trRef.current;
    el.style.outline = "2px solid #4ade80";
    el.style.outlineOffset = "-2px";
    const t = setTimeout(() => {
      el.style.transition = "outline-color 0.6s ease";
      el.style.outlineColor = "transparent";
    }, 2000);
    return () => clearTimeout(t);
  }, [highlight]);

  const [isDeletePending, startDeleteTransition] = useTransition();
  const [isSavePending, startSaveTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | undefined>();

  function handleSave(fd: FormData) {
    startSaveTransition(async () => {
      const result = await updateExtractionToken(templateId, row.id, {}, fd);
      if (result.error) {
        setSaveError(result.error);
      } else {
        setSaveError(undefined);
        setIsEditing(false);
      }
    });
  }

  function handleDelete() {
    startDeleteTransition(async () => {
      await deleteExtractionToken(templateId, row.placeholder_token);
    });
  }

  if (isEditing) {
    return (
      <tr className="bg-zinc-50/60">
        <td colSpan={5} className="px-5 py-4">
          <form action={handleSave} className="space-y-3">
            <p className="text-xs font-medium text-zinc-700 font-mono">{"{" + row.placeholder_token + "}"}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-zinc-500">Display label <span className="text-red-400">*</span></label>
                <input
                  name="label"
                  type="text"
                  required
                  defaultValue={row.display_label ?? ""}
                  className="w-full rounded border border-zinc-200 px-2 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                />
              </div>
              <div className="flex items-end gap-2">
                <label className="flex items-center gap-1.5 text-xs text-zinc-700 cursor-pointer">
                  <input
                    type="checkbox"
                    name="is_required"
                    defaultChecked={row.is_required}
                    className="h-4 w-4 rounded border-zinc-300 accent-zinc-900"
                  />
                  Required
                </label>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Extraction hint <span className="text-red-400">*</span></label>
              <textarea
                name="hint"
                required
                rows={3}
                defaultValue={row.extraction_hint ?? ""}
                className="w-full rounded border border-zinc-200 px-2 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400 resize-y"
              />
            </div>
            {saveError && (
              <p className="text-xs text-red-600">{saveError}</p>
            )}
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={isSavePending}
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                {isSavePending ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="text-xs text-zinc-500 hover:text-zinc-700"
              >
                Cancel
              </button>
            </div>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr ref={trRef} className={isDeletePending ? "opacity-40" : ""}>
      <td className="px-5 py-3 font-mono text-xs text-zinc-800">
        {"{"}
        {row.placeholder_token}
        {"}"}
      </td>
      <td className="px-5 py-3 text-xs text-zinc-700">
        {row.display_label ?? <span className="text-zinc-400">—</span>}
      </td>
      <td className="px-5 py-3 text-xs text-zinc-500 max-w-xs truncate" title={row.extraction_hint ?? ""}>
        {row.extraction_hint ?? <span className="text-zinc-400">—</span>}
      </td>
      <td className="px-5 py-3 text-center text-xs">
        {row.is_required ? (
          <span className="text-zinc-900">✓</span>
        ) : (
          <span className="text-zinc-300">—</span>
        )}
      </td>
      <td className="px-5 py-3 text-right">
        <div className="flex items-center justify-end gap-3">
          <EditIconButton onClick={() => setIsEditing(true)} label={`Edit ${row.placeholder_token}`} />
          <button
            onClick={handleDelete}
            disabled={isDeletePending}
            className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
          >
            Remove
          </button>
        </div>
      </td>
    </tr>
  );
}
