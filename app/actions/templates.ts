"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { auditLog } from "@/lib/audit/log";
import { extractPlaceholderTokens } from "@/lib/documents/validator";
import { detectSource, isKnownToken } from "@/lib/documents/field-keys";
import type { ComparisonMode } from "@/lib/documents/compare-candidates";

const COMPARISON_MODES = new Set<ComparisonMode>(["exact", "normalized", "semantic"]);
function parseComparisonMode(v: FormDataEntryValue | null): ComparisonMode {
  return COMPARISON_MODES.has(v as ComparisonMode) ? (v as ComparisonMode) : "exact";
}

export type UploadTemplateState = { error?: string };

export async function uploadTemplate(
  _prev: UploadTemplateState,
  formData: FormData
): Promise<UploadTemplateState> {
  const actor = await requireRole("super_admin", "admin");

  const orgId = (formData.get("client_id") as string | null)?.trim();
  if (!orgId) return { error: "Client is required." };

  const file = formData.get("file") as File | null;
  const name = (formData.get("name") as string | null)?.trim();

  if (!name) return { error: "Template name is required." };
  if (!file || file.size === 0) return { error: "A .docx file is required." };
  if (!file.name.endsWith(".docx")) return { error: "Only .docx files are supported." };
  if (file.size > 20 * 1024 * 1024) return { error: "File must be under 20 MB." };

  const supabase = createAdminClient();
  const templateId = crypto.randomUUID();
  const storagePath = `${orgId}/${templateId}/${file.name}`;

  const fileBuffer = await file.arrayBuffer();

  let tokens: string[];
  try {
    tokens = await extractPlaceholderTokens(fileBuffer);
  } catch {
    return { error: "Could not parse the .docx file. Ensure it is a valid Word document." };
  }

  const { error: uploadError } = await supabase.storage
    .from("templates")
    .upload(storagePath, fileBuffer, {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

  if (uploadError) return { error: `Upload failed: ${uploadError.message}` };

  const { error: insertError } = await supabase.from("templates").insert({
    id: templateId,
    client_id: orgId,
    name,
    storage_path: storagePath,
    status: "draft",
    created_by: actor.id,
  });

  if (insertError) {
    await supabase.storage.from("templates").remove([storagePath]);
    return { error: `Failed to save template: ${insertError.message}` };
  }

  if (tokens.length > 0) {
    const mappingRows = tokens.map((token) => ({
      template_id: templateId,
      placeholder_token: token,
      field_key: detectSource(token),
      is_mapped: isKnownToken(token),
    }));
    const { error: mappingError } = await supabase
      .from("template_field_mappings")
      .insert(mappingRows);

    if (mappingError) {
      return { error: `Mappings could not be saved: ${mappingError.message}` };
    }
  }

  await auditLog("template.uploaded", actor.id, actor.email, {
    orgId,
    metadata: { templateId, name, tokenCount: tokens.length },
  });

  revalidatePath(`/admin/templates`);
  redirect(`/admin/templates/${templateId}`);
}

export type ActivateTemplateState = { error?: string };

export async function activateTemplate(
  templateId: string
): Promise<ActivateTemplateState> {
  const actor = await requireRole("super_admin", "admin");
  const supabase = createAdminClient();

  const { data: mappings, error: mapErr } = await supabase
    .from("template_field_mappings")
    .select("placeholder_token, field_key, is_mapped, display_label, extraction_hint")
    .eq("template_id", templateId);

  if (mapErr) return { error: mapErr.message };

  const unknown = (mappings ?? []).filter((m) => !m.is_mapped);
  if (unknown.length > 0) {
    return {
      error: `Cannot activate: ${unknown.length} token(s) with unrecognised prefix — ${unknown.map((m) => `{${m.placeholder_token}}`).join(", ")}.`,
    };
  }

  const missingLabel = (mappings ?? []).filter((m) => !m.display_label?.trim());
  if (missingLabel.length > 0) {
    return {
      error: `Cannot activate: display label missing for ${missingLabel.map((m) => `{${m.placeholder_token}}`).join(", ")}.`,
    };
  }

  const missingHint = (mappings ?? []).filter(
    (m) => m.field_key === "extract" && !m.extraction_hint?.trim()
  );
  if (missingHint.length > 0) {
    return {
      error: `Cannot activate: extraction hint missing for ${missingHint.map((m) => `{${m.placeholder_token}}`).join(", ")}.`,
    };
  }

  const { data: template, error: tmplErr } = await supabase
    .from("templates")
    .select("client_id, name")
    .eq("id", templateId)
    .maybeSingle();

  if (tmplErr || !template) return { error: "Template not found." };

  const { error } = await supabase
    .from("templates")
    .update({ status: "active" })
    .eq("id", templateId);

  if (error) return { error: error.message };

  await auditLog("template.activated", actor.id, actor.email, {
    orgId: template.client_id as string,
    metadata: { templateId, name: template.name },
  });

  revalidatePath(`/admin/templates/${templateId}`);
  revalidatePath(`/admin/templates`);
  revalidatePath(`/admin/clients/${template.client_id}`);
  redirect(`/admin/templates/${templateId}?activated=1`);
}

export type DeactivateTemplateState = { error?: string };

export async function deactivateTemplate(
  templateId: string
): Promise<DeactivateTemplateState> {
  const actor = await requireRole("super_admin", "admin");
  const supabase = createAdminClient();

  const { data: template, error: tmplErr } = await supabase
    .from("templates")
    .select("client_id, name")
    .eq("id", templateId)
    .maybeSingle();

  if (tmplErr || !template) return { error: "Template not found." };

  const { error } = await supabase
    .from("templates")
    .update({ status: "inactive" })
    .eq("id", templateId);

  if (error) return { error: error.message };

  await auditLog("template.deactivated", actor.id, actor.email, {
    orgId: template.client_id as string,
    metadata: { templateId, name: template.name },
  });

  revalidatePath(`/admin/templates/${templateId}`);
  revalidatePath(`/admin/templates`);
  revalidatePath(`/admin/clients/${template.client_id}`);
  redirect(`/admin/templates/${templateId}?deactivated=1`);
}

export type DeleteTemplateState = { error?: string };

export async function deleteTemplate(
  templateId: string
): Promise<DeleteTemplateState> {
  const actor = await requireRole("super_admin", "admin");
  const supabase = createAdminClient();

  const { data: template, error: tmplErr } = await supabase
    .from("templates")
    .select("client_id, name")
    .eq("id", templateId)
    .is("deleted_at", null)
    .maybeSingle();

  if (tmplErr || !template) return { error: "Template not found or already deleted." };

  const { error } = await supabase
    .from("templates")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", templateId);

  if (error) return { error: error.message };

  await auditLog("template.soft_deleted", actor.id, actor.email, {
    orgId: template.client_id as string,
    metadata: { templateId, name: template.name },
  });

  revalidatePath("/admin/templates");
  revalidatePath(`/admin/clients/${template.client_id}`);
  revalidatePath("/admin/recovery");
  redirect("/admin/templates?deleted=1");
}

export type RestoreTemplateState = { error?: string };

export async function restoreTemplate(
  templateId: string,
  _prev: RestoreTemplateState,
  _formData: FormData
): Promise<RestoreTemplateState> {
  const actor = await requireRole("super_admin", "admin");
  const supabase = createAdminClient();

  const { data: template, error: tmplErr } = await supabase
    .from("templates")
    .select("client_id, name")
    .eq("id", templateId)
    .not("deleted_at", "is", null)
    .maybeSingle();

  if (tmplErr || !template) return { error: "Template not found in recovery bin." };

  const { error } = await supabase
    .from("templates")
    .update({ deleted_at: null })
    .eq("id", templateId);

  if (error) return { error: error.message };

  await auditLog("template.restored", actor.id, actor.email, {
    orgId: template.client_id as string,
    metadata: { templateId, name: template.name },
  });

  revalidatePath("/admin/templates");
  revalidatePath(`/admin/clients/${template.client_id}`);
  revalidatePath("/admin/recovery");
  return {};
}

export type ReuploadConflict = { token: string; tableName: string };

// A reupload only removes mappings for tokens that disappeared from the new
// .docx (in_template=false extraction-only tokens are never touched — they
// aren't sourced from the document at all). client_metrics_tables/output_mappings
// reference tokens by plain text with no FK, so a renamed/removed token silently
// orphans any auto-fill config that pointed at it — this checks for that
// before the removal happens.
async function findAutofillConflicts(
  supabase: ReturnType<typeof createAdminClient>,
  templateId: string,
  clientId: string,
  newTokens: string[]
): Promise<ReuploadConflict[]> {
  const { data: oldMappings } = await supabase
    .from("template_field_mappings")
    .select("placeholder_token, in_template")
    .eq("template_id", templateId);

  const newTokenSet = new Set(newTokens);
  const removedTokens = new Set(
    (oldMappings ?? [])
      .filter((r) => r.in_template !== false)
      .map((r) => r.placeholder_token as string)
      .filter((t) => !newTokenSet.has(t))
  );
  if (removedTokens.size === 0) return [];

  const { data: tables } = await supabase
    .from("client_metrics_tables")
    .select("id, name, match_token")
    .eq("client_id", clientId);

  const tableById = new Map((tables ?? []).map((t) => [t.id as string, t.name as string]));
  const conflicts: ReuploadConflict[] = [];

  for (const t of tables ?? []) {
    if (t.match_token && removedTokens.has(t.match_token as string)) {
      conflicts.push({ token: t.match_token as string, tableName: t.name as string });
    }
  }

  const tableIds = [...tableById.keys()];
  if (tableIds.length > 0) {
    const { data: outputMappings } = await supabase
      .from("client_metrics_output_mappings")
      .select("table_id, output_token")
      .in("table_id", tableIds);

    for (const om of outputMappings ?? []) {
      const token = om.output_token as string;
      if (removedTokens.has(token)) {
        conflicts.push({ token, tableName: tableById.get(om.table_id as string) ?? "Unknown table" });
      }
    }
  }

  return conflicts;
}

export type ReuploadTemplateState = {
  error?: string;
  success?: boolean;
  conflicts?: ReuploadConflict[];
};

export async function reuploadTemplate(
  templateId: string,
  _prev: ReuploadTemplateState,
  formData: FormData
): Promise<ReuploadTemplateState> {
  const actor = await requireRole("super_admin", "admin");

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "A .docx file is required." };
  if (!file.name.endsWith(".docx")) return { error: "Only .docx files are supported." };
  if (file.size > 20 * 1024 * 1024) return { error: "File must be under 20 MB." };

  const supabase = createAdminClient();

  const { data: template, error: tmplErr } = await supabase
    .from("templates")
    .select("client_id, name, storage_path")
    .eq("id", templateId)
    .maybeSingle();

  if (tmplErr || !template) return { error: "Template not found." };

  const fileBuffer = await file.arrayBuffer();

  let tokens: string[];
  try {
    tokens = await extractPlaceholderTokens(fileBuffer);
  } catch {
    return { error: "Could not parse the .docx file. Ensure it is a valid Word document." };
  }

  const confirmed = formData.get("confirmed") === "1";

  if (!confirmed) {
    const conflicts = await findAutofillConflicts(supabase, templateId, template.client_id as string, tokens);
    if (conflicts.length > 0) return { conflicts };
  }

  const newStoragePath = `${template.client_id}/${templateId}/${file.name}`;

  // Remove old file then upload new one
  await supabase.storage.from("templates").remove([template.storage_path as string]);

  const { error: uploadError } = await supabase.storage
    .from("templates")
    .upload(newStoragePath, fileBuffer, {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: true,
    });

  if (uploadError) return { error: `Upload failed: ${uploadError.message}` };

  // Reset template to draft with new storage path
  const { error: updateErr } = await supabase
    .from("templates")
    .update({ storage_path: newStoragePath, status: "draft" })
    .eq("id", templateId);

  if (updateErr) return { error: updateErr.message };

  // Reconcile token mappings against the new document: tokens that still
  // exist keep their row untouched (display_label, extraction_hint,
  // comparison_mode, is_required, sort_order all survive), tokens that
  // disappeared get removed, and only genuinely new tokens get inserted.
  // Extraction-only tokens (in_template=false) aren't sourced from the
  // .docx at all, so they're excluded from this reconciliation entirely.
  const { data: existingMappings, error: existingErr } = await supabase
    .from("template_field_mappings")
    .select("id, placeholder_token, in_template, sort_order")
    .eq("template_id", templateId);

  if (existingErr) return { error: existingErr.message };

  const docRows = (existingMappings ?? []).filter((m) => m.in_template !== false);
  const newTokenSet = new Set(tokens);
  const existingTokenSet = new Set(docRows.map((m) => m.placeholder_token as string));

  const removedRowIds = docRows
    .filter((m) => !newTokenSet.has(m.placeholder_token as string))
    .map((m) => m.id as string);
  const addedTokens = tokens.filter((t) => !existingTokenSet.has(t));

  if (removedRowIds.length > 0) {
    const { error: deleteErr } = await supabase
      .from("template_field_mappings")
      .delete()
      .in("id", removedRowIds);

    if (deleteErr) return { error: deleteErr.message };
  }

  if (addedTokens.length > 0) {
    const maxSortOrder = docRows.reduce((max, m) => Math.max(max, (m.sort_order as number) ?? 0), 0);
    const mappingRows = addedTokens.map((token, i) => ({
      template_id: templateId,
      placeholder_token: token,
      field_key: detectSource(token),
      is_mapped: isKnownToken(token),
      sort_order: maxSortOrder + i + 1,
    }));
    const { error: mappingError } = await supabase
      .from("template_field_mappings")
      .insert(mappingRows);

    if (mappingError) return { error: `Mappings could not be saved: ${mappingError.message}` };
  }

  await auditLog("template.reuploaded", actor.id, actor.email, {
    orgId: template.client_id as string,
    metadata: { templateId, name: template.name, tokenCount: tokens.length },
  });

  revalidatePath(`/admin/templates/${templateId}`);
  return { success: true };
}

export type UpdateTokenLabelsState = { error?: string; success?: boolean };

export async function updateTokenLabels(
  templateId: string,
  _prev: UpdateTokenLabelsState,
  formData: FormData
): Promise<UpdateTokenLabelsState> {
  const actor = await requireRole("super_admin", "admin");
  const supabase = createAdminClient();

  const { data: template } = await supabase
    .from("templates")
    .select("client_id, name")
    .eq("id", templateId)
    .maybeSingle();

  const updates: Array<{
    placeholder_token: string;
    display_label: string;
    extraction_hint: string | null;
    is_required: boolean;
    sort_order: number;
    comparison_mode: ComparisonMode;
  }> = [];

  for (const [key, rawVal] of formData.entries()) {
    if (key.startsWith("label_")) {
      const token = key.slice(6);
      const hint = (formData.get(`hint_${token}`) as string | null)?.trim() || null;
      const label = (rawVal as string).trim();
      const is_required = formData.get(`required_${token}`) === "on";
      const sort_order = parseInt((formData.get(`order_${token}`) as string | null) ?? "0", 10) || 0;
      const comparison_mode = parseComparisonMode(formData.get(`comparison_mode_${token}`));
      if (token) updates.push({ placeholder_token: token, display_label: label, extraction_hint: hint, is_required, sort_order, comparison_mode });
    }
  }

  for (const { placeholder_token, display_label, extraction_hint, is_required, sort_order, comparison_mode } of updates) {
    const { error } = await supabase
      .from("template_field_mappings")
      .update({ display_label, extraction_hint, is_required, sort_order, comparison_mode })
      .eq("template_id", templateId)
      .eq("placeholder_token", placeholder_token);

    if (error) return { error: `Failed to save label for ${placeholder_token}: ${error.message}` };
  }

  if (template) {
    await auditLog("template.mapping_updated", actor.id, actor.email, {
      orgId: template.client_id as string,
      metadata: { templateId, name: template.name, tokenCount: updates.length },
    });
  }

  revalidatePath(`/admin/templates/${templateId}`);
  return { success: true };
}

export type AddExtractionTokenState = { error?: string };

export async function addExtractionOnlyToken(
  templateId: string,
  _prev: AddExtractionTokenState,
  formData: FormData
): Promise<AddExtractionTokenState> {
  const actor = await requireRole("super_admin", "admin");

  const token = (formData.get("token") as string | null)?.trim().toUpperCase();
  const label = (formData.get("label") as string | null)?.trim();
  const hint = (formData.get("hint") as string | null)?.trim();
  const is_required = formData.get("is_required") === "on";
  const comparison_mode = parseComparisonMode(formData.get("comparison_mode"));

  if (!token) return { error: "Token name is required." };
  if (!token.startsWith("EXTRACT_")) return { error: "Extraction-only tokens must start with EXTRACT_." };
  if (!/^EXTRACT_[A-Z][A-Z0-9_]*$/.test(token)) return { error: "Token name must be EXTRACT_ followed by uppercase letters, digits, and underscores." };
  if (!label) return { error: "Display label is required." };
  if (!hint) return { error: "Extraction hint is required — Claude needs to know what to look for." };

  const supabase = createAdminClient();

  const { data: template } = await supabase
    .from("templates")
    .select("client_id, name")
    .eq("id", templateId)
    .maybeSingle();

  const { error } = await supabase.from("template_field_mappings").insert({
    template_id: templateId,
    placeholder_token: token,
    field_key: "extract",
    is_mapped: true,
    in_template: false,
    display_label: label,
    extraction_hint: hint,
    is_required,
    sort_order: 0,
    comparison_mode,
  });

  if (error) {
    if (error.code === "23505") return { error: `Token {${token}} already exists on this template.` };
    return { error: error.message };
  }

  if (template) {
    await auditLog("template.token_added", actor.id, actor.email, {
      orgId: template.client_id as string,
      metadata: { templateId, name: template.name, token },
    });
  }

  revalidatePath(`/admin/templates/${templateId}`);
  redirect(`/admin/templates/${templateId}?token_added=${encodeURIComponent(token)}`);
}

export type DeleteExtractionTokenState = { error?: string };

export async function deleteExtractionToken(
  templateId: string,
  token: string
): Promise<DeleteExtractionTokenState> {
  const actor = await requireRole("super_admin", "admin");
  const supabase = createAdminClient();

  const { data: template } = await supabase
    .from("templates")
    .select("client_id, name")
    .eq("id", templateId)
    .maybeSingle();

  const { error } = await supabase
    .from("template_field_mappings")
    .delete()
    .eq("template_id", templateId)
    .eq("placeholder_token", token)
    .eq("in_template", false);

  if (error) return { error: error.message };

  if (template) {
    await auditLog("template.token_deleted", actor.id, actor.email, {
      orgId: template.client_id as string,
      metadata: { templateId, name: template.name, token },
    });
  }

  revalidatePath(`/admin/templates/${templateId}`);
  return {};
}

export type UpdateExtractionTokenState = { error?: string; success?: boolean };

export async function updateExtractionToken(
  templateId: string,
  rowId: string,
  _prev: UpdateExtractionTokenState,
  formData: FormData
): Promise<UpdateExtractionTokenState> {
  await requireRole("super_admin", "admin");

  const label = (formData.get("label") as string | null)?.trim();
  const hint = (formData.get("hint") as string | null)?.trim();
  const is_required = formData.get("is_required") === "on";
  const comparison_mode = parseComparisonMode(formData.get("comparison_mode"));

  if (!label) return { error: "Display label is required." };
  if (!hint) return { error: "Extraction hint is required." };

  const supabase = createAdminClient();

  const { error } = await supabase
    .from("template_field_mappings")
    .update({ display_label: label, extraction_hint: hint, is_required, comparison_mode })
    .eq("id", rowId)
    .eq("template_id", templateId)
    .eq("in_template", false);

  if (error) return { error: error.message };

  revalidatePath(`/admin/templates/${templateId}`);
  return { success: true };
}

export type ReactivateTemplateState = { error?: string };

export type UpdateSectionLabelsState = { error?: string; success?: boolean };

export async function updateSectionLabels(
  templateId: string,
  _prev: UpdateSectionLabelsState,
  formData: FormData
): Promise<UpdateSectionLabelsState> {
  await requireRole("super_admin", "admin");
  const supabase = createAdminClient();

  const labels = {
    extract: (formData.get("label_extract") as string | null)?.trim() || "Extracted from your documents",
    extractDesc: (formData.get("label_extract_desc") as string | null)?.trim() || "",
    trusteeDesc: (formData.get("label_trustee_desc") as string | null)?.trim() || "",
    org: (formData.get("label_org") as string | null)?.trim() || "Client details",
    orgDesc: (formData.get("label_org_desc") as string | null)?.trim() || "",
    client: (formData.get("label_client") as string | null)?.trim() || "Additional information",
    clientDesc: (formData.get("label_client_desc") as string | null)?.trim() || "",
  };

  const { error } = await supabase
    .from("templates")
    .update({ section_labels: labels })
    .eq("id", templateId);

  if (error) return { error: error.message };

  revalidatePath(`/admin/templates/${templateId}`);
  return { success: true };
}

export async function reactivateTemplate(
  templateId: string
): Promise<ReactivateTemplateState> {
  const actor = await requireRole("super_admin", "admin");
  const supabase = createAdminClient();

  const { data: template, error: tmplErr } = await supabase
    .from("templates")
    .select("client_id, name")
    .eq("id", templateId)
    .maybeSingle();

  if (tmplErr || !template) return { error: "Template not found." };

  const { error } = await supabase
    .from("templates")
    .update({ status: "active" })
    .eq("id", templateId);

  if (error) return { error: error.message };

  await auditLog("template.reactivated", actor.id, actor.email, {
    orgId: template.client_id as string,
    metadata: { templateId, name: template.name },
  });

  revalidatePath(`/admin/templates/${templateId}`);
  revalidatePath(`/admin/templates`);
  redirect(`/admin/templates/${templateId}?activated=1`);
}

export type UpdateSingleTokenState = { error?: string; success?: boolean };

export async function updateSingleTokenLabel(
  templateId: string,
  placeholderToken: string,
  _prev: UpdateSingleTokenState,
  formData: FormData
): Promise<UpdateSingleTokenState> {
  await requireRole("super_admin", "admin");

  const label = (formData.get("label") as string | null)?.trim();
  if (!label) return { error: "Display label is required." };

  const hint = (formData.get("hint") as string | null)?.trim() || null;
  const is_required = formData.get("is_required") === "on";
  const comparison_mode = parseComparisonMode(formData.get("comparison_mode"));

  const supabase = createAdminClient();

  const { error } = await supabase
    .from("template_field_mappings")
    .update({ display_label: label, extraction_hint: hint, is_required, comparison_mode })
    .eq("template_id", templateId)
    .eq("placeholder_token", placeholderToken)
    .eq("in_template", true);

  if (error) return { error: error.message };

  revalidatePath(`/admin/templates/${templateId}`);
  return { success: true };
}

export async function updateTokenOrder(
  templateId: string,
  orders: { placeholder_token: string; sort_order: number }[]
): Promise<void> {
  await requireRole("super_admin", "admin");
  const supabase = createAdminClient();

  for (const { placeholder_token, sort_order } of orders) {
    await supabase
      .from("template_field_mappings")
      .update({ sort_order })
      .eq("template_id", templateId)
      .eq("placeholder_token", placeholder_token)
      .eq("in_template", true);
  }

  revalidatePath(`/admin/templates/${templateId}`);
}

export async function updateSingleSectionLabel(
  templateId: string,
  _prev: UpdateSectionLabelsState,
  formData: FormData
): Promise<UpdateSectionLabelsState> {
  await requireRole("super_admin", "admin");
  const supabase = createAdminClient();

  const { data, error: readErr } = await supabase
    .from("templates")
    .select("section_labels")
    .eq("id", templateId)
    .maybeSingle();

  if (readErr || !data) return { error: "Template not found." };

  const fieldMap: Record<string, string> = {
    label_extract: "extract",
    label_extract_desc: "extractDesc",
    label_trustee_desc: "trusteeDesc",
    label_org: "org",
    label_org_desc: "orgDesc",
    label_client: "client",
    label_client_desc: "clientDesc",
  };

  const updated = { ...((data.section_labels as Record<string, string>) ?? {}) };
  for (const [formKey, labelKey] of Object.entries(fieldMap)) {
    const val = formData.get(formKey);
    if (val !== null) updated[labelKey] = (val as string).trim();
  }

  const { error } = await supabase
    .from("templates")
    .update({ section_labels: updated })
    .eq("id", templateId);

  if (error) return { error: error.message };

  revalidatePath(`/admin/templates/${templateId}`);
  return { success: true };
}

export type UpdateClientProfileState = { error?: string; success?: boolean };

export async function updateClientProfile(
  templateId: string,
  _prev: UpdateClientProfileState,
  formData: FormData
): Promise<UpdateClientProfileState> {
  await requireRole("super_admin", "admin");
  const supabase = createAdminClient();

  const tokens: string[] = [];
  for (const key of formData.keys()) {
    if (key.startsWith("order_")) tokens.push(key.slice(6));
  }

  for (const token of tokens) {
    const client_sort_order = parseInt(formData.get(`order_${token}`) as string, 10) || 0;
    const client_visible = formData.get(`visible_${token}`) === "on";

    const { error } = await supabase
      .from("template_field_mappings")
      .update({ client_visible, client_sort_order })
      .eq("template_id", templateId)
      .eq("placeholder_token", token);

    if (error) return { error: error.message };
  }

  revalidatePath(`/admin/templates/${templateId}`);
  return { success: true };
}
