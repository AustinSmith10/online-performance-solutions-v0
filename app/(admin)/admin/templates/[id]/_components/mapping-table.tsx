"use client";

import { useActionState, useState, useRef, useTransition, useEffect } from "react";
import {
  updateTokenLabels,
  updateSingleTokenLabel,
  updateTokenOrder,
  type UpdateTokenLabelsState,
} from "@/app/actions/templates";
import type { TokenSource } from "@/lib/documents/field-keys";
import { useUnsavedChanges } from "@/components/UnsavedChangesProvider";
import { EditIconButton } from "@/components/EditIconButton";

interface Row {
  id: string;
  placeholder_token: string;
  field_key: string | null;
  is_mapped: boolean;
  display_label: string | null;
  extraction_hint: string | null;
  is_required: boolean;
  sort_order: number;
  comparison_mode?: string | null;
}

const COMPARISON_MODE_OPTIONS = [
  { value: "exact", label: "Exact match" },
  { value: "normalized", label: "Normalize whitespace & case" },
  { value: "semantic", label: "Semantic (AI-normalized)" },
];

interface Props {
  rows: Row[];
  templateId: string;
  missingOrgTokens?: string[];
  isActivated?: boolean;
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

export function MappingTable({ rows, templateId, missingOrgTokens = [], isActivated = false }: Props) {
  if (isActivated) {
    return (
      <ActivatedMappingTable
        rows={rows}
        templateId={templateId}
        missingOrgTokens={missingOrgTokens}
      />
    );
  }
  return (
    <DraftMappingTable
      rows={rows}
      templateId={templateId}
      missingOrgTokens={missingOrgTokens}
    />
  );
}

// ---------------------------------------------------------------------------
// Draft mode — always-editable batch form with global save
// ---------------------------------------------------------------------------

function DraftMappingTable({ rows, templateId, missingOrgTokens = [] }: Omit<Props, "isActivated">) {
  const boundAction = updateTokenLabels.bind(null, templateId);
  const [state, formAction, pending] = useActionState<UpdateTokenLabelsState, FormData>(
    boundAction,
    {}
  );

  const [isDirty, setIsDirty] = useState(false);
  useUnsavedChanges("tokens-draft", isDirty);

  // Clear dirty flag when save succeeds
  useEffect(() => {
    if (state.success) queueMicrotask(() => setIsDirty(false));
  }, [state.success]);

  const [orderedRows, setOrderedRows] = useState<Row[]>(rows);
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  function onDragStart(index: number) { dragIndexRef.current = index; }

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
    setIsDirty(true);
  }

  function onDragEnd() {
    dragIndexRef.current = null;
    setDragOverIndex(null);
  }

