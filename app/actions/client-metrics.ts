"use server";

import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { auditLog } from "@/lib/audit/log";

export type ColumnDataType = "text" | "number" | "date";

export interface MetricsColumn {
  id: string;
  name: string;
  data_type: ColumnDataType;
  position: number;
}

export interface MetricsTable {
  id: string;
  client_id: string;
  name: string;
  created_at: string;
  columns: MetricsColumn[];
  autofill_enabled: boolean;
  template_id: string | null;
  match_token: string | null;
  match_column_id: string | null;
  outputs: OutputMapping[];
}

export interface MetricsRow {
  id: string;
  table_id: string;
  data: Record<string, string | number | null>;
}

export interface OutputMapping {
  id: string;
  output_token: string;
  output_column_id: string;
}

export interface ClientToken {
  token: string;
  label: string;
}

export interface TemplateTokenGroup {
  templateId: string;
  templateName: string;
  tokens: ClientToken[];
}

const VALID_TYPES: ColumnDataType[] = ["text", "number", "date"];

function validateCellValue(raw: string, type: ColumnDataType): { value: string | number; error?: string } {
  const trimmed = raw.trim();
  if (type === "number") {
    const n = Number(trimmed);
    if (trimmed === "" || Number.isNaN(n)) return { value: trimmed, error: "must be a number" };
    return { value: n };
  }
  if (type === "date") {
    const d = new Date(trimmed);
    if (trimmed === "" || Number.isNaN(d.getTime())) return { value: trimmed, error: "must be a valid date" };
    return { value: d.toISOString().slice(0, 10) };
  }
  if (trimmed === "") return { value: trimmed, error: "is required" };
  return { value: trimmed };
}

function cellToString(raw: unknown): string {
  return raw === null || raw === undefined ? "" : String(raw);
}

// Guess a column's type from sampled cell values. Numbers win first (a plain
// year like "2024" reads as a number, not a date), then dates, else text.
// Kept consistent with validateCellValue's parsing so a guess never yields a
// column the importer would then reject.
function inferColumnType(samples: string[]): ColumnDataType {
  const values = samples.map((s) => s.trim()).filter((s) => s !== "");
  if (values.length === 0) return "text";
  if (values.every((v) => !Number.isNaN(Number(v)))) return "number";
  if (values.every((v) => !Number.isNaN(new Date(v).getTime()))) return "date";
  return "text";
}

// Read the first sheet as a matrix of raw cells (row 0 is the header row).
// Columns are addressed by index, which stays stable even when headers are
// blank or duplicated — unlike the object form of sheet_to_json. Returns null
// if the file cannot be parsed.
function readSheetMatrix(buffer: ArrayBuffer): unknown[][] | null {
  try {
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      blankrows: false,
    });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Table CRUD
// ---------------------------------------------------------------------------

// Column selection coming from the spreadsheet modal: which source column
// (by index in the sheet's header row) becomes a table column, its final
// name, and its type.
type CreateColumnMapping = { index: number; label: string; data_type: ColumnDataType };

