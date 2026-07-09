"use client";

import { useState } from "react";
import {
  deleteMetricsTable,
  type MetricsTable,
  type MetricsRow,
  type TemplateTokenGroup,
} from "@/app/actions/client-metrics";
import { MetricsTableEditor } from "./metrics-table-editor";
import { MetricsSpreadsheetModal } from "./metrics-spreadsheet-modal";

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
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Data tables</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Upload a spreadsheet, then pick and rename the columns to build a table.
            </p>
          </div>
          <MetricsSpreadsheetModal
            mode="create"
            clientId={clientId}
            trigger={(open) => (
              <button
                type="button"
                onClick={open}
                className="shrink-0 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
              >
                New table from spreadsheet
              </button>
            )}
          />
        </div>
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
