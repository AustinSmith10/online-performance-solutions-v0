import "server-only";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notifications/notify";
import { ConsultantAssignedEmail } from "@/lib/email/templates/ConsultantAssignedEmail";

export async function performAssignment(projectId: string, consultantId: string) {
  const supabase = createAdminClient();

  const [projectResult, consultantResult] = await Promise.all([
    supabase
      .from("projects")
      .select("id, project_number, org_id, organisations(name)")
      .eq("id", projectId)
      .single(),
    supabase
      .from("users")
      .select("id, first_name, last_name, email")
      .eq("id", consultantId)
      .eq("role", "consultant")
      .single(),
  ]);

  if (projectResult.error || !projectResult.data) throw new Error("Project not found");
  if (consultantResult.error || !consultantResult.data) throw new Error("Consultant not found");

  const project = projectResult.data as typeof projectResult.data & {
    organisations: { name: string } | null;
  };
  const consultant = consultantResult.data;

  const { error: updateErr } = await supabase
    .from("projects")
    .update({ assigned_consultant_id: consultantId, status: "assigned", updated_at: new Date().toISOString() })
    .eq("id", projectId);

  if (updateErr) throw new Error(updateErr.message);

  const consultantName =
    [consultant.first_name, consultant.last_name].filter(Boolean).join(" ") ||
    consultant.email;
  const orgName = project.organisations?.name ?? "a client";
  const projectRef = project.project_number ?? project.id;

  await notify({
    recipientId: consultantId,
    type: "consultant_assigned",
    message: `You have been assigned to project ${projectRef}.`,
    projectId,
    emailSubject: `You've been assigned to project ${projectRef}`,
    emailHtml: ConsultantAssignedEmail({
      recipientName: consultantName,
      projectRef,
      orgName,
      portalUrl: `${process.env.NEXT_PUBLIC_APP_URL}/ops`,
    }),
  });

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath("/admin/consultants");
}