export async function createMetricsTableFromExcel(
  clientId: string,
  _prev: ImportExcelState,
  formData: FormData
): Promise<ImportExcelState> {
  const actor = await requireRole("super_admin", "admin");

  const name = (formData.get("name") as string | null)?.trim();
  if (!name) return { error: "Table name is required." };

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "An Excel file is required." };
  if (!/\.(xlsx|xls)$/i.test(file.name)) return { error: "Only .xlsx or .xls files are supported." };
  if (file.size > 10 * 1024 * 1024) return { error: "File must be under 10 MB." };

  let mapping: CreateColumnMapping[];
  try {
    mapping = JSON.parse((formData.get("mapping") as string | null) ?? "[]");
  } catch {
    return { error: "Invalid column selection." };
  }
  if (!Array.isArray(mapping) || mapping.length === 0) {
    return { error: "Select at least one column to import." };
  }

  const seen = new Set<string>();
  for (const m of mapping) {
    const label = m.label?.trim();
    if (!label) return { error: "Every selected column needs a name." };
    if (!VALID_TYPES.includes(m.data_type)) return { error: `Invalid column type for "${label}".` };
    const key = label.toLowerCase();
    if (seen.has(key)) return { error: `Duplicate column name "${label}".` };
    seen.add(key);
    m.label = label;
  }

  const matrix = readSheetMatrix(await file.arrayBuffer());
  if (matrix === null) {
    return { error: "Could not parse the Excel file. Ensure it is a valid .xlsx/.xls spreadsheet." };
  }
  const dataRows = matrix.slice(1);

  // Validate every cell before writing anything, so a bad value never leaves a
  // half-created table behind.
  const rowErrors: ImportRowError[] = [];
  dataRows.forEach((row, rowIndex) => {
    for (const m of mapping) {
      const raw = cellToString(row[m.index]);
      if (raw.trim() === "") continue;
      const { error } = validateCellValue(raw, m.data_type);
      if (error) rowErrors.push({ row: rowIndex + 2, column: m.label, message: `${raw} ${error}` });
    }
  });
  if (rowErrors.length > 0) return { rowErrors };

  const supabase = createAdminClient();

  const { data: table, error: tableError } = await supabase
    .from("client_metrics_tables")
    .insert({ client_id: clientId, name })
    .select("id")
    .single();

  if (tableError || !table) return { error: `Failed to create table: ${tableError?.message}` };

  const { data: insertedColumns, error: columnsError } = await supabase
    .from("client_metrics_columns")
    .insert(
      mapping.map((m, index) => ({
        table_id: table.id as string,
        name: m.label,
        data_type: m.data_type,
        position: index,
      }))
    )
    .select("id, position");

  if (columnsError || !insertedColumns) {
    await supabase.from("client_metrics_tables").delete().eq("id", table.id as string);
    return { error: `Failed to save columns: ${columnsError?.message}` };
  }

  // Align inserted column ids back to the mapping order via position.
  const columnIdByMappingIndex = new Map<number, string>();
  for (const col of insertedColumns) {
    columnIdByMappingIndex.set(col.position as number, col.id as string);
  }

  const rowsToInsert = dataRows.map((row) => {
    const data: Record<string, string | number | null> = {};
    mapping.forEach((m, mappingIndex) => {
      const columnId = columnIdByMappingIndex.get(mappingIndex);
      if (!columnId) return;
      const raw = cellToString(row[m.index]);
      if (raw.trim() === "") {
        data[columnId] = null;
        return;
      }
      const { value } = validateCellValue(raw, m.data_type);
      data[columnId] = value;
    });
    return { table_id: table.id as string, data };
  });

  if (rowsToInsert.length > 0) {
    const { error: rowsError } = await supabase.from("client_metrics_rows").insert(rowsToInsert);
    if (rowsError) {
      await supabase.from("client_metrics_tables").delete().eq("id", table.id as string);
      return { error: `Failed to import rows: ${rowsError.message}` };
    }
  }

  await auditLog("client_metrics_table.created", actor.id, actor.email, {
    orgId: clientId,
    metadata: { tableId: table.id, name, columnCount: mapping.length },
  });
  await auditLog("client_metrics_table.imported", actor.id, actor.email, {
    orgId: clientId,
    metadata: { tableId: table.id, rowCount: rowsToInsert.length },
  });

  revalidatePath(`/admin/clients/${clientId}`);
  return { importedCount: rowsToInsert.length };
}

export type DeleteTableState = { error?: string };

export async function deleteMetricsTable(
  clientId: string,
  tableId: string
): Promise<DeleteTableState> {
  const actor = await requireRole("super_admin", "admin");
  const supabase = createAdminClient();

  const { data: table } = await supabase
    .from("client_metrics_tables")
    .select("name")
    .eq("id", tableId)
    .eq("client_id", clientId)
    .maybeSingle();

  if (!table) return { error: "Table not found." };

  const { error } = await supabase
    .from("client_metrics_tables")
    .delete()
    .eq("id", tableId)
    .eq("client_id", clientId);

  if (error) return { error: error.message };

  await auditLog("client_metrics_table.deleted", actor.id, actor.email, {
    orgId: clientId,
    metadata: { tableId, name: table.name },
  });

  revalidatePath(`/admin/clients/${clientId}`);
  return {};
}

// ---------------------------------------------------------------------------
// Manual row edit grid
// ---------------------------------------------------------------------------

export type RowMutationState = { error?: string };

