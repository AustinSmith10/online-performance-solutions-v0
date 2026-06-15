"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole, getSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit/log";

export async function softDeleteProject(projectId: string): Promise<{ error?: string }> {
  const user = await requireRole("client");
  const supabase = createAdminClient();

  const { data: project, error: fetchError } = await supabase
    .from("projects")
    .select("id, org_id, deleted_at")
    .eq("id", projectId)
    .eq("org_id", user.org_id as string)
    .is("deleted_at", null)
    .maybeSingle();

  if (fetchError || !project) {
    return { error: "Project not found or already deleted." };
  }

  const { error } = await supabase
    .from("projects")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", projectId);

  if (error) {
    console.error("[softDeleteProject]", error);
    return { error: "Could not delete project. Please try again." };
  }

  await auditLog("project.soft_deleted", user.id, user.email, {
    projectId,
    orgId: project.org_id,
  });

  revalidatePath("/portal");
  redirect("/portal");
}

export async function restoreProject(
  projectId: string,
  _prev: { error?: string },
  _formData: FormData
): Promise<{ error?: string }> {
  const user = await getSessionUser();
  if (!user || (user.role !== "client" && user.role !== "super_admin")) {
    return { error: "Unauthorized." };
  }

  const supabase = createAdminClient();
  const actorId = user.id as string;
  const actorEmail = user.email as string;

  let query = supabase
    .from("projects")
    .select("id, org_id")
    .eq("id", projectId)
    .not("deleted_at", "is", null);

  if (user.role === "client") {
    query = query.eq("org_id", user.org_id as string);
  }

  const { data: project, error: fetchError } = await query.maybeSingle();

  if (fetchError || !project) {
    return { error: "Project not found in recovery bin." };
  }

  const { error } = await supabase
    .from("projects")
    .update({ deleted_at: null })
    .eq("id", projectId);

  if (error) {
    console.error("[restoreProject]", error);
    return { error: "Could not restore project. Please try again." };
  }

  await auditLog("project.restored", actorId, actorEmail, {
    projectId,
    orgId: project.org_id,
  });

  revalidatePath("/portal/recovery");
  revalidatePath("/admin/recovery");
  revalidatePath("/portal");

  return {};
}
