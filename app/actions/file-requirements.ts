"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";

export type FileRequirementState = {
  error?: string;
  success?: boolean;
  fieldErrors?: {
    name?: string[];
    slug?: string[];
    max_count?: string[];
    marker_page_count?: string[];
    marker_regex?: string[];
  };
};

// A blank line -> no markers configured (deterministic layer optional, #113).
function parseTextPatterns(raw: string): string[] | null {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.length > 0 ? lines : null;
}

function validatePageCountRange(minRaw: string, maxRaw: string): string[] {
  const min = minRaw.trim() ? parseInt(minRaw, 10) : null;
  const max = maxRaw.trim() ? parseInt(maxRaw, 10) : null;
  if (min != null && (isNaN(min) || min < 1)) return ["Min pages must be a positive number."];
  if (max != null && (isNaN(max) || max < 1)) return ["Max pages must be a positive number."];
  if (min != null && max != null && min > max) return ["Min pages cannot exceed max pages."];
  return [];
}

function validateRegex(raw: string): string[] {
  if (!raw.trim()) return [];
  try {
    new RegExp(raw);
    return [];
  } catch {
    return ["Not a valid regular expression."];
  }
}

function validateName(name: string): string[] {
  if (!name) return ["Name is required."];
  if (name.length > 100) return ["Name must be 100 characters or fewer."];
  return [];
}

function validateSlug(slug: string): string[] {
  if (!slug) return ["Identifier is required."];
  if (!/^[a-z0-9_]+$/.test(slug))
    return ["Lowercase letters, numbers and underscores only."];
  if (slug.length > 50) return ["Identifier must be 50 characters or fewer."];
  return [];
}

function validateMaxCount(raw: string): string[] {
  const n = parseInt(raw, 10);
  if (isNaN(n) || n < 1) return ["Max uploads must be at least 1."];
  if (n > 20) return ["Max uploads cannot exceed 20."];
  return [];
}

