"use client";

import { useActionState, useState } from "react";
import {
  addMetricsRow,
  updateMetricsRow,
  deleteMetricsRow,
  updateAutofillConfig,
  type RowMutationState,
  type AutofillConfigState,
  type MetricsTable,
  type MetricsRow,
  type TemplateTokenGroup,
} from "@/app/actions/client-metrics";
import { useUnsavedChanges } from "@/components/UnsavedChangesProvider";
import { EditIconButton } from "@/components/EditIconButton";
import { MetricsSpreadsheetModal } from "./metrics-spreadsheet-modal";

interface Props {
  clientId: string;
  table: MetricsTable;
  rows: MetricsRow[];
  templateTokenGroups: TemplateTokenGroup[];
}

export function MetricsTableEditor({ clientId, table, rows, templateTokenGroups }: Props) {
  return (
    <div className="space-y-6">
      <AutofillConfigPanel clientId={clientId} table={table} rows={rows} templateTokenGroups={templateTokenGroups} />

      <div className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3">
        <p className="text-xs text-zinc-600">
          Import rows from a spreadsheet — you&apos;ll map its columns to this table&apos;s columns.
        </p>
        <MetricsSpreadsheetModal
          mode="append"
          clientId={clientId}
          tableId={table.id}
          columns={table.columns}
          trigger={(open) => (
            <button
              type="button"
              onClick={open}
              className="shrink-0 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Import spreadsheet
            </button>
          )}
        />
      </div>

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

type StepState = "complete" | "active" | "pending";

function StepBadge({ state, number }: { state: StepState; number: number }) {
  if (state === "complete") {
    return (
      <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-green-600 text-white">
        <svg className="h-2.5 w-2.5" viewBox="0 0 16 16" fill="none">
          <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-zinc-900 text-[10px] font-medium text-white">
        {number}
      </span>
    );
  }
  return (
    <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-zinc-300 text-[10px] font-medium text-zinc-400">
      {number}
    </span>
  );
}

// Shown above the token→column connector arrow — green once both sides of
// the pairing are selected, signalling the link is complete (not that the
// values have been tested against real data; see the match-tester follow-up).
function LinkIcon({ linked }: { linked: boolean }) {
  return (
    <svg
      className={`h-3 w-3 ${linked ? "text-green-600" : "text-zinc-300"}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m3.94-3.94l1.757-1.757a4.5 4.5 0 116.364 6.364l-1.757 1.757"
      />
    </svg>
  );
}

function AutofillConfigPanel({
  clientId,
  table,
  rows,
  templateTokenGroups,
}: {
  clientId: string;
  table: MetricsTable;
  rows: MetricsRow[];
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
  const templateState: StepState = templateId ? "complete" : "active";
  const matchState: StepState = !templateId ? "pending" : matchToken && matchColumnId ? "complete" : "active";
  const fieldsState: StepState = !templateId ? "pending" : "active";
  const validOutputCount = outputs.filter((o) => o.token && o.columnId).length;

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
      <form action={formAction} className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">Auto-fill from this table</h3>
            <p className="mt-0.5 max-w-md text-xs text-zinc-500">
              Match a value extracted from documents against a column here, then fill other document fields
              from that row instead of extracting them with AI.
            </p>
          </div>
          <label className="flex shrink-0 items-center gap-2 pt-0.5 text-xs text-zinc-600">
            <span>Enabled</span>
            <input
              type="checkbox"
              name="autofill_enabled"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300"
            />
          </label>
        </div>

        {enabled && (
          <div className="space-y-4 border-t border-zinc-200 pt-4">
            <div className="flex items-center gap-2">
              <StepBadge state={templateState} number={1} />
              <span className="text-[11px] text-zinc-400">Template</span>
              <div className={`h-px flex-1 ${templateState === "complete" ? "bg-green-600" : "bg-zinc-200"}`} />
              <StepBadge state={matchState} number={2} />
              <span className="text-[11px] text-zinc-400">Match</span>
              <div className={`h-px flex-1 ${matchState === "complete" ? "bg-green-600" : "bg-zinc-200"}`} />
              <StepBadge state={fieldsState} number={3} />
              <span className={`text-[11px] ${fieldsState === "pending" ? "text-zinc-400" : "text-zinc-900"}`}>
                Fields
              </span>
            </div>

            <div>
              <div className="mb-2 flex items-center gap-2">
                <StepBadge state={templateState} number={1} />
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Template</p>
              </div>
              <div className="ml-[26px]">
                <select
                  name="template_id"
                  value={templateId}
                  onChange={(e) => selectTemplate(e.target.value)}
                  className="w-full max-w-sm rounded border border-zinc-200 px-2 py-1.5 text-sm text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                >
                  <option value="">Select a template…</option>
                  {templateTokenGroups.map((g) => (
                    <option key={g.templateId} value={g.templateId}>
                      {g.templateName}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-zinc-500">Only this template&apos;s tokens appear below.</p>
              </div>
            </div>

            {templateId && (
              <>
                <div className="rounded-md border border-zinc-200 bg-white p-3">
                  <div className="mb-2.5 flex items-center gap-2">
                    <StepBadge state={matchState} number={2} />
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Match</p>
                  </div>
                  <div className="ml-[26px] flex flex-wrap items-start gap-3">
                    <div>
                      <label className="mb-1 block text-xs text-zinc-600">Document token</label>
                      <select
                        name="match_token"
                        value={matchToken}
                        onChange={(e) => setMatchToken(e.target.value)}
                        className="rounded border border-zinc-200 px-2 py-1.5 text-sm text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                      >
                        <option value="">Select a token…</option>
                        {availableTokensFor(matchToken).map((t) => (
                          <option key={t.token} value={t.token}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                      {matchToken && (
                        <p className="mt-1 font-mono text-[11px] text-zinc-400">{matchToken}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-center gap-0.5 pt-[18px] text-zinc-400">
                      <LinkIcon linked={Boolean(matchToken && matchColumnId)} />
                      <span aria-hidden="true">→</span>
                      <span className="text-[10px]">matches</span>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-zinc-600">Table column</label>
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
                </div>

                <div className="rounded-md border border-zinc-200 bg-white p-3">
                  <div className="mb-2.5 flex items-center gap-2">
                    <StepBadge state={fieldsState} number={3} />
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Fields</p>
                  </div>

                  <div className="ml-[26px]">
                    {outputs.length > 0 && (
                      <div className="mb-1.5 flex items-center gap-2 text-xs text-zinc-500">
                        <span className="flex-1">Document token</span>
                        <span className="w-4" />
                        <span className="flex-1">Table column</span>
                        <span className="w-6" />
                      </div>
                    )}
                    <div className="space-y-2">
                      {outputs.map((out, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <select
                            name="output_token"
                            value={out.token}
                            onChange={(e) => updateOutput(index, "token", e.target.value)}
                            className="flex-1 rounded border border-zinc-200 px-2 py-1.5 text-sm text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                          >
                            <option value="">Select a document token…</option>
                            {availableTokensFor(out.token).map((t) => (
                              <option key={t.token} value={t.token}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                          <div className="flex w-4 shrink-0 flex-col items-center gap-0.5 text-zinc-400">
                            <LinkIcon linked={Boolean(out.token && out.columnId)} />
                            <span className="text-xs" aria-hidden="true">←</span>
                          </div>
                          <select
                            name="output_column_id"
                            value={out.columnId}
                            onChange={(e) => updateOutput(index, "columnId", e.target.value)}
                            className="flex-1 rounded border border-zinc-200 px-2 py-1.5 text-sm text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                          >
                            <option value="">Select a column…</option>
                            {table.columns.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => removeOutput(index)}
                            disabled={outputs.length === 1}
                            className="w-6 shrink-0 rounded p-1 text-center text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-400"
                            aria-label="Remove field"
                            title="Remove field"
                          >
                            ×
                          </button>
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
                </div>
              </>
            )}
          </div>
        )}

        <div className="flex items-center gap-3 border-t border-zinc-200 pt-4">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save changes"}
          </button>
          {enabled && templateId && matchToken && matchColumnId && validOutputCount > 0 && (
            <span className="text-xs text-zinc-500">
              {validOutputCount} field{validOutputCount === 1 ? "" : "s"} will auto-fill from {rows.length}{" "}
              row{rows.length === 1 ? "" : "s"}
            </span>
          )}
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

