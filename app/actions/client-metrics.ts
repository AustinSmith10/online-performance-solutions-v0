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
}

export interface MetricsRow {
  id: string;
  table_id: string;
  data: Record<string, string | number | null>;
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

// ---------------------------------------------------------------------------
// Table CRUD
// ---------------------------------------------------------------------------

export type CreateTableState = { error?: string };

export async function createMetricsTable(
  clientId: string,
  _prev: CreateTableState,
  formData: FormData
): Promise<CreateTableState> {
  const actor = await requireRole("super_admin", "admin");

  const name = (formData.get("name") as string | null)?.trim();
  if (!name) return { error: "Table name is required." };

  const columnNames = formData.getAll("column_name") as string[];
  const columnTypes = formData.getAll("column_type") as string[];

  const columns: { name: string; data_type: ColumnDataType }[] = [];
  for (let i = 0; i < columnNames.length; i++) {
    const colName = columnNames[i]?.trim();
    const colType = columnTypes[i];
    if (!colName) continue;
    if (!VALID_TYPES.includes(colType as ColumnDataType)) {
      return { error: `Invalid column type for "${colName}".` };
    }
    columns.push({ name: colName, data_type: colType as ColumnDataType });
  }

  if (columns.length === 0) return { error: "At least one column is required." };

  const seen = new Set<string>();
  for (const col of columns) {
    const key = col.name.toLowerCase();
    if (seen.has(key)) return { error: `Duplicate column name "${col.name}".` };
    seen.add(key);
  }

  const supabase = createAdminClient();

  const { data: table, error: tableError } = await supabase
    .from("client_metrics_tables")
    .insert({ client_id: clientId, name })
    .select("id")
    .single();

  if (tableError || !table) return { error: `Failed to create table: ${tableError?.message}` };

  const { error: columnsError } = await supabase.from("client_metrics_columns").insert(
    columns.map((col, index) => ({
      table_id: table.id as string,
      name: col.name,
      data_type: col.data_type,
      position: index,
    }))
  );

  if (columnsError) {
    await supabase.from("client_metrics_tables").delete().eq("id", table.id as string);
    return { error: `Failed to save columns: ${columnsError.message}` };
  }

  await auditLog("client_metrics_table.created", actor.id, actor.email, {
    orgId: clientId,
    metadata: { tableId: table.id, name, columnCount: columns.length },
  });

  revalidatePath(`/admin/clients/${clientId}`);
  return {};
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

  const supabase = createAdminClient();

  const { data: columns } = await supabase
    .from("client_metrics_columns")
    .select("id, name, data_type")
    .eq("table_id", tableId)
    .order("position", { ascending: true });

  if (!columns || columns.length === 0) return { error: "Table has no columns defined." };

  let sheetRows: Record<string, unknown>[];
  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    sheetRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  } catch {
    return { error: "Could not parse the Excel file. Ensure it is a valid .xlsx/.xls spreadsheet." };
  }

  if (sheetRows.length === 0) return { error: "The spreadsheet has no data rows." };

  // Match spreadsheet headers to defined columns, case-insensitively.
  const headerKeys = Object.keys(sheetRows[0]);
  const columnByHeader = new Map<string, (typeof columns)[number]>();
  for (const col of columns) {
    const match = headerKeys.find((h) => h.trim().toLowerCase() === col.name.trim().toLowerCase());
    if (match) columnByHeader.set(match, col);
  }

  const unmatchedColumns = columns.filter(
    (col) => ![...columnByHeader.values()].some((c) => c.id === col.id)
  );
  if (unmatchedColumns.length === columns.length) {
    return {
      error: `No spreadsheet headers matched this table's columns (expected: ${columns
        .map((c) => c.name)
        .join(", ")}).`,
    };
  }

  const rowErrors: ImportRowError[] = [];
  const rowsToInsert: Record<string, string | number | null>[] = [];

  sheetRows.forEach((sheetRow, index) => {
    const rowData: Record<string, string | number | null> = {};
    for (const [header, col] of columnByHeader.entries()) {
      const raw = sheetRow[header];
      const rawStr = raw === null || raw === undefined ? "" : String(raw);
      if (rawStr.trim() === "") {
        rowData[col.id as string] = null;
        continue;
      }
      const { value, error } = validateCellValue(rawStr, col.data_type as ColumnDataType);
      if (error) {
        rowErrors.push({ row: index + 2, column: col.name, message: `${rawStr} ${error}` });
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