export async function createFileRequirement(
  templateId: string,
  _prev: FileRequirementState,
  formData: FormData
): Promise<FileRequirementState> {
  await requireRole("super_admin", "admin");

  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const slug = (formData.get("slug") as string | null)?.trim() ?? "";
  const maxRaw = formData.get("max_count") as string;
  const required = formData.get("required") === "on";
  const no_duplicates = formData.get("no_duplicates") === "on";
  const extraction = formData.get("extraction") === "on";
  const markerTextRaw = (formData.get("marker_text_patterns") as string | null) ?? "";
  const pageMinRaw = (formData.get("marker_page_count_min") as string | null) ?? "";
  const pageMaxRaw = (formData.get("marker_page_count_max") as string | null) ?? "";
  const markerRegexRaw = ((formData.get("marker_regex") as string | null) ?? "").trim();
  const aiJudgeHint = ((formData.get("ai_judge_hint") as string | null) ?? "").trim() || null;

  const nameErrors = validateName(name);
  const slugErrors = validateSlug(slug);
  const maxErrors = validateMaxCount(maxRaw);
  const pageCountErrors = validatePageCountRange(pageMinRaw, pageMaxRaw);
  const regexErrors = validateRegex(markerRegexRaw);

  if (nameErrors.length || slugErrors.length || maxErrors.length || pageCountErrors.length || regexErrors.length) {
    return {
      fieldErrors: {
        ...(nameErrors.length && { name: nameErrors }),
        ...(slugErrors.length && { slug: slugErrors }),
        ...(maxErrors.length && { max_count: maxErrors }),
        ...(pageCountErrors.length && { marker_page_count: pageCountErrors }),
        ...(regexErrors.length && { marker_regex: regexErrors }),
      },
    };
  }

  const max_count = parseInt(maxRaw, 10);
  const supabase = createAdminClient();

  const { data: last } = await supabase
    .from("file_requirements")
    .select("sort_order")
    .eq("template_id", templateId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sort_order = (last?.sort_order ?? 0) + 1;

  const { error } = await supabase.from("file_requirements").insert({
    template_id: templateId,
    name,
    slug,
    max_count,
    required,
    no_duplicates,
    extraction,
    sort_order,
    marker_text_patterns: parseTextPatterns(markerTextRaw),
    marker_page_count_min: pageMinRaw.trim() ? parseInt(pageMinRaw, 10) : null,
    marker_page_count_max: pageMaxRaw.trim() ? parseInt(pageMaxRaw, 10) : null,
    marker_regex: markerRegexRaw || null,
    ai_judge_hint: aiJudgeHint,
  });

  if (error) {
    if (error.code === "23505") {
      return { fieldErrors: { slug: ["This identifier is already used in this template."] } };
    }
    return { error: error.message };
  }

  revalidatePath(`/admin/templates/${templateId}`);
  return { success: true };
}

export async function updateFileRequirement(
  templateId: string,
  id: string,
  _prev: FileRequirementState,
  formData: FormData
): Promise<FileRequirementState> {
  await requireRole("super_admin", "admin");

  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const maxRaw = formData.get("max_count") as string;
  const required = formData.get("required") === "on";
  const no_duplicates = formData.get("no_duplicates") === "on";
  const extraction = formData.get("extraction") === "on";
  const markerTextRaw = (formData.get("marker_text_patterns") as string | null) ?? "";
  const pageMinRaw = (formData.get("marker_page_count_min") as string | null) ?? "";
  const pageMaxRaw = (formData.get("marker_page_count_max") as string | null) ?? "";
  const markerRegexRaw = ((formData.get("marker_regex") as string | null) ?? "").trim();
  const aiJudgeHint = ((formData.get("ai_judge_hint") as string | null) ?? "").trim() || null;

  const nameErrors = validateName(name);
  const maxErrors = validateMaxCount(maxRaw);
  const pageCountErrors = validatePageCountRange(pageMinRaw, pageMaxRaw);
  const regexErrors = validateRegex(markerRegexRaw);

  if (nameErrors.length || maxErrors.length || pageCountErrors.length || regexErrors.length) {
    return {
      fieldErrors: {
        ...(nameErrors.length && { name: nameErrors }),
        ...(maxErrors.length && { max_count: maxErrors }),
        ...(pageCountErrors.length && { marker_page_count: pageCountErrors }),
        ...(regexErrors.length && { marker_regex: regexErrors }),
      },
    };
  }

  const max_count = parseInt(maxRaw, 10);
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("file_requirements")
    .update({
      name,
      max_count,
      required,
      no_duplicates,
      extraction,
      marker_text_patterns: parseTextPatterns(markerTextRaw),
      marker_page_count_min: pageMinRaw.trim() ? parseInt(pageMinRaw, 10) : null,
      marker_page_count_max: pageMaxRaw.trim() ? parseInt(pageMaxRaw, 10) : null,
      marker_regex: markerRegexRaw || null,
      ai_judge_hint: aiJudgeHint,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath(`/admin/templates/${templateId}`);
  return { success: true };
}

export async function deleteFileRequirement(
  templateId: string,
  id: string
): Promise<void> {
  await requireRole("super_admin", "admin");

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("file_requirements")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePath(`/admin/templates/${templateId}`);
}

// ─── Reference sample (#115) ────────────────────────────────────────────────
// Admin-only, human-and-AI-judge reference file per file_requirements row.
// Stored in the `templates` bucket (already private, admin-RLS-scoped) under
// its own namespace, mirroring reuploadTemplate's per-entity path convention
// (app/actions/templates.ts) — same old-object-cleanup-after-successful-swap
// ordering. PDF-only, matching the AI judge's own PDF-only scope (#113).

export type ReferenceSampleState = { error?: string; success?: boolean };

export async function uploadReferenceSample(
  templateId: string,
  requirementId: string,
  _prev: ReferenceSampleState,
  formData: FormData
): Promise<ReferenceSampleState> {
  await requireRole("super_admin", "admin");

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "A file is required." };
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return { error: "Only PDF files are supported for reference samples." };
  }
  if (file.size > 20 * 1024 * 1024) return { error: "File must be under 20 MB." };

  const supabase = createAdminClient();

  const { data: existing, error: fetchErr } = await supabase
    .from("file_requirements")
    .select("reference_sample_storage_path")
    .eq("id", requirementId)
    .eq("template_id", templateId)
    .maybeSingle();

  if (fetchErr || !existing) return { error: "File requirement not found." };

  const storagePath = `file-requirements/${requirementId}/${file.name}`;
  const fileBuffer = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from("templates")
    .upload(storagePath, fileBuffer, { contentType: "application/pdf", upsert: true });

  if (uploadError) return { error: `Upload failed: ${uploadError.message}` };

  const { error: updateError } = await supabase
    .from("file_requirements")
    .update({ reference_sample_storage_path: storagePath })
    .eq("id", requirementId);

  if (updateError) {
    await supabase.storage.from("templates").remove([storagePath]);
    return { error: updateError.message };
  }

  const oldPath = existing.reference_sample_storage_path as string | null;
  if (oldPath && oldPath !== storagePath) {
    await supabase.storage.from("templates").remove([oldPath]);
  }

  revalidatePath(`/admin/templates/${templateId}`);
  revalidatePath(`/admin/templates/${templateId}/file-requirements/${requirementId}`);
  return { success: true };
}

export async function removeReferenceSample(
  templateId: string,
  requirementId: string
): Promise<ReferenceSampleState> {
  await requireRole("super_admin", "admin");

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("file_requirements")
    .select("reference_sample_storage_path")
    .eq("id", requirementId)
    .eq("template_id", templateId)
    .maybeSingle();

  const oldPath = existing?.reference_sample_storage_path as string | null;
  if (oldPath) await supabase.storage.from("templates").remove([oldPath]);

  const { error } = await supabase
    .from("file_requirements")
    .update({ reference_sample_storage_path: null })
    .eq("id", requirementId);

  if (error) return { error: error.message };

  revalidatePath(`/admin/templates/${templateId}`);
  revalidatePath(`/admin/templates/${templateId}/file-requirements/${requirementId}`);
  return { success: true };
}
