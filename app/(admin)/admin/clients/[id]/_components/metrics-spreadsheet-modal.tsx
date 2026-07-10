"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  parseMetricsExcelPreview,
  createMetricsTableFromExcel,
  importMetricsExcel,
  type ColumnDataType,
  type ImportExcelState,
  type PreviewExcelState,
  type MetricsColumn,
} from "@/app/actions/client-metrics";

const TYPE_LABELS: Record<ColumnDataType, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
};

type Mode =
  | { mode: "create"; clientId: string }
  | { mode: "append"; clientId: string; tableId: string; columns: MetricsColumn[] };

type Props = Mode & {
  trigger: (open: () => void) => React.ReactNode;
};

// Opens a modal that reads an uploaded spreadsheet, then lets the admin pick,
// rename and type its columns. In "create" mode it builds a brand-new table;
// in "append" mode it maps sheet columns onto an existing table's columns.
export function MetricsSpreadsheetModal(props: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  // Remounts the body on each open so all its form/action state resets cleanly.
  const [sessionKey, setSessionKey] = useState(0);

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open]);

  function openModal() {
    setSessionKey((k) => k + 1);
    setOpen(true);
  }

  const modal = (
    <>
      <div
        onClick={() => setOpen(false)}
        aria-hidden="true"
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        style={{ opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none", transition: "opacity 200ms" }}
      />
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ pointerEvents: open ? "auto" : "none" }}
        aria-modal="true"
        role="dialog"
      >
        <div
          className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-zinc-200 bg-white shadow-xl"
          style={{
            transform: open ? "scale(1)" : "scale(0.97)",
            opacity: open ? 1 : 0,
            transition: "transform 200ms, opacity 200ms",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {open && (
            <ModalBody key={sessionKey} {...props} onClose={() => setOpen(false)} />
          )}
        </div>
      </div>
    </>
  );

  return (
    <>
      {props.trigger(openModal)}
      {mounted && createPortal(modal, document.body)}
    </>
  );
}

function ModalBody(props: Props & { onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [previewState, runPreview, previewPending] = useActionState<PreviewExcelState, FormData>(
    parseMetricsExcelPreview,
    {}
  );

  function applyFile(f: File | undefined) {
    if (!f) return;
    if (!/\.(xlsx|xls)$/i.test(f.name)) return;
    setFile(f);
    const fd = new FormData();
    fd.append("file", f);
    startTransition(() => runPreview(fd));
  }

  const title = props.mode === "create" ? "New table from spreadsheet" : "Import rows from spreadsheet";
  const hint =
    props.mode === "create"
      ? "Choose which columns to keep, rename them, and confirm each type."
      : "Match each spreadsheet column to a column in this table.";

  return (
    <>
      <div className="flex items-start justify-between border-b border-zinc-100 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
          <p className="mt-0.5 text-xs text-zinc-500">{hint}</p>
        </div>
        <button
          type="button"
          onClick={props.onClose}
          aria-label="Close"
          className="ml-3 shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
        >
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {!previewState.headers ? (
          <>
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                applyFile(e.dataTransfer.files?.[0]);
              }}
              className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed px-4 py-10 text-xs transition-colors ${
                isDragOver
                  ? "border-zinc-400 bg-zinc-100 text-zinc-700"
                  : "border-zinc-300 bg-white text-zinc-500 hover:border-zinc-400 hover:text-zinc-600"
              }`}
            >
              <span>
                {previewPending
                  ? "Reading spreadsheet…"
                  : file
                    ? file.name
                    : "Drag & drop an .xlsx/.xls file here, or click to browse"}
              </span>
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => applyFile(e.target.files?.[0])}
              />
            </label>
            {previewState.error && <p className="mt-3 text-xs text-red-600">{previewState.error}</p>}
          </>
        ) : props.mode === "create" ? (
          <CreateStep clientId={props.clientId} file={file!} preview={previewState} onClose={props.onClose} />
        ) : (
          <AppendStep
            clientId={props.clientId}
            tableId={props.tableId}
            columns={props.columns}
            file={file!}
            preview={previewState}
            onClose={props.onClose}
          />
        )}
      </div>
    </>
  );
}

type ColumnDraft = { include: boolean; label: string; type: ColumnDataType };

function CreateStep({
  clientId,
  file,
  preview,
  onClose,
}: {
  clientId: string;
  file: File;
  preview: PreviewExcelState;
  onClose: () => void;
}) {
  const headers = preview.headers ?? [];
  const [name, setName] = useState("");
  const [drafts, setDrafts] = useState<ColumnDraft[]>(
    headers.map((h, i) => ({ include: true, label: h, type: preview.inferredTypes?.[i] ?? "text" }))
  );
  const boundAction = createMetricsTableFromExcel.bind(null, clientId);
  const [state, commit, pending] = useActionState<ImportExcelState, FormData>(boundAction, {});

  useEffect(() => {
    if (state.importedCount !== undefined) onClose();
  }, [state.importedCount, onClose]);

  function updateDraft(index: number, patch: Partial<ColumnDraft>) {
    setDrafts((d) => d.map((draft, i) => (i === index ? { ...draft, ...patch } : draft)));
  }

  const includedCount = drafts.filter((d) => d.include).length;

  function submit() {
    const mapping = drafts
      .map((d, index) => ({ index, label: d.label.trim(), data_type: d.type, include: d.include }))
      .filter((m) => m.include)
      .map(({ index, label, data_type }) => ({ index, label, data_type }));
    const fd = new FormData();
    fd.append("file", file);
    fd.append("name", name);
    fd.append("mapping", JSON.stringify(mapping));
    startTransition(() => commit(fd));
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">Table name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Site inventory"
          className="w-full max-w-sm rounded border border-zinc-200 px-2 py-1.5 text-sm text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
        />
      </div>

      <div>
        <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-zinc-600">
          <span className="w-8" />
          <span className="flex-1">Column name</span>
          <span className="w-28">Type</span>
        </div>
        <div className="space-y-1.5">
          {drafts.map((draft, index) => (
            <div
              key={index}
              className={`flex items-center gap-2 rounded border px-2 py-1.5 ${
                draft.include ? "border-zinc-200 bg-white" : "border-zinc-100 bg-zinc-50 opacity-60"
              }`}
            >
              <input
                type="checkbox"
                checked={draft.include}
                onChange={(e) => updateDraft(index, { include: e.target.checked })}
                className="h-4 w-4 shrink-0 rounded border-zinc-300"
                aria-label={`Include ${headers[index]}`}
              />
              <div className="min-w-0 flex-1">
                <input
                  type="text"
                  value={draft.label}
                  onChange={(e) => updateDraft(index, { label: e.target.value })}
                  disabled={!draft.include}
                  className="w-full rounded border border-zinc-200 px-2 py-1 text-sm text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400 disabled:bg-transparent"
                />
                <p className="mt-0.5 truncate font-mono text-[10px] text-zinc-400">
                  from “{headers[index]}”
                  {preview.sampleRows && preview.sampleRows.length > 0 && (
                    <> · e.g. {preview.sampleRows[0][index] || "—"}</>
                  )}
                </p>
              </div>
              <select
                value={draft.type}
                onChange={(e) => updateDraft(index, { type: e.target.value as ColumnDataType })}
                disabled={!draft.include}
                className="w-28 shrink-0 rounded border border-zinc-200 px-2 py-1 text-sm text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400 disabled:bg-transparent"
              >
                {(Object.keys(TYPE_LABELS) as ColumnDataType[]).map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      <CommitFooter
        state={state}
        pending={pending}
        disabled={!name.trim() || includedCount === 0}
        label="Create table & import rows"
        onSubmit={submit}
        onClose={onClose}
      />
    </div>
  );
}

function AppendStep({
  clientId,
  tableId,
  columns,
  file,
  preview,
  onClose,
}: {
  clientId: string;
  tableId: string;
  columns: MetricsColumn[];
  file: File;
  preview: PreviewExcelState;
  onClose: () => void;
}) {
  const headers = preview.headers ?? [];
  // For each table column, the sheet column index feeding it (-1 = skip).
  // Seed by case-insensitive name match to preserve the old auto-matching.
  const [selection, setSelection] = useState<number[]>(
    columns.map((col) =>
      headers.findIndex((h) => h.trim().toLowerCase() === col.name.trim().toLowerCase())
    )
  );
  const boundAction = importMetricsExcel.bind(null, clientId, tableId);
  const [state, commit, pending] = useActionState<ImportExcelState, FormData>(boundAction, {});

  useEffect(() => {
    if (state.importedCount !== undefined) onClose();
  }, [state.importedCount, onClose]);

  const mappedCount = selection.filter((idx) => idx >= 0).length;

  function submit() {
    const mapping = selection
      .map((index, colIndex) => ({ index, column_id: columns[colIndex].id }))
      .filter((m) => m.index >= 0);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("mapping", JSON.stringify(mapping));
    startTransition(() => commit(fd));
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        {columns.map((col, colIndex) => (
          <div key={col.id} className="flex items-center gap-2 rounded border border-zinc-200 bg-white px-2 py-1.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-zinc-900">{col.name}</p>
              <p className="text-[10px] uppercase tracking-wide text-zinc-400">{TYPE_LABELS[col.data_type]}</p>
            </div>
            <span className="text-xs text-zinc-400" aria-hidden="true">
              ←
            </span>
            <select
              value={selection[colIndex]}
              onChange={(e) =>
                setSelection((s) => s.map((v, i) => (i === colIndex ? Number(e.target.value) : v)))
              }
              className="w-48 shrink-0 rounded border border-zinc-200 px-2 py-1 text-sm text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
            >
              <option value={-1}>Skip — leave blank</option>
              {headers.map((h, i) => (
                <option key={i} value={i}>
                  {h}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <CommitFooter
        state={state}
        pending={pending}
        disabled={mappedCount === 0}
        label="Import rows"
        onSubmit={submit}
        onClose={onClose}
      />
    </div>
  );
}

function CommitFooter({
  state,
  pending,
  disabled,
  label,
  onSubmit,
  onClose,
}: {
  state: ImportExcelState;
  pending: boolean;
  disabled: boolean;
  label: string;
  onSubmit: () => void;
  onClose: () => void;
}) {
  return (
    <div className="space-y-2 border-t border-zinc-100 pt-4">
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.rowErrors && state.rowErrors.length > 0 && (
        <div className="rounded border border-red-200 bg-red-50 p-3">
          <p className="mb-1 text-xs font-medium text-red-800">
            Nothing was imported — fix these {state.rowErrors.length} issue(s) and try again:
          </p>
          <ul className="space-y-0.5 text-xs text-red-700">
            {state.rowErrors.slice(0, 20).map((e, i) => (
              <li key={i}>
                Row {e.row}, {e.column}: {e.message}
              </li>
            ))}
          </ul>
          {state.rowErrors.length > 20 && (
            <p className="mt-1 text-xs text-red-500">…and {state.rowErrors.length - 20} more.</p>
          )}
        </div>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSubmit}
          disabled={pending || disabled}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {pending ? "Working…" : label}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
