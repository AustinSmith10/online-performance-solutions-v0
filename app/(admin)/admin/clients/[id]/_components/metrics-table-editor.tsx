"use client";

import { useActionState, useRef, useState } from "react";
import {
  addMetricsRow,
  updateMetricsRow,
  deleteMetricsRow,
  importMetricsExcel,
  updateAutofillConfig,
  type RowMutationState,
  type ImportExcelState,
  type AutofillConfigState,
  type MetricsTable,
  type MetricsRow,
  type TemplateTokenGroup,
} from "@/app/actions/client-metrics";
import { useUnsavedChanges } from "@/components/UnsavedChangesProvider";
import { EditIconButton } from "@/components/EditIconButton";

interface Props {
  clientId: string;
  table: MetricsTable;
  rows: MetricsRow[];
  templateTokenGroups: TemplateTokenGroup[];
}

export function MetricsTableEditor({ clientId, table, rows, templateTokenGroups }: Props) {
  return (
    <div className="space-y-6">
      <AutofillConfigPanel clientId={clientId} table={table} templateTokenGroups={templateTokenGroups} />

      <ExcelImportForm clientId={clientId} tableId={table.id} table={table} />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead className="border-b border-zinc-100">
            <tr>
              {table.columns.map((col) => (
                <th key={col.id} className="pb-2 pr-4 text-left font-medium text-zinc-500">
                  {col.name}
                </th>
              ))}
              <th className="pb-2 text-left font-medium text-zinc-500 w-20">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {rows.map((row) => (
              <RowLine key={row.id} clientId={clientId} table={table} row={row} />
            ))}
            <NewRowLine clientId={clientId} table={table} />
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="mt-3 text-sm text-zinc-500">No rows yet — add one below or upload a spreadsheet.</p>
        )}
      </div>
    </div>
  );
}

