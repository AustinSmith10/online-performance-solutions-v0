"use client";

import { useActionState, useState, useRef } from "react";
import { updateTokenLabels, type UpdateTokenLabelsState } from "@/app/actions/templates";
import type { TokenSource } from "@/lib/documents/field-keys";

interface Row {
  id: string;
  placeholder_token: string;
  field_key: string | null;
  is_mapped: boolean;
  display_label: string | null;
  extraction_hint: string | null;
  is_required: boolean;
  sort_order: number;
}

interface Props {
  rows: Row[];
  templateId: string;
  missingOrgTokens?: string[];
}

const SOURCE_STYLES: Record<TokenSource, string> = {
  client:  "bg-green-100 text-green-700",
  extract: "bg-blue-100 text-blue-700",
  org:     "bg-purple-100 text-purple-700",
  sys:     "bg-zinc-100 text-zinc-600",
  project: "bg-amber-100 text-amber-700",
  unknown: "bg-red-100 text-red-700",
};

const SOURCE_LABELS: Record<TokenSource, string> = {
  client:  "Client input",
  extract: "Extracted",
  org:     "Org config",
  sys:     "System",
  project: "Project",
  unknown: "Unknown",
};

export function MappingTable({ rows, templateId, missingOrgTokens = [] }: Props) {
  const boundAction = updateTokenLabels.bind(null, templateId);
  const [state, formAction, pending] = useActionState<UpdateTokenLabelsState, FormData>(
    boundAction,
    {}
  );

  const [orderedRows, setOrderedRows] = useState<Row[]>(rows);
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  function onDragStart(index: number) {
    dragIndexRef.current = index;
  }

  function onDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (dragIndexRef.current === null || dragIndexRef.current === index) return;
    setDragOverIndex(index);
  }

  function onDrop(e: React.DragEvent, dropIndex: number) {
    e.preventDefault();
    const fromIndex = dragIndexRef.current;
    if (fromIndex === null || fromIndex === dropIndex) {
      dragIndexRef.current = null;
      setDragOverIndex(null);
      return;
    }
    const next = [...orderedRows];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(dropIndex, 0, moved);
    dragIndexRef.current = null;
    setDragOverIndex(null);
    setOrderedRows(next);
  }

  function onDragEnd() {
    dragIndexRef.current = null;
    setDragOverIndex(null);
  }

  return (
    <form action={formAction}>
      {/* Hidden sort_order inputs derived from current drag position */}
      {orderedRows.map((row, index) => (
        <input
          key={`order-${row.id}`}
          type="hidden"
          name={`order_${row.placeholder_token}`}
          value={(index + 1) * 10}
        />
      ))}

      <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-sm">
        <thead className="border-b border-zinc-100">
          <tr>
            <th className="w-10 px-3 py-3"></th>
            <th className="w-52 px-5 py-3 text-left font-medium text-zinc-500">Token</th>
            <th className="w-44 px-5 py-3 text-left font-medium text-zinc-500">
              Display label <span className="text-red-400">*</span>
            </th>
            <th className="w-28 px-5 py-3 text-left font-medium text-zinc-500">Source</th>
            <th className="px-5 py-3 text-left font-medium text-zinc-500">
              Extraction hint <span className="text-blue-400">* EXTRACT only</span>
            </th>
            <th className="w-20 px-5 py-3 text-center font-medium text-zinc-500">Required</th>
            <th className="w-16 px-5 py-3 text-center font-medium text-zinc-500">Valid</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-50">
          {orderedRows.map((row, index) => {
            const source = (row.field_key ?? "unknown") as TokenSource;
            const isExtract = row.field_key === "extract";
            const isClientInput = row.field_key === "client" || row.field_key === "extract";
            const isDragOver = dragOverIndex === index;
            return (
              <tr
                key={row.id}
                draggable
                onDragStart={() => onDragStart(index)}
                onDragOver={(e) => onDragOver(e, index)}
                onDrop={(e) => onDrop(e, index)}
                onDragEnd={onDragEnd}
                className={`${row.is_mapped ? "" : "bg-red-50/40"} ${isDragOver ? "border-t-2 border-blue-400" : ""} transition-colors`}
              >
                <td className="px-3 py-3 align-top cursor-grab text-zinc-300 hover:text-zinc-500 select-none" title="Drag to reorder">
                  ⠿
                </td>
                <td className="px-5 py-3 font-mono text-xs text-zinc-800 align-top">
                  {"{"}
                  {row.placeholder_token}
                  {"}"}
                </td>
                <td className="px-5 py-3 align-top">
                  <input
                    type="text"
                    name={`label_${row.placeholder_token}`}
                    defaultValue={row.display_label ?? ""}
                    placeholder="e.g. Site address"
                    className="w-full rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                    required
                  />
                </td>
                <td className="px-5 py-3 align-top">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${SOURCE_STYLES[source]}`}
                  >
                    {SOURCE_LABELS[source]}
                  </span>
                </td>
                <td className="px-5 py-3 align-top">
                  {isExtract ? (
                    <textarea
                      name={`hint_${row.placeholder_token}`}
                      defaultValue={row.extraction_hint ?? ""}
                      placeholder="Tell Claude what to look for and where…"
                      rows={3}
                      className="w-full rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400 resize-y"
                      required
                    />
                  ) : (
                    <span className="text-xs text-zinc-400">—</span>
                  )}
                </td>
                <td className="px-5 py-3 text-center align-top">
                  {isClientInput ? (
                    <input
                      type="checkbox"
                      name={`required_${row.placeholder_token}`}
                      defaultChecked={row.is_required}
                      className="h-4 w-4 rounded border-zinc-300 accent-zinc-900"
                    />
                  ) : (
                    <span className="text-xs text-zinc-300" title="Auto-filled — cannot be required">—</span>
                  )}
                </td>
                <td className="px-5 py-3 text-center align-top">
                  {row.is_mapped ? (
                    <span className="text-green-600" title="Recognised prefix">✓</span>
                  ) : (
                    <span className="font-bold text-red-500" title="Unrecognised prefix — blocks activation">✗</span>
                  )}
                </td>
              </tr>
            );
          })}

          {missingOrgTokens.map((token) => (
            <tr key={`missing-${token}`} className="bg-amber-50/40">
              <td className="px-3 py-3 align-top">
                <span className="text-xs text-zinc-300">—</span>
              </td>
              <td className="px-5 py-3 font-mono text-xs text-zinc-400 line-through align-top">
                {"{"}
                {token}
                {"}"}
              </td>
              <td className="px-5 py-3 align-top">
                <span className="text-xs text-zinc-400">—</span>
              </td>
              <td className="px-5 py-3 align-top">
                <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700">
                  Org config
                </span>
              </td>
              <td className="px-5 py-3 align-top">
                <span className="text-xs text-zinc-400">—</span>
              </td>
              <td className="px-5 py-3 text-center align-top">
                <span className="text-xs text-zinc-300">—</span>
              </td>
              <td className="px-5 py-3 text-center align-top">
                <span className="font-bold text-amber-500" title="Configured in org but not present in template">!</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      </div>

      <div className="flex items-center gap-3 border-t border-zinc-100 px-5 py-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save labels & hints"}
        </button>
        {state.success && (
          <p className="text-sm text-green-600">Saved.</p>
        )}
        {state.error && (
          <p className="text-sm text-red-600">{state.error}</p>
        )}
      </div>
    </form>
  );
}
