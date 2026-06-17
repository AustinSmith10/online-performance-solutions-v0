"use client";

import { useActionState, useTransition } from "react";
import {
  addExtractionOnlyToken,
  deleteExtractionToken,
  type AddExtractionTokenState,
} from "@/app/actions/templates";

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
}

export function AddExtractionTokenForm({ templateId, existingTokens }: Props) {
  const boundAdd = addExtractionOnlyToken.bind(null, templateId);
  const [state, formAction, pending] = useActionState<AddExtractionTokenState, FormData>(
    boundAdd,
    {}
  );

  return (
    <div className="divide-y divide-zinc-50">
      {existingTokens.length > 0 && (
        <table className="w-full text-sm">
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
              <ExtractionOnlyRow key={row.id} templateId={templateId} row={row} />
            ))}
          </tbody>
        </table>
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

function ExtractionOnlyRow({ templateId, row }: { templateId: string; row: Row }) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      await deleteExtractionToken(templateId, row.placeholder_token);
    });
  }

  return (
    <tr className={isPending ? "opacity-40" : ""}>
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
        <button
          onClick={handleDelete}
          disabled={isPending}
          className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
        >
          Remove
        </button>
      </td>
    </tr>
  );
}
