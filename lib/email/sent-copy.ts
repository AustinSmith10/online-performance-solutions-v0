import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email/sender";
import { renderEmailShell, e, paragraph, strong, noticeBox } from "@/lib/email/templates/shell";

/**
 * Consultant/admin copy of a PBDB dispatch or PBDR delivery (#212).
 *
 * A separate email — not a CC — sent once per dispatch (never once per
 * stakeholder) with the exact stored sent PDF attached (the same object #208's
 * "Download PDF (as sent)" serves, so email and download always match).
 * Deliberately carries no reply-to: the stakeholder emails' reply-to token
 * address is what routes an inbound reply to the review webhook, so a reply
 * to this copy must never be readable as a stakeholder response. No tag or
 * account-label data is read here (#213).
 *
 * Never throws: a failed copy must not block or fail the stakeholder send.
 */
export type SentCopyKind = "pbdb" | "pbdr";

const KIND_LABEL: Record<SentCopyKind, string> = { pbdb: "PBDB", pbdr: "PBDR" };

export interface SentCopyRecipient {
  id: string;
  email: string;
}

/** Assigned consultant, plus the acting admin when an admin triggered the send. Deduped by user. */
export async function resolveSentCopyRecipients(
  supabase: SupabaseClient,
  projectId: string,
  actorId: string | null
): Promise<SentCopyRecipient[]> {
  const { data: project } = await supabase
    .from("projects")
    .select("assigned_consultant_id")
    .eq("id", projectId)
    .maybeSingle();

  const ids = new Set<string>();
  const consultantId = (project?.assigned_consultant_id as string | null | undefined) ?? null;
  if (consultantId) ids.add(consultantId);

  if (actorId && actorId !== consultantId) {
    const { data: actor } = await supabase.from("users").select("id, role").eq("id", actorId).maybeSingle();
    const role = actor?.role as string | undefined;
    if (role === "admin" || role === "super_admin") ids.add(actorId);
  }
  if (ids.size === 0) return [];

  const { data: users } = await supabase.from("users").select("id, email").in("id", [...ids]);
  return (users ?? [])
    .filter((u) => !!u.email)
    .map((u) => ({ id: u.id as string, email: u.email as string }));
}

export async function sendSentCopies({
  supabase,
  projectId,
  kind,
  storagePath,
  filename,
  projectRef,
  actorId,
  stakeholderCount,
}: {
  supabase: SupabaseClient;
  projectId: string;
  kind: SentCopyKind;
  storagePath: string;
  filename: string;
  projectRef: string;
  actorId: string | null;
  /** Only worded in the body; the copy itself is still one email per recipient. */
  stakeholderCount?: number;
}): Promise<void> {
  try {
    const recipients = await resolveSentCopyRecipients(supabase, projectId, actorId);
    if (recipients.length === 0) return;

    const { data: blob, error } = await supabase.storage.from("documents").download(storagePath);
    if (error || !blob) throw new Error(error?.message ?? "sent PDF not found in storage");
    const content = Buffer.from(await blob.arrayBuffer());

    const label = KIND_LABEL[kind];
    const audience =
      kind === "pbdb"
        ? `sent to ${stakeholderCount ?? 0} stakeholder${stakeholderCount === 1 ? "" : "s"} for review`
        : "delivered to the client";
    const html = renderEmailShell({
      status: "info",
      statusLabel: "Copy",
      heading: `${label} copy — ${e(projectRef)}`,
      bodyHtml:
        paragraph(`The ${strong(label)} for project ${strong(e(projectRef))} was ${audience}.`) +
        noticeBox(
          "This is your copy with the exact PDF attached. Do not reply to this email — replies are not read as stakeholder responses.",
          "info"
        ),
    });

    for (const r of recipients) {
      await sendEmail({
        to: r.email,
        subject: `[Copy] ${label} — ${projectRef}`,
        html,
        source: `sent_copy_${kind}`,
        projectId,
        attachments: [{ name: filename, content, contentType: "application/pdf" }],
      }).catch((err) => console.error(`[sent-copy] ${kind} copy to ${r.id} failed:`, err));
    }
  } catch (err) {
    console.error(`[sent-copy] ${kind} copy failed for project ${projectId}:`, err);
  }
}
