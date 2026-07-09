"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole, getSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit/log";
import { removeProjectStorageFiles } from "@/lib/storage/project-files";

export async function purgeProject(
  projectId: string,
  _prev: { error?: string; success?: boolean },
  _formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const user = await getSessionUser();
  if (!user || (user.role !== "stakeholder" && user.role !== "super_admin" && user.role !== "admin")) {
    return { error: "Unauthorized." };
  }

  const supabase = createAdminClient();

  // Verify project is in recovery bin and accessible to this user
  let query = supabase
    .from("projects")
    .select("id, client_id")
    .eq("id", projectId)
    .not("deleted_at", "is", null);

  if (user.role === "stakeholder") {
    query = query.eq("client_id", user.client_id as string);
  }

  const { data: project, error: fetchError } = await query.maybeSingle();

  if (fetchError || !project) {
    return { error: "Project not found in recovery bin." };
  }

  // Clean up storage files before deleting (best-effort)
  await removeProjectStorageFiles(supabase, projectId);

  // Hard-delete via SQL function (handles audit_log trigger and credit_ledger FK)
  const { error: purgeError } = await supabase.rpc("purge_project", {
    p_project_id: projectId,
  });

  if (purgeError) {
    console.error("[purgeProject]", purgeError);
    return { error: "Could not permanently delete project. Please try again." };
  }

  await auditLog("project.purged", user.id, user.email as string, {
    orgId: project.client_id,
    metadata: { projectId, deletedBy: user.role },
  });

  revalidatePath("/portal/recovery");
  revalidatePath("/admin/recovery");

  return { success: true };
}

export async function softDeleteProject(projectId: string): Promise<{ error?: string }> {
  const user = await requireRole("stakeholder");
  const supabase = createAdminClient();

  const { data: project, error: fetchError } = await supabase
    .from("projects")
    .select("id, client_id, status, deleted_at")
    .eq("id", projectId)
    .eq("client_id", user.client_id as string)
    .is("deleted_at", null)
    .maybeSingle();

  if (fetchError || !project) {
    return { error: "Project not found or already deleted." };
  }

  if (!["draft", "submitted"].includes(project.status as string)) {
    return {
      error:
        "This report has already been assigned to a consultant and can no longer be deleted. Please contact DDEG if you need to cancel.",
    };
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
    orgId: project.client_id,
  });

  revalidatePath("/portal");
  redirect("/portal?deleted=1");
}

export async function restoreProject(
  projectId: string,
  _prev: { error?: string },
  _formData: FormData
): Promise<{ error?: string }> {
  const user = await getSessionUser();
  if (!user || (user.role !== "stakeholder" && user.role !== "super_admin" && user.role !== "admin")) {
    return { error: "Unauthorized." };
  }

  const supabase = createAdminClient();
  const actorId = user.id as string;
  const actorEmail = user.email as string;

  let query = supabase
    .from("projects")
    .select("id, client_id")
    .eq("id", projectId)
    .not("deleted_at", "is", null);

  if (user.role === "stakeholder") {
    query = query.eq("client_id", user.client_id as string);
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
    orgId: project.client_id,
  });

  revalidatePath("/portal/recovery");
  revalidatePath("/admin/recovery");
  revalidatePath("/portal");

  if (user.role === "stakeholder") {
    redirect("/portal?restored=1");
  }
  return {};
}
