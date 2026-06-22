import "server-only";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notifications/notify";
import { auditLog } from "@/lib/audit/log";
import { ConsultantAssignedEmail } from "@/lib/email/templates/ConsultantAssignedEmail";
import { getPublicHolidays } from "@/lib/delivery/public-holidays";
import { addWorkingDays } from "@/lib/delivery/working-days";

export async function performAssignment(
  projectId: string,
  consultantId: string,
  actorId?: string,
  actorEmail?: string
) {
  const supabase = createAdminClient();

  const [projectResult, consultantResult] = await Promise.all([
    supabase
      .from("projects")
      .select("id, project_number, site_address, extracted_fields, status, org_id, expected_delivery_date, organisations(name, delivery_working_days, state_territory)")
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
    status: string;
    expected_delivery_date: string | null;
    organisations: { name: string; delivery_working_days: number; state_territory: string | null } | null;
  };
  const consultant = consultantResult.data;

  // Calculate delivery date now if it wasn't set during submission (e.g. draft assigned directly)
  let deliveryDate = project.expected_delivery_date as string | null;
  if (!deliveryDate) {
    try {
      const org = project.organisations;
      const deliveryDays = org?.delivery_working_days ?? 5;
      const stateTerritory = org?.state_territory ?? null;
      const now = new Date();
      const [hA, hB] = await Promise.all([
        getPublicHolidays(stateTerritory, now.getUTCFullYear()),
        getPublicHolidays(stateTerritory, now.getUTCFullYear() + 1),
      ]);
      deliveryDate = addWorkingDays(now, deliveryDays, new Set([...hA, ...hB]))
        .toISOString()
        .slice(0, 10);
    } catch {
      // Non-fatal — proceed without delivery date
    }
  }

  const { error: updateErr } = await supabase
    .from("projects")
    .update({
      assigned_consultant_id: consultantId,
      status: "assigned",
      updated_at: new Date().toISOString(),
      ...(deliveryDate && !project.expected_delivery_date ? { expected_delivery_date: deliveryDate } : {}),
    })
    .eq("id", projectId);

  if (updateErr) throw new Error(updateErr.message);

  const consultantName =
    [consultant.first_name, consultant.last_name].filter(Boolean).join(" ") ||
    consultant.email;
  const orgName = project.organisations?.name ?? "a client";
  const address = (project.site_address as string | null) ??
    ((project.extracted_fields as Record<string, string> | null)?.["EXTRACT_ADDRESS"]) ??
    null;
  const projectRef = address ?? project.project_number ?? project.id.slice(0, 8);

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

  await auditLog("assignment.created", actorId ?? null, actorEmail ?? null, {
    projectId,
    orgId: project.org_id as string,
    metadata: { consultant_id: consultantId, consultant_name: consultantName, project_status: project.status },
  });

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath("/admin/consultants");
}