export async function addMetricsRow(
  clientId: string,
  tableId: string,
  _prev: RowMutationState,
  formData: FormData
): Promise<RowMutationState> {
  const actor = await requireRole("super_admin", "admin");
  const supabase = createAdminClient();

  const { data: columns } = await supabase
    .from("client_metrics_columns")
    .select("id, name, data_type")
    .eq("table_id", tableId);

  if (!columns || columns.length === 0) return { error: "Table has no columns." };

  const rowData: Record<string, string | number | null> = {};
  for (const col of columns) {
    const raw = (formData.get(`col_${col.id}`) as string | null) ?? "";
    if (raw.trim() === "") {
      rowData[col.id as string] = null;
      continue;
    }
    const { value, error } = validateCellValue(raw, col.data_type as ColumnDataType);
    if (error) return { error: `"${col.name}" ${error}.` };
    rowData[col.id as string] = value;
  }

  const { error } = await supabase.from("client_metrics_rows").insert({
    table_id: tableId,
    data: rowData,
  });

  if (error) return { error: error.message };

  await auditLog("client_metrics_row.added", actor.id, actor.email, {
    orgId: clientId,
    metadata: { tableId },
  });

  revalidatePath(`/admin/clients/${clientId}`);
  return {};
}

export async function updateMetricsRow(
  clientId: string,
  tableId: string,
  rowId: string,
  _prev: RowMutationState,
  formData: FormData
): Promise<RowMutationState> {
  const actor = await requireRole("super_admin", "admin");
  const supabase = createAdminClient();

  const { data: columns } = await supabase
    .from("client_metrics_columns")
    .select("id, name, data_type")
    .eq("table_id", tableId);

  if (!columns || columns.length === 0) return { error: "Table has no columns." };

  const rowData: Record<string, string | number | null> = {};
  for (const col of columns) {
    const raw = (formData.get(`col_${col.id}`) as string | null) ?? "";
    if (raw.trim() === "") {
      rowData[col.id as string] = null;
      continue;
    }
    const { value, error } = validateCellValue(raw, col.data_type as ColumnDataType);
    if (error) return { error: `"${col.name}" ${error}.` };
    rowData[col.id as string] = value;
  }

  const { error } = await supabase
    .from("client_metrics_rows")
    .update({ data: rowData, updated_at: new Date().toISOString() })
    .eq("id", rowId)
    .eq("table_id", tableId);

  if (error) return { error: error.message };

  await auditLog("client_metrics_row.updated", actor.id, actor.email, {
    orgId: clientId,
    metadata: { tableId, rowId },
  });

  revalidatePath(`/admin/clients/${clientId}`);
  return {};
}

export async function deleteMetricsRow(
  clientId: string,
  tableId: string,
  rowId: string
): Promise<RowMutationState> {
  const actor = await requireRole("super_admin", "admin");
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("client_metrics_rows")
    .delete()
    .eq("id", rowId)
    .eq("table_id", tableId);

  if (error) return { error: error.message };

  await auditLog("client_metrics_row.deleted", actor.id, actor.email, {
    orgId: clientId,
    metadata: { tableId, rowId },
  });

  revalidatePath(`/admin/clients/${clientId}`);
  return {};
}

// ---------------------------------------------------------------------------
// Excel import
// ---------------------------------------------------------------------------

export type ImportRowError = { row: number; column: string; message: string };

export type ImportExcelState = {
  error?: string;
  rowErrors?: ImportRowError[];
  importedCount?: number;
};

export type PreviewExcelState = {
  error?: string;
  headers?: string[];
  inferredTypes?: ColumnDataType[];
  sampleRows?: string[][];
};

const PREVIEW_SAMPLE_ROWS = 10;

// Parse an uploaded spreadsheet just enough to drive the column-picker modal:
// the header row, a guessed type per column, and a handful of sample rows.
// No DB writes — the file is re-sent and re-parsed on commit.
export async function parseMetricsExcelPreview(
  _prev: PreviewExcelState,
  formData: FormData
): Promise<PreviewExcelState> {
  await requireRole("super_admin", "admin");

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "An Excel file is required." };
  if (!/\.(xlsx|xls)$/i.test(file.name)) return { error: "Only .xlsx or .xls files are supported." };
  if (file.size > 10 * 1024 * 1024) return { error: "File must be under 10 MB." };

  const matrix = readSheetMatrix(await file.arrayBuffer());
  if (matrix === null) {
    return { error: "Could not parse the Excel file. Ensure it is a valid .xlsx/.xls spreadsheet." };
  }
  if (matrix.length < 2) {
    return { error: "The spreadsheet needs a header row and at least one data row." };
  }

  const headerRow = matrix[0];
  const dataRows = matrix.slice(1);
  const columnCount = headerRow.length;

  const headers = Array.from({ length: columnCount }, (_, i) => {
    const raw = cellToString(headerRow[i]).trim();
    return raw || `Column ${i + 1}`;
  });
  const inferredTypes = headers.map((_, i) =>
    inferColumnType(dataRows.map((row) => cellToString(row[i])))
  );
  const sampleRows = dataRows
    .slice(0, PREVIEW_SAMPLE_ROWS)
    .map((row) => Array.from({ length: columnCount }, (_, i) => cellToString(row[i])));

  return { headers, inferredTypes, sampleRows };
}

