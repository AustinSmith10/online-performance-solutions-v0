"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole, getSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit/log";

export async function purgeProject(
  projectId: string,
  _prev: { error?: string },
  _formData: FormData
): Promise<{ error?: string }> {
  const user = await getSessionUser();
  if (!user || (user.role !== "client" && user.role !== "super_admin" && user.role !== "admin")) {
    return { error: "Unauthorized." };
  }

  const supabase = createAdminClient();

  // Verify project is in recovery bin and accessible to this user
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

  // Fetch storage paths before deleting
  const { data: files } = await supabase
    .from("project_files")
    .select("storage_path")
    .eq("project_id", projectId);

  // Hard-delete via SQL function (handles audit_log trigger and credit_ledger FK)
  const { error: purgeError } = await supabase.rpc("purge_project", {
    p_project_id: projectId,
  });

  if (purgeError) {
    console.error("[purgeProject]", purgeError);
    return { error: "Could not permanently delete project. Please try again." };
  }

  // Clean up storage files (best-effort)
  if (files && files.length > 0) {
    await supabase.storage
      .from("submissions")
      .remove(files.map((f) => f.storage_path as string));
  }

  await auditLog("project.purged", user.id, user.email as string, {
    orgId: project.org_id,
    metadata: { projectId, deletedBy: user.role },
  });

  revalidatePath("/portal/recovery");
  revalidatePath("/admin/recovery");

  if (user.role === "client") {
    redirect("/portal/recovery");
  }
  redirect("/admin/recovery");
}

export async function softDeleteProject(projectId: string): Promise<{ error?: string }> {
  const user = await requireRole("client");
  const supabase = createAdminClient();

  const { data: project, error: fetchError } = await supabase
    .from("projects")
    .select("id, org_id, status, deleted_at")
    .eq("id", projectId)
    .eq("org_id", user.org_id as string)
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
  if (!user || (user.role !== "client" && user.role !== "super_admin" && user.role !== "admin")) {
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
