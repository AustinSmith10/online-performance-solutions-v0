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
  };
};

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

  const nameErrors = validateName(name);
  const slugErrors = validateSlug(slug);
  const maxErrors = validateMaxCount(maxRaw);

  if (nameErrors.length || slugErrors.length || maxErrors.length) {
    return {
      fieldErrors: {
        ...(nameErrors.length && { name: nameErrors }),
        ...(slugErrors.length && { slug: slugErrors }),
        ...(maxErrors.length && { max_count: maxErrors }),
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

  const nameErrors = validateName(name);
  const maxErrors = validateMaxCount(maxRaw);

  if (nameErrors.length || maxErrors.length) {
    return {
      fieldErrors: {
        ...(nameErrors.length && { name: nameErrors }),
        ...(maxErrors.length && { max_count: maxErrors }),
      },
    };
  }

  const max_count = parseInt(maxRaw, 10);
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("file_requirements")
    .update({ name, max_count, required, no_duplicates, extraction })
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
