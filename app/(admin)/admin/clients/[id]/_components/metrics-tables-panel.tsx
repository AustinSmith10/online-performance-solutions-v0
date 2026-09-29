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
      <div className="rounded-xl border border-zinc-200 bg-white p-5">
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
                className="press-subtle transition-colors duration-150 shrink-0 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
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
          <div key={table.id} className="rounded-xl border border-zinc-200 bg-white">
            <button
              type="button"
              onClick={() => setExpandedId(expandedId === table.id ? null : table.id)}
              className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
            >
              <div>
                <p className="text-sm font-medium text-zinc-900">{table.name}</p>
                <p className="mt-0.5 text-xs tabular-nums text-zinc-500">
                  {table.columns.length} column{table.columns.length === 1 ? "" : "s"} ·{" "}
                  {(rowsByTable[table.id] ?? []).length} row
                  {(rowsByTable[table.id] ?? []).length === 1 ? "" : "s"}
                </p>
              </div>
              <span className="text-xs text-zinc-500">{expandedId === table.id ? "Hide" : "Show"}</span>
            </button>

            {expandedId === table.id && (
              <div className="rise-in border-t border-zinc-100 p-5">
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
      <div className="pane-in mt-6 flex items-center gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3">
        <p className="text-xs text-red-800">
          Delete &ldquo;{tableName}&rdquo; and all its rows? This cannot be undone.
        </p>
        <button
          type="button"
          onClick={async () => {
            const result = await deleteMetricsTable(clientId, tableId);
            if (result.error) setError(result.error);
          }}
          className="press-subtle transition-colors duration-150 shrink-0 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
        >
          Delete
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-medium text-zinc-700 transition-colors duration-150 hover:bg-zinc-100"
        >
          Cancel
        </button>
        {error && <p className="rise-in text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="mt-6 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 transition-colors duration-150 hover:bg-red-100"
    >
      Delete table
    </button>
  );
}
