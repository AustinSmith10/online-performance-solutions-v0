import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveStakeholders } from "@/lib/stakeholders/resolver";

// A reply token proves the sender received a specific approval email, not that
// they are the stakeholder (a forward or a shared inbox can reply too). So we
// check the sender against the review's own stakeholder, the project's
// reviewer roster, and the project's submitter. Shared by the queue (to show
// the answer before anyone approves) and the resolution code (which always
// recomputes it against the final target).
export async function isReplySenderVerified(
  supabase: SupabaseClient,
  args: {
    fromEmail: string;
    reviewStakeholderEmail: string;
    projectId: string;
    templateId: string | null;
    submittedBy: string | null;
  }
): Promise<boolean> {
  const known = new Set<string>([args.reviewStakeholderEmail.toLowerCase()]);
  const roster = await resolveStakeholders(args.projectId, args.templateId);
  for (const s of roster) known.add(s.email.toLowerCase());
  if (args.submittedBy) {
    const { data: submitter } = await supabase.from("users").select("email").eq("id", args.submittedBy).maybeSingle();
    if (submitter?.email) known.add((submitter.email as string).toLowerCase());
  }
  return known.has(args.fromEmail.toLowerCase());
}
