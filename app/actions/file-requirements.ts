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
