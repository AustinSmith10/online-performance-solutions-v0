"use client";

import { useActionState, useState } from "react";
import {
  createMetricsTable,
  deleteMetricsTable,
  type CreateTableState,
  type ColumnDataType,
  type MetricsTable,
  type MetricsRow,
  type TemplateTokenGroup,
} from "@/app/actions/client-metrics";
import { useUnsavedChanges } from "@/components/UnsavedChangesProvider";
import { MetricsTableEditor } from "./metrics-table-editor";

const TYPE_LABELS: Record<ColumnDataType, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
};

interface Props {
  clientId: string;
  tables: MetricsTable[];
  rowsByTable: Record<string, MetricsRow[]>;
  templateTokenGroups: TemplateTokenGroup[];
}

export function MetricsTablesPanel({ clientId, tables, rowsByTable, templateTokenGroups }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(tables[0]?.id ?? null);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900">Data tables</h2>
        </div>
        <CreateTableForm clientId={clientId} />
      </div>

      {tables.length === 0 ? (
        <p className="px-1 text-sm text-zinc-500">No tables yet — create one above.</p>
      ) : (
        tables.map((table) => (
          <div key={table.id} className="rounded-lg border border-zinc-200 bg-white">
            <button
              type="button"
              onClick={() => setExpandedId(expandedId === table.id ? null : table.id)}
              className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left"
            >
              <div>
                <p className="text-sm font-medium text-zinc-900">{table.name}</p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {table.columns.length} column{table.columns.length === 1 ? "" : "s"} ·{" "}
                  {(rowsByTable[table.id] ?? []).length} row
                  {(rowsByTable[table.id] ?? []).length === 1 ? "" : "s"}
                </p>
              </div>
              <span className="text-xs text-zinc-400">{expandedId === table.id ? "Hide" : "Show"}</span>
            </button>

            {expandedId === table.id && (
              <div className="border-t border-zinc-100 p-6">
                <MetricsTableEditor
                  clientId={clientId}
                  table={table}
                  rows={rowsByTable[table.id] ?? []}
                  templateTokenGroups={templateTokenGroups}
                />
                <DeleteTableButton clientId={clientId} tableId={table.id} tableName={table.name} />
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

function CreateTableForm({ clientId }: { clientId: string }) {
  const boundAction = createMetricsTable.bind(null, clientId);
  const [state, formAction, pending] = useActionState<CreateTableState, FormData>(boundAction, {});
  const [columns, setColumns] = useState<{ name: string; type: ColumnDataType }[]>([
    { name: "", type: "text" },
  ]);
  const [isDirty, setIsDirty] = useState(false);
  useUnsavedChanges("create-metrics-table", isDirty);

  function addColumn() {
    setColumns((c) => [...c, { name: "", type: "text" }]);
    setIsDirty(true);
  }

  function removeColumn(index: number) {
    setColumns((c) => c.filter((_, i) => i !== index));
    setIsDirty(true);
  }

  function updateColumn(index: number, field: "name" | "type", value: string) {
    setColumns((c) => c.map((col, i) => (i === index ? { ...col, [field]: value } : col)));
    setIsDirty(true);
  }

  return (
    <form
      action={(fd) => {
        formAction(fd);
        setColumns([{ name: "", type: "text" }]);
        setIsDirty(false);
      }}
      className="space-y-4"
    >
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">Table name</label>
        <input
          type="text"
          name="name"
          placeholder="e.g. Site inventory"
          required
          className="w-full max-w-sm rounded border border-zinc-200 px-2 py-1.5 text-sm text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">Columns</label>
        <div className="space-y-2">
          {columns.map((col, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="text"
                name="column_name"
                value={col.name}
                onChange={(e) => updateColumn(index, "name", e.target.value)}
                placeholder="Column name"
                required
                className="flex-1 rounded border border-zinc-200 px-2 py-1.5 text-sm text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              />
              <select
                name="column_type"
                value={col.type}
                onChange={(e) => updateColumn(index, "type", e.target.value)}
                className="rounded border border-zinc-200 px-2 py-1.5 text-sm text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              >
                {(Object.keys(TYPE_LABELS) as ColumnDataType[]).map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
              {columns.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeColumn(index)}
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
          onClick={addColumn}
          className="mt-2 text-xs font-medium text-zinc-600 hover:text-zinc-900"
        >
          + Add column
        </button>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create table"}
        </button>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      </div>
    </form>
  );
}

function DeleteTableButton({
  clientId,
  tableId,
  tableName,
}: {
  clientId: string;
  tableId: string;
  tableName: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | undefined>();

  if (confirming) {
    return (
      <div className="mt-6 flex items-center gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3">
        <p className="text-xs text-red-800">
          Delete &ldquo;{tableName}&rdquo; and all its rows? This cannot be undone.
        </p>
        <button
          type="button"
          onClick={async () => {
            const result = await deleteMetricsTable(clientId, tableId);
            if (result.error) setError(result.error);
          }}
          className="shrink-0 rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
        >
          Delete
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="shrink-0 text-xs text-zinc-500 hover:text-zinc-700"
        >
          Cancel
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="mt-6 text-xs font-medium text-red-600 hover:text-red-800"
    >
      Delete table
    </button>
  );
}