function AutofillConfigPanel({
  clientId,
  table,
  templateTokenGroups,
}: {
  clientId: string;
  table: MetricsTable;
  templateTokenGroups: TemplateTokenGroup[];
}) {
  const boundAction = updateAutofillConfig.bind(null, clientId, table.id);
  const [state, formAction, pending] = useActionState<AutofillConfigState, FormData>(boundAction, {});

  const [enabled, setEnabled] = useState(table.autofill_enabled);
  const [templateId, setTemplateId] = useState(table.template_id ?? "");
  const [matchToken, setMatchToken] = useState(table.match_token ?? "");
  const [matchColumnId, setMatchColumnId] = useState(table.match_column_id ?? "");
  const [outputs, setOutputs] = useState<{ token: string; columnId: string }[]>(
    table.outputs.length > 0
      ? table.outputs.map((o) => ({ token: o.output_token, columnId: o.output_column_id }))
      : [{ token: "", columnId: "" }]
  );

  const templateTokens = templateTokenGroups.find((g) => g.templateId === templateId)?.tokens ?? [];
  const usedTokens = new Set([matchToken, ...outputs.map((o) => o.token)].filter(Boolean));
  const availableTokensFor = (currentToken: string) =>
    templateTokens.filter((t) => t.token === currentToken || !usedTokens.has(t.token));

  function selectTemplate(newTemplateId: string) {
    setTemplateId(newTemplateId);
    setMatchToken("");
    setOutputs([{ token: "", columnId: "" }]);
  }

  function addOutput() {
    setOutputs((o) => [...o, { token: "", columnId: "" }]);
  }

  function removeOutput(index: number) {
    setOutputs((o) => o.filter((_, i) => i !== index));
  }

  function updateOutput(index: number, field: "token" | "columnId", value: string) {
    setOutputs((o) => o.map((out, i) => (i === index ? { ...out, [field]: value } : out)));
  }

  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
      <h3 className="text-sm font-semibold text-zinc-900">Auto-fill document fields from this table</h3>
      <p className="mt-0.5 mb-3 text-xs text-zinc-500">
        When enabled, a value extracted from a submitted document (the match token) is looked up in this
        table. Matching row values then fill in other document fields automatically, instead of those
        fields being extracted by AI.
      </p>
      <form action={formAction} className="space-y-4">
        <label className="flex items-center gap-2 text-sm font-medium text-zinc-900">
          <input
            type="checkbox"
            name="autofill_enabled"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300"
          />
          Enable auto-fill for this table
        </label>

        {enabled && (
          <div className="space-y-4 pl-6">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Template (which document tokens to choose from)
              </label>
              <select
                name="template_id"
                value={templateId}
                onChange={(e) => selectTemplate(e.target.value)}
                className="rounded border border-zinc-200 px-2 py-1.5 text-sm text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              >
                <option value="">Select a template…</option>
                {templateTokenGroups.map((g) => (
                  <option key={g.templateId} value={g.templateId}>
                    {g.templateName}
                  </option>
                ))}
              </select>
            </div>

            {templateId && (
              <>
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600">
                      Match token (extracted from documents)
                    </label>
                    <select
                      name="match_token"
                      value={matchToken}
                      onChange={(e) => setMatchToken(e.target.value)}
                      className="rounded border border-zinc-200 px-2 py-1.5 text-sm text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                    >
                      <option value="">Select a token…</option>
                      {availableTokensFor(matchToken).map((t) => (
                        <option key={t.token} value={t.token}>
                          {t.label} ({t.token})
                        </option>
                      ))}
                    </select>
                  </div>
                  <span className="pb-2 text-xs text-zinc-400">looked up against</span>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600">Match column</label>
                    <select
                      name="match_column_id"
                      value={matchColumnId}
                      onChange={(e) => setMatchColumnId(e.target.value)}
                      className="rounded border border-zinc-200 px-2 py-1.5 text-sm text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                    >
                      <option value="">Select a column…</option>
                      {table.columns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600">
                    Fields to auto-fill from the matched row
                  </label>
                  <div className="space-y-2">
                    {outputs.map((out, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <select
                          name="output_token"
                          value={out.token}
                          onChange={(e) => updateOutput(index, "token", e.target.value)}
                          className="rounded border border-zinc-200 px-2 py-1.5 text-sm text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                        >
                          <option value="">Select a document token…</option>
                          {availableTokensFor(out.token).map((t) => (
                            <option key={t.token} value={t.token}>
                              {t.label} ({t.token})
                            </option>
                          ))}
                        </select>
                        <span className="text-xs text-zinc-400">← filled from</span>
                        <select
                          name="output_column_id"
                          value={out.columnId}
                          onChange={(e) => updateOutput(index, "columnId", e.target.value)}
                          className="rounded border border-zinc-200 px-2 py-1.5 text-sm text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                        >
                          <option value="">Select a column…</option>
                          {table.columns.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        {outputs.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeOutput(index)}
                            className="shrink-0 text-xs text-zinc-400 hover:text-red-600"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={addOutput}
                    className="mt-2 text-xs font-medium text-zinc-600 hover:text-zinc-900"
                  >
                    + Add another field
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save auto-fill settings"}
          </button>
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        </div>
      </form>
    </div>
  );
}

function formatCell(value: string | number | null): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function RowLine({ clientId, table, row }: { clientId: string; table: MetricsTable; row: MetricsRow }) {
  const [editing, setEditing] = useState(false);
  const [deleteError, setDeleteError] = useState<string | undefined>();
  useUnsavedChanges(`metrics-row-${row.id}`, editing);

  const boundAction = updateMetricsRow.bind(null, clientId, table.id, row.id);
  const [state, formAction, pending] = useActionState<RowMutationState, FormData>(boundAction, {});

  if (editing) {
    return (
      <tr className="bg-blue-50/40">
        <td colSpan={table.columns.length + 1} className="py-2">
          <form
            action={async (fd) => {
              await formAction(fd);
            }}
            className="flex flex-wrap items-end gap-2"
          >
            {table.columns.map((col) => (
              <div key={col.id}>
                <label className="mb-1 block text-xs font-medium text-zinc-600">{col.name}</label>
                <input
                  type={col.data_type === "number" ? "number" : col.data_type === "date" ? "date" : "text"}
                  name={`col_${col.id}`}
                  defaultValue={formatCell(row.data[col.id])}
                  className="w-32 rounded border border-zinc-200 px-2 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                />
              </div>
            ))}
            <button
              type="submit"
              disabled={pending}
              className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-xs text-zinc-500 hover:text-zinc-700"
            >
              Cancel
            </button>
            {state.error && <p className="w-full text-xs text-red-600">{state.error}</p>}
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      {table.columns.map((col) => (
        <td key={col.id} className="py-2 pr-4 text-zinc-900">
          {formatCell(row.data[col.id])}
        </td>
      ))}
      <td className="py-2">
        <div className="flex items-center gap-1">
          <EditIconButton onClick={() => setEditing(true)} label="Edit row" />
          <button
            type="button"
            onClick={async () => {
              const result = await deleteMetricsRow(clientId, table.id, row.id);
              if (result.error) setDeleteError(result.error);
            }}
            className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600"
            aria-label="Delete row"
            title="Delete row"
          >
            ×
          </button>
        </div>
        {deleteError && <p className="text-xs text-red-600">{deleteError}</p>}
      </td>
    </tr>
  );
}

function NewRowLine({ clientId, table }: { clientId: string; table: MetricsTable }) {
  const boundAction = addMetricsRow.bind(null, clientId, table.id);
  const [state, formAction, pending] = useActionState<RowMutationState, FormData>(boundAction, {});
  const [key, setKey] = useState(0);

  return (
    <tr>
      <td colSpan={table.columns.length + 1} className="pt-3">
        <form
          key={key}
          action={async (fd) => {
            await formAction(fd);
            setKey((k) => k + 1);
          }}
          className="flex flex-wrap items-end gap-2"
        >
          {table.columns.map((col) => (
            <div key={col.id}>
              <label className="mb-1 block text-xs font-medium text-zinc-600">{col.name}</label>
              <input
                type={col.data_type === "number" ? "number" : col.data_type === "date" ? "date" : "text"}
                name={`col_${col.id}`}
                className="w-32 rounded border border-zinc-200 px-2 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              />
            </div>
          ))}
          <button
            type="submit"
            disabled={pending}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            {pending ? "Adding…" : "+ Add row"}
          </button>
          {state.error && <p className="w-full text-xs text-red-600">{state.error}</p>}
        </form>
      </td>
    </tr>
  );
}

function ExcelImportForm({
  clientId,
  tableId,
  table,
}: {
  clientId: string;
  tableId: string;
  table: MetricsTable;
}) {
  const boundAction = importMetricsExcel.bind(null, clientId, tableId);
  const [state, formAction, pending] = useActionState<ImportExcelState, FormData>(boundAction, {});
  const [formKey, setFormKey] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function applyFile(file: File | undefined) {
    if (!file) return;
    if (!/\.(xlsx|xls)$/i.test(file.name)) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    if (fileInputRef.current) fileInputRef.current.files = dt.files;
    setSelectedFile(file);
  }

  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
      <p className="mb-2 text-xs font-medium text-zinc-600">
        Upload Excel — headers must match column names: {table.columns.map((c) => c.name).join(", ")}
      </p>
      <form
        key={formKey}
        action={async (fd) => {
          await formAction(fd);
          setFormKey((k) => k + 1);
          setSelectedFile(null);
        }}
        className="flex items-center gap-3"
      >
        <label
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            applyFile(e.dataTransfer.files?.[0]);
          }}
          className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-4 py-3 text-xs transition-colors ${
            isDragOver
              ? "border-zinc-400 bg-zinc-100 text-zinc-700"
              : "border-zinc-300 bg-white text-zinc-500 hover:border-zinc-400 hover:text-zinc-600"
          }`}
        >
          <span>{selectedFile ? selectedFile.name : "Drag & drop an .xlsx/.xls file here, or click to browse"}</span>
          <input
            ref={fileInputRef}
            type="file"
            name="file"
            accept=".xlsx,.xls"
            required
            className="hidden"
            onChange={(e) => applyFile(e.target.files?.[0])}
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          {pending ? "Importing…" : "Import"}
        </button>
      </form>
      {state.error && <p className="mt-2 text-xs text-red-600">{state.error}</p>}
      {state.importedCount !== undefined && (
        <p className="mt-2 text-xs text-green-700">Imported {state.importedCount} row(s).</p>
      )}
      {state.rowErrors && state.rowErrors.length > 0 && (
        <div className="mt-3 rounded border border-red-200 bg-red-50 p-3">
          <p className="mb-1 text-xs font-medium text-red-800">
            Import failed — fix these {state.rowErrors.length} issue(s) and re-upload:
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
    </div>
  );
}