  return (
    <form action={formAction} onInput={() => setIsDirty(true)}>
      {orderedRows.map((row, index) => (
        <input
          key={`order-${row.id}`}
          type="hidden"
          name={`order_${row.placeholder_token}`}
          value={(index + 1) * 10}
        />
      ))}

      <div className="space-y-2 p-4">
        {orderedRows.map((row, index) => {
          const source = (row.field_key ?? "unknown") as TokenSource;
          const isExtract = row.field_key === "extract";
          const isClientInput = row.field_key === "client" || row.field_key === "extract";
          const isDragOver = dragOverIndex === index;

          return (
            <div
              key={row.id}
              draggable
              onDragStart={() => onDragStart(index)}
              onDragOver={(e) => onDragOver(e, index)}
              onDrop={(e) => onDrop(e, index)}
              onDragEnd={onDragEnd}
              style={{ display: "grid", gridTemplateColumns: "28px 172px 1fr" }}
              className={`rounded-lg border overflow-hidden transition-colors ${
                !row.is_mapped
                  ? "border-red-200 bg-red-50/30"
                  : isDragOver
                  ? "border-blue-300"
                  : "border-zinc-200 bg-white"
              }`}
            >
              <div className="flex items-center justify-center border-r border-zinc-100 bg-zinc-50 cursor-grab select-none text-zinc-300 hover:text-zinc-500 text-base">
                ⠿
              </div>

              <div className="flex flex-col gap-2 justify-center border-r border-zinc-100 px-4 py-4">
                <p className="font-mono text-xs text-zinc-500 break-all">
                  {"{" + row.placeholder_token + "}"}
                </p>
                <span className={`self-start rounded-full px-2 py-0.5 text-xs font-medium ${SOURCE_STYLES[source]}`}>
                  {SOURCE_LABELS[source]}
                </span>
                {row.is_mapped ? (
                  <span className="text-xs text-green-700">✓ Valid</span>
                ) : (
                  <span className="text-xs font-medium text-red-600" title="Unrecognised prefix — blocks activation">
                    ✗ Invalid
                  </span>
                )}
              </div>

              <div className="px-4 py-4">
                {isExtract ? (
                  <div className="flex flex-col gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-600">
                        Display label <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        name={`label_${row.placeholder_token}`}
                        defaultValue={row.display_label ?? ""}
                        placeholder="e.g. Site address"
                        className="w-full rounded border border-zinc-200 px-2 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-600">
                        Extraction hint <span className="text-red-400">*</span>
                      </label>
                      <textarea
                        name={`hint_${row.placeholder_token}`}
                        defaultValue={row.extraction_hint ?? ""}
                        placeholder="Tell Claude what to look for and where in the submitted documents…"
                        rows={3}
                        className="w-full resize-y rounded border border-zinc-200 px-2 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-600">
                        Comparison mode — how candidates across documents are compared
                      </label>
                      <select
                        name={`comparison_mode_${row.placeholder_token}`}
                        defaultValue={row.comparison_mode ?? "exact"}
                        className="w-full rounded border border-zinc-200 px-2 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                      >
                        {COMPARISON_MODE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-zinc-700">
                      <input
                        type="checkbox"
                        name={`required_${row.placeholder_token}`}
                        defaultChecked={row.is_required}
                        className="h-3.5 w-3.5 rounded border-zinc-300 accent-zinc-900"
                      />
                      Required — block submission if client cannot confirm this value
                    </label>
                  </div>
                ) : (
                  <div className="flex items-end gap-4">
                    <div className="flex-1">
                      <label className="mb-1 block text-xs font-medium text-zinc-600">
                        Display label <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        name={`label_${row.placeholder_token}`}
                        defaultValue={row.display_label ?? ""}
                        placeholder="e.g. Client name"
                        className="w-full rounded border border-zinc-200 px-2 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                        required
                      />
                    </div>
                    {isClientInput ? (
                      <label className="mb-1.5 flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-zinc-700">
                        <input
                          type="checkbox"
                          name={`required_${row.placeholder_token}`}
                          defaultChecked={row.is_required}
                          className="h-3.5 w-3.5 rounded border-zinc-300 accent-zinc-900"
                        />
                        Required
                      </label>
                    ) : (
                      <p className="mb-1.5 shrink-0 text-xs text-zinc-400">Auto-filled</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {missingOrgTokens.map((token) => (
          <MissingOrgCard key={`missing-${token}`} token={token} />
        ))}
      </div>

      <div className="flex items-center gap-3 border-t border-zinc-100 px-5 py-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save labels & hints"}
        </button>
        {state.success && <p className="text-sm text-green-600">Saved.</p>}
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Activated mode — per-card editing, auto-save order on drop
// ---------------------------------------------------------------------------

function ActivatedMappingTable({ rows, templateId, missingOrgTokens = [] }: Omit<Props, "isActivated">) {
  const [orderedRows, setOrderedRows] = useState<Row[]>(rows);
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [, startOrderTransition] = useTransition();

  function onDragStart(index: number) { dragIndexRef.current = index; }

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

    startOrderTransition(async () => {
      await updateTokenOrder(
        templateId,
        next.map((r, i) => ({ placeholder_token: r.placeholder_token, sort_order: (i + 1) * 10 }))
      );
    });
  }

  function onDragEnd() {
    dragIndexRef.current = null;
    setDragOverIndex(null);
  }

  return (
    <div className="space-y-2 p-4">
      {orderedRows.map((row, index) => {
        const source = (row.field_key ?? "unknown") as TokenSource;
        const isDragOver = dragOverIndex === index;

        return (
          <div
            key={row.id}
            draggable
            onDragStart={() => onDragStart(index)}
            onDragOver={(e) => onDragOver(e, index)}
            onDrop={(e) => onDrop(e, index)}
            onDragEnd={onDragEnd}
            style={{ display: "grid", gridTemplateColumns: "28px 172px 1fr" }}
            className={`rounded-lg border overflow-hidden transition-colors ${
              !row.is_mapped
                ? "border-red-200 bg-red-50/30"
                : isDragOver
                ? "border-blue-300"
                : "border-zinc-200 bg-white"
            }`}
          >
            {/* Drag handle */}
            <div className="flex items-center justify-center border-r border-zinc-100 bg-zinc-50 cursor-grab select-none text-zinc-300 hover:text-zinc-500 text-base">
              ⠿
            </div>

            {/* Identity */}
            <div className="flex flex-col gap-2 justify-center border-r border-zinc-100 px-4 py-4">
              <p className="font-mono text-xs text-zinc-500 break-all">
                {"{" + row.placeholder_token + "}"}
              </p>
              <span className={`self-start rounded-full px-2 py-0.5 text-xs font-medium ${SOURCE_STYLES[source]}`}>
                {SOURCE_LABELS[source]}
              </span>
              {row.is_mapped ? (
                <span className="text-xs text-green-700">✓ Valid</span>
              ) : (
                <span className="text-xs font-medium text-red-600">✗ Invalid</span>
              )}
            </div>

            {/* Fields — per-card edit */}
            <TokenFieldsCol row={row} templateId={templateId} />
          </div>
        );
      })}

      {missingOrgTokens.map((token) => (
        <MissingOrgCard key={`missing-${token}`} token={token} />
      ))}
    </div>
  );
}

function TokenFieldsCol({ row, templateId }: { row: Row; templateId: string }) {
  const [editing, setEditing] = useState(false);
  const [isSavePending, startSaveTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | undefined>();
  useUnsavedChanges(`token-card-${row.id}`, editing);

  const isExtract = row.field_key === "extract";
  const isClientInput = row.field_key === "client" || row.field_key === "extract";

  function handleSave(fd: FormData) {
    startSaveTransition(async () => {
      const result = await updateSingleTokenLabel(templateId, row.placeholder_token, {}, fd);
      if (result.error) {
        setSaveError(result.error);
      } else {
        setSaveError(undefined);
        setEditing(false);
      }
    });
  }

  if (editing) {
    return (
      <div className="bg-blue-50/40 px-4 py-4">
        <form action={handleSave} className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              Display label <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              name="label"
              defaultValue={row.display_label ?? ""}
              placeholder="e.g. Site address"
              required
              className="w-full rounded border border-zinc-200 px-2 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
            />
          </div>

          {isExtract && (
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Extraction hint <span className="text-red-400">*</span>
              </label>
              <textarea
                name="hint"
                defaultValue={row.extraction_hint ?? ""}
                placeholder="Tell Claude what to look for and where in the submitted documents…"
                rows={3}
                required
                className="w-full resize-y rounded border border-zinc-200 px-2 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              />
            </div>
          )}

          {isExtract && (
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Comparison mode — how candidates across documents are compared
              </label>
              <select
                name="comparison_mode"
                defaultValue={row.comparison_mode ?? "exact"}
                className="w-full rounded border border-zinc-200 px-2 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              >
                {COMPARISON_MODE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          )}

          {isClientInput && (
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-zinc-700">
              <input
                type="checkbox"
                name="is_required"
                defaultChecked={row.is_required}
                className="h-3.5 w-3.5 rounded border-zinc-300 accent-zinc-900"
              />
              Required
            </label>
          )}

          {saveError && <p className="text-xs text-red-600">{saveError}</p>}

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
    <div className="px-4 py-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {row.display_label ? (
            <p className="text-sm font-medium text-zinc-900 leading-snug">{row.display_label}</p>
          ) : (
            <p className="text-sm italic text-zinc-400">No label set</p>
          )}
          {isExtract && row.extraction_hint && (
            <p className="mt-1 text-xs text-zinc-500 line-clamp-2">{row.extraction_hint}</p>
          )}
          {!isExtract && !isClientInput && (
            <p className="mt-1 text-xs text-zinc-400">Auto-filled</p>
          )}
        </div>
        <EditIconButton onClick={() => setEditing(true)} label="Edit token" />
      </div>
      {(isExtract || isClientInput) && row.is_required && (
        <span className="mt-2 inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
          Required
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

function MissingOrgCard({ token }: { token: string }) {
  return (
    <div
      style={{ display: "grid", gridTemplateColumns: "28px 172px 1fr" }}
      className="rounded-lg border border-amber-200 bg-amber-50/40 overflow-hidden"
    >
      <div className="flex items-center justify-center border-r border-amber-100 bg-amber-50 select-none text-amber-300 text-base">
        —
      </div>
      <div className="flex flex-col gap-2 justify-center border-r border-amber-100 px-4 py-4">
        <p className="font-mono text-xs text-zinc-400 line-through">
          {"{" + token + "}"}
        </p>
        <span className="self-start rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700">
          Org config
        </span>
        <span className="text-xs font-medium text-amber-600">! Missing</span>
      </div>
      <div className="flex items-center px-4 py-4">
        <p className="text-xs text-zinc-400">
          Configured in this organisation but not found in the uploaded .docx — will not be populated in generated documents.
        </p>
      </div>
    </div>
  );
}