// Mapping from the append modal: which source column (by sheet index) feeds
// each existing table column.
type ImportColumnMapping = { index: number; column_id: string };

export async function importMetricsExcel(
  clientId: string,
  tableId: string,
  _prev: ImportExcelState,
  formData: FormData
): Promise<ImportExcelState> {
  const actor = await requireRole("super_admin", "admin");

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "An Excel file is required." };
  if (!/\.(xlsx|xls)$/i.test(file.name)) return { error: "Only .xlsx or .xls files are supported." };
  if (file.size > 10 * 1024 * 1024) return { error: "File must be under 10 MB." };

  let mapping: ImportColumnMapping[];
  try {
    mapping = JSON.parse((formData.get("mapping") as string | null) ?? "[]");
  } catch {
    return { error: "Invalid column mapping." };
  }
  if (!Array.isArray(mapping) || mapping.length === 0) {
    return { error: "Map at least one spreadsheet column to a table column." };
  }

  const supabase = createAdminClient();

  const { data: columns } = await supabase
    .from("client_metrics_columns")
    .select("id, name, data_type")
    .eq("table_id", tableId)
    .order("position", { ascending: true });

  if (!columns || columns.length === 0) return { error: "Table has no columns defined." };

  const columnById = new Map(columns.map((c) => [c.id as string, c]));
  const seenColumns = new Set<string>();
  for (const m of mapping) {
    if (!columnById.has(m.column_id)) return { error: "Mapping references an unknown column." };
    if (seenColumns.has(m.column_id)) return { error: "A table column is mapped more than once." };
    seenColumns.add(m.column_id);
  }

  const matrix = readSheetMatrix(await file.arrayBuffer());
  if (matrix === null) {
    return { error: "Could not parse the Excel file. Ensure it is a valid .xlsx/.xls spreadsheet." };
  }
  const dataRows = matrix.slice(1);
  if (dataRows.length === 0) return { error: "The spreadsheet has no data rows." };

  const rowErrors: ImportRowError[] = [];
  const rowsToInsert: Record<string, string | number | null>[] = [];

  dataRows.forEach((row, index) => {
    const rowData: Record<string, string | number | null> = {};
    for (const m of mapping) {
      const col = columnById.get(m.column_id)!;
      const raw = cellToString(row[m.index]);
      if (raw.trim() === "") {
        rowData[col.id as string] = null;
        continue;
      }
      const { value, error } = validateCellValue(raw, col.data_type as ColumnDataType);
      if (error) {
        rowErrors.push({ row: index + 2, column: col.name as string, message: `${raw} ${error}` });
      } else {
        rowData[col.id as string] = value;
      }
    }
    rowsToInsert.push(rowData);
  });

  if (rowErrors.length > 0) {
    return { rowErrors };
  }

  const { error: insertError } = await supabase.from("client_metrics_rows").insert(
    rowsToInsert.map((data) => ({ table_id: tableId, data }))
  );

  if (insertError) return { error: `Failed to import rows: ${insertError.message}` };

  await auditLog("client_metrics_table.imported", actor.id, actor.email, {
    orgId: clientId,
    metadata: { tableId, rowCount: rowsToInsert.length },
  });

  revalidatePath(`/admin/clients/${clientId}`);
  return { importedCount: rowsToInsert.length };
}

// ---------------------------------------------------------------------------
// Autofill config (issue #51): opt-in match token/column + output token/column
// mappings, generalizing the hardcoded halcyon_developments mechanism.
// ---------------------------------------------------------------------------

