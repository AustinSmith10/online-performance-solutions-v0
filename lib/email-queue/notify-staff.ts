import type { SupabaseClient } from "@supabase/supabase-js";
import { notify } from "@/lib/notifications/notify";
import type { NotificationType } from "@/lib/notifications/types";

// In-app heads-up for the people who work a project's email: its consultant
// (QA owner, else assigned) and every admin. In-app only, deliberately: the
// resolution step already emails them, and an arrival ping per inbound email
// would double the mail.
export async function notifyProjectStaff(
  supabase: SupabaseClient,
  projectId: string,
  opts: { type: NotificationType; message: (projectRef: string) => string }
): Promise<void> {
  const { data: project } = await supabase
    .from("projects")
    .select("id, project_number, extracted_fields, assigned_consultant_id, qa_completed_by")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return;

  const projectRef =
    (project.extracted_fields as Record<string, string> | null)?.["EXTRACT_ADDRESS"] ??
    (project.project_number as string | null) ??
    (project.id as string).slice(0, 8);

  const recipients = new Set<string>();
  const consultantId = (project.qa_completed_by as string | null) ?? (project.assigned_consultant_id as string | null);
  if (consultantId) recipients.add(consultantId);
  const { data: admins } = await supabase.from("users").select("id").in("role", ["super_admin", "admin"]);
  for (const a of admins ?? []) recipients.add(a.id as string);

  const message = opts.message(projectRef);
  await Promise.all(
    [...recipients].map((recipientId) =>
      notify({ recipientId, type: opts.type, message, projectId, inAppOnly: true }).catch(() => {})
    )
  );
}
