"use client";

import { useActionState, useState } from "react";
import {
  addMetricsRow,
  updateMetricsRow,
  deleteMetricsRow,
  importMetricsExcel,
  type RowMutationState,
  type ImportExcelState,
  type MetricsTable,
  type MetricsRow,
} from "@/app/actions/client-metrics";
import { useUnsavedChanges } from "@/components/UnsavedChangesProvider";
import { EditIconButton } from "@/components/EditIconButton";

interface Props {
  clientId: string;
  table: MetricsTable;
  rows: MetricsRow[];
}

export function MetricsTableEditor({ clientId, table, rows }: Props) {
  return (
    <div className="space-y-6">
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
        }}
        className="flex items-center gap-3"
      >
        <input
          type="file"
          name="file"
          accept=".xlsx,.xls"
          required
          className="text-xs text-zinc-700"
        />
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