// A client's placeholder tokens live per-template (template_field_mappings).
// Auto-fill resolution itself happens purely by token name at submission
// time regardless of which template a project uses, but the admin picks
// match/output tokens one template at a time, to avoid a single deduped
// list across every template the client has.
export async function getClientTemplateTokenGroups(clientId: string): Promise<TemplateTokenGroup[]> {
  await requireRole("super_admin", "admin");
  const supabase = createAdminClient();

  const { data: templates } = await supabase
    .from("templates")
    .select("id, name")
    .eq("client_id", clientId)
    .order("name");

  const templateList = (templates ?? []) as { id: string; name: string }[];
  if (templateList.length === 0) return [];

  const { data: mappings } = await supabase
    .from("template_field_mappings")
    .select("template_id, placeholder_token, display_label")
    .in("template_id", templateList.map((t) => t.id))
    .eq("field_key", "extract")
    .eq("is_mapped", true);

  return templateList.map((t) => {
    const byToken = new Map<string, ClientToken>();
    for (const m of mappings ?? []) {
      if (m.template_id !== t.id) continue;
      const token = m.placeholder_token as string;
      if (!byToken.has(token)) {
        byToken.set(token, { token, label: (m.display_label as string | null) || token });
      }
    }
    return {
      templateId: t.id,
      templateName: t.name,
      tokens: [...byToken.values()].sort((a, b) => a.token.localeCompare(b.token)),
    };
  });
}

export type AutofillConfigState = { error?: string };

export async function updateAutofillConfig(
  clientId: string,
  tableId: string,
  _prev: AutofillConfigState,
  formData: FormData
): Promise<AutofillConfigState> {
  const actor = await requireRole("super_admin", "admin");
  const supabase = createAdminClient();

  const enabled = formData.get("autofill_enabled") === "on";
  const templateId = (formData.get("template_id") as string | null)?.trim() || null;
  const matchToken = (formData.get("match_token") as string | null)?.trim() || null;
  const matchColumnId = (formData.get("match_column_id") as string | null)?.trim() || null;
  const outputTokens = formData.getAll("output_token") as string[];
  const outputColumnIds = formData.getAll("output_column_id") as string[];

  const { data: columns } = await supabase
    .from("client_metrics_columns")
    .select("id")
    .eq("table_id", tableId);
  const validColumnIds = new Set((columns ?? []).map((c) => c.id as string));

  const outputs: { output_token: string; output_column_id: string }[] = [];
  if (enabled) {
    if (!templateId) return { error: "A template is required to enable auto-fill." };
    if (!matchToken) return { error: "A match token is required to enable auto-fill." };
    if (!matchColumnId || !validColumnIds.has(matchColumnId)) {
      return { error: "A valid match column is required to enable auto-fill." };
    }

    const seenTokens = new Set<string>([matchToken]);
    for (let i = 0; i < outputTokens.length; i++) {
      const token = outputTokens[i]?.trim();
      const columnId = outputColumnIds[i]?.trim();
      if (!token || !columnId) continue;
      if (!validColumnIds.has(columnId)) {
        return { error: `Output mapping for "${token}" references an unknown column.` };
      }
      if (seenTokens.has(token)) {
        return { error: `"${token}" cannot be used more than once (already the match token or another output).` };
      }
      seenTokens.add(token);
      outputs.push({ output_token: token, output_column_id: columnId });
    }
    if (outputs.length === 0) {
      return { error: "At least one output token mapping is required to enable auto-fill." };
    }
  }

  const { error: updateError } = await supabase
    .from("client_metrics_tables")
    .update({
      autofill_enabled: enabled,
      template_id: enabled ? templateId : null,
      match_token: enabled ? matchToken : null,
      match_column_id: enabled ? matchColumnId : null,
    })
    .eq("id", tableId)
    .eq("client_id", clientId);

  if (updateError) return { error: updateError.message };

  const { error: deleteError } = await supabase
    .from("client_metrics_output_mappings")
    .delete()
    .eq("table_id", tableId);

  if (deleteError) return { error: deleteError.message };

  if (outputs.length > 0) {
    const { error: insertError } = await supabase.from("client_metrics_output_mappings").insert(
      outputs.map((o) => ({ table_id: tableId, ...o }))
    );
    if (insertError) return { error: insertError.message };
  }

  await auditLog("client_metrics_table.autofill_updated", actor.id, actor.email, {
    orgId: clientId,
    metadata: { tableId, enabled, matchToken, outputCount: outputs.length },
  });

  revalidatePath(`/admin/clients/${clientId}`);
  return {};
}
