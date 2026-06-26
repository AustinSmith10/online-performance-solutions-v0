"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { auditLog } from "@/lib/audit/log";
import { extractPlaceholderTokens } from "@/lib/documents/validator";
import { detectSource, isKnownToken } from "@/lib/documents/field-keys";

export type UploadTemplateState = { error?: string };

export async function uploadTemplate(
  _prev: UploadTemplateState,
  formData: FormData
): Promise<UploadTemplateState> {
  const actor = await requireRole("super_admin", "admin");

  const orgId = (formData.get("org_id") as string | null)?.trim();
  if (!orgId) return { error: "Organisation is required." };

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
    org_id: orgId,
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
    .select("org_id, name")
    .eq("id", templateId)
    .maybeSingle();

  if (tmplErr || !template) return { error: "Template not found." };

  const { error } = await supabase
    .from("templates")
    .update({ status: "active" })
    .eq("id", templateId);

  if (error) return { error: error.message };

  await auditLog("template.activated", actor.id, actor.email, {
    orgId: template.org_id as string,
    metadata: { templateId, name: template.name },
  });

  revalidatePath(`/admin/templates/${templateId}`);
  revalidatePath(`/admin/templates`);
  revalidatePath(`/admin/organisations/${template.org_id}`);
  return {};
}

export type DeactivateTemplateState = { error?: string };

export async function deactivateTemplate(
  templateId: string
): Promise<DeactivateTemplateState> {
  const actor = await requireRole("super_admin", "admin");
  const supabase = createAdminClient();

  const { data: template, error: tmplErr } = await supabase
    .from("templates")
    .select("org_id, name")
    .eq("id", templateId)
    .maybeSingle();

  if (tmplErr || !template) return { error: "Template not found." };

  const { error } = await supabase
    .from("templates")
    .update({ status: "inactive" })
    .eq("id", templateId);

  if (error) return { error: error.message };

  await auditLog("template.deactivated", actor.id, actor.email, {
    orgId: template.org_id as string,
    metadata: { templateId, name: template.name },
  });

  revalidatePath(`/admin/templates/${templateId}`);
  revalidatePath(`/admin/templates`);
  revalidatePath(`/admin/organisations/${template.org_id}`);
  return {};
}

export type DeleteTemplateState = { error?: string };

export async function deleteTemplate(
  templateId: string
): Promise<DeleteTemplateState> {
  const actor = await requireRole("super_admin", "admin");
  const supabase = createAdminClient();

  const { data: template, error: tmplErr } = await supabase
    .from("templates")
    .select("org_id, name, storage_path")
    .eq("id", templateId)
    .maybeSingle();

  if (tmplErr || !template) return { error: "Template not found." };

  // Delete DB record (cascades to template_field_mappings)
  const { error: deleteErr } = await supabase
    .from("templates")
    .delete()
    .eq("id", templateId);

  if (deleteErr) return { error: deleteErr.message };

  // Best-effort storage cleanup
  await supabase.storage
    .from("templates")
    .remove([template.storage_path as string]);

  await auditLog("template.deleted", actor.id, actor.email, {
    orgId: template.org_id as string,
    metadata: { templateId, name: template.name },
  });

  revalidatePath("/admin/templates");
  revalidatePath(`/admin/organisations/${template.org_id}`);
  redirect("/admin/templates");
}

export type ReuploadTemplateState = { error?: string };

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
    .select("org_id, name, storage_path")
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

  const newStoragePath = `${template.org_id}/${templateId}/${file.name}`;

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

  // Replace all token mappings
  await supabase
    .from("template_field_mappings")
    .delete()
    .eq("template_id", templateId);

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

    if (mappingError) return { error: `Mappings could not be saved: ${mappingError.message}` };
  }

  await auditLog("template.reuploaded", actor.id, actor.email, {
    orgId: template.org_id as string,
    metadata: { templateId, name: template.name, tokenCount: tokens.length },
  });

  revalidatePath(`/admin/templates/${templateId}`);
  return {};
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
    .select("org_id, name")
    .eq("id", templateId)
    .maybeSingle();

  const updates: Array<{
    placeholder_token: string;
    display_label: string;
    extraction_hint: string | null;
    is_required: boolean;
    sort_order: number;
  }> = [];

  for (const [key, rawVal] of formData.entries()) {
    if (key.startsWith("label_")) {
      const token = key.slice(6);
      const hint = (formData.get(`hint_${token}`) as string | null)?.trim() || null;
      const label = (rawVal as string).trim();
      const is_required = formData.get(`required_${token}`) === "on";
      const sort_order = parseInt((formData.get(`order_${token}`) as string | null) ?? "0", 10) || 0;
      if (token) updates.push({ placeholder_token: token, display_label: label, extraction_hint: hint, is_required, sort_order });
    }
  }

  for (const { placeholder_token, display_label, extraction_hint, is_required, sort_order } of updates) {
    const { error } = await supabase
      .from("template_field_mappings")
      .update({ display_label, extraction_hint, is_required, sort_order })
      .eq("template_id", templateId)
      .eq("placeholder_token", placeholder_token);

    if (error) return { error: `Failed to save label for ${placeholder_token}: ${error.message}` };
  }

  if (template) {
    await auditLog("template.mapping_updated", actor.id, actor.email, {
      orgId: template.org_id as string,
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

  if (!token) return { error: "Token name is required." };
  if (!token.startsWith("EXTRACT_")) return { error: "Extraction-only tokens must start with EXTRACT_." };
  if (!/^EXTRACT_[A-Z][A-Z0-9_]*$/.test(token)) return { error: "Token name must be EXTRACT_ followed by uppercase letters, digits, and underscores." };
  if (!label) return { error: "Display label is required." };
  if (!hint) return { error: "Extraction hint is required — Claude needs to know what to look for." };

  const supabase = createAdminClient();

  const { data: template } = await supabase
    .from("templates")
    .select("org_id, name")
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
  });

  if (error) {
    if (error.code === "23505") return { error: `Token {${token}} already exists on this template.` };
    return { error: error.message };
  }

  if (template) {
    await auditLog("template.token_added", actor.id, actor.email, {
      orgId: template.org_id as string,
      metadata: { templateId, name: template.name, token },
    });
  }

  revalidatePath(`/admin/templates/${templateId}`);
  return {};
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
    .select("org_id, name")
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
      orgId: template.org_id as string,
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

  if (!label) return { error: "Display label is required." };
  if (!hint) return { error: "Extraction hint is required." };

  const supabase = createAdminClient();

  const { error } = await supabase
    .from("template_field_mappings")
    .update({ display_label: label, extraction_hint: hint, is_required })
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
    org: (formData.get("label_org") as string | null)?.trim() || "Organisation details",
    client: (formData.get("label_client") as string | null)?.trim() || "Additional information",
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
    .select("org_id, name")
    .eq("id", templateId)
    .maybeSingle();

  if (tmplErr || !template) return { error: "Template not found." };

  const { error } = await supabase
    .from("templates")
    .update({ status: "active" })
    .eq("id", templateId);

  if (error) return { error: error.message };

  await auditLog("template.reactivated", actor.id, actor.email, {
    orgId: template.org_id as string,
    metadata: { templateId, name: template.name },
  });

  revalidatePath(`/admin/templates/${templateId}`);
  revalidatePath(`/admin/templates`);
  return {};
}
