"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit/log";
import { canAssignTag, normaliseTagInput } from "@/lib/tags/permissions";

export interface TagActionState {
  error?: string;
  success?: boolean;
}

function revalidateTagSurfaces() {
  revalidatePath("/admin/tags");
  revalidatePath("/admin/settings");
  revalidatePath("/admin/stakeholders");
  revalidatePath("/admin/users");
  revalidatePath("/admin/projects/submit");
  revalidatePath("/ops/projects/submit");
}

// ─── Tag manager — super admin only (#211) ───────────────────────────────────

export async function createTag(_prev: TagActionState, formData: FormData): Promise<TagActionState> {
  const actor = await requireRole("super_admin");
  const input = normaliseTagInput(String(formData.get("name") ?? ""), String(formData.get("color") ?? ""));
  if ("error" in input) return { error: input.error };

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("tags")
    .insert({ name: input.name, color: input.color, created_by: actor.id })
    .select("id")
    .single();
  if (error) {
    return { error: error.code === "23505" ? "A tag with that name already exists." : "Could not create the tag." };
  }

  await auditLog("tag.created", actor.id, actor.email as string, {
    metadata: { tag_id: data.id, name: input.name, color: input.color },
  });
  revalidateTagSurfaces();
  return { success: true };
}

export async function updateTag(
  tagId: string,
  _prev: TagActionState,
  formData: FormData
): Promise<TagActionState> {
  const actor = await requireRole("super_admin");
  const input = normaliseTagInput(String(formData.get("name") ?? ""), String(formData.get("color") ?? ""));
  if ("error" in input) return { error: input.error };

  const supabase = createAdminClient();
  const { data: before } = await supabase.from("tags").select("name, color").eq("id", tagId).maybeSingle();
  if (!before) return { error: "Tag not found." };

  const { error } = await supabase
    .from("tags")
    .update({ name: input.name, color: input.color, updated_at: new Date().toISOString() })
    .eq("id", tagId);
  if (error) {
    return { error: error.code === "23505" ? "A tag with that name already exists." : "Could not save the tag." };
  }

  await auditLog("tag.updated", actor.id, actor.email as string, {
    metadata: { tag_id: tagId, old: before, new: input },
  });
  revalidateTagSurfaces();
  return { success: true };
}

/** Deleting a tag removes its assignments (ON DELETE CASCADE). */
export async function deleteTag(tagId: string): Promise<TagActionState> {
  const actor = await requireRole("super_admin");
  const supabase = createAdminClient();

  const { data: tag } = await supabase.from("tags").select("name").eq("id", tagId).maybeSingle();
  if (!tag) return { error: "Tag not found." };

  const { error } = await supabase.from("tags").delete().eq("id", tagId);
  if (error) return { error: "Could not delete the tag." };

  await auditLog("tag.deleted", actor.id, actor.email as string, {
    metadata: { tag_id: tagId, name: tag.name },
  });
  revalidateTagSurfaces();
  return { success: true };
}

// ─── Assignment — per-role rules, enforced here (#213) ───────────────────────

async function loadTarget(targetUserId: string) {
  const supabase = createAdminClient();
  const { data } = await supabase.from("users").select("id, role").eq("id", targetUserId).maybeSingle();
  return { supabase, target: data as { id: string; role: string } | null };
}

export async function assignTag(tagId: string, targetUserId: string): Promise<TagActionState> {
  const actor = await requireRole("super_admin", "admin", "consultant");
  const { supabase, target } = await loadTarget(targetUserId);
  if (!target) return { error: "Account not found." };
  if (!canAssignTag({ id: actor.id as string, role: actor.role as string }, target)) {
    return { error: "You can't tag this account." };
  }

  const { error } = await supabase
    .from("account_tags")
    .upsert({ tag_id: tagId, user_id: targetUserId, assigned_by: actor.id }, { onConflict: "tag_id,user_id", ignoreDuplicates: true });
  if (error) return { error: "Could not assign the tag." };

  await auditLog("tag.assigned", actor.id, actor.email as string, {
    metadata: { tag_id: tagId, user_id: targetUserId },
  });
  revalidateTagSurfaces();
  return { success: true };
}

export async function unassignTag(tagId: string, targetUserId: string): Promise<TagActionState> {
  const actor = await requireRole("super_admin", "admin", "consultant");
  const { supabase, target } = await loadTarget(targetUserId);
  if (!target) return { error: "Account not found." };
  if (!canAssignTag({ id: actor.id as string, role: actor.role as string }, target)) {
    return { error: "You can't change this account's tags." };
  }

  const { error } = await supabase.from("account_tags").delete().eq("tag_id", tagId).eq("user_id", targetUserId);
  if (error) return { error: "Could not remove the tag." };

  await auditLog("tag.unassigned", actor.id, actor.email as string, {
    metadata: { tag_id: tagId, user_id: targetUserId },
  });
  revalidateTagSurfaces();
  return { success: true };
}
