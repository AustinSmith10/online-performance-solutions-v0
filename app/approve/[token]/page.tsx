import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateToken } from "@/lib/stakeholders/tokens";
import { auditLog } from "@/lib/audit/log";
import { getBusinessTimezone } from "@/lib/settings/timezone";
import { formatLongDateAU } from "@/lib/time";
import { dispatchPdfFilenameFor } from "@/lib/documents/naming";
import { ApprovalForm } from "./_components/ApprovalForm";
import { ApproveDownloadLink } from "./_components/ApproveDownloadLink";
import { RequestNewLinkForm } from "./_components/RequestNewLinkForm";

export default async function ApprovePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token: tokenString } = await params;

  const result = await validateToken(tokenString);
  if (!result) notFound();

  const { review, isExpired } = result;
  // Link-expiry dates are the calendar day in the business timezone (#188).
  const timeZone = await getBusinessTimezone(createAdminClient());

  const alreadyResponded = [
    "approved_without_comments",
    "approved_with_comments",
    "rejected_with_comments",
    "waived",
  ].includes(review.status);

  // Still pending when a revised PBDB replaced the one it was for (#191).
  // Internal status — the stakeholder just sees that a new link is coming.
  if (review.status === "superseded") {
    return (
      <div style={styles.wrapper}>
        <div style={styles.card}>
          <h1 style={styles.heading}>A revised document is on its way</h1>
          <p style={styles.body}>
            This document has been updated since this link was sent, so this link is no longer
            active. You&apos;ll receive a new link to review the revised version.
          </p>
          <p style={styles.footer}>DDEG Online Performance Solution</p>
        </div>
      </div>
    );
  }

  if (alreadyResponded) {
    const recordedAt = review.status === "waived" ? review.waived_at : review.responded_at;
    return (
      <div style={styles.wrapper}>
        <div style={styles.card}>
          <h1 style={styles.heading}>Response recorded</h1>
          <p style={styles.body}>
            {review.status === "waived"
              ? "This review was waived."
              : `Thank you${review.status.startsWith("approved") ? " for your approval" : ""}.`}
            {recordedAt && (
              <>
                {" "}
                Recorded on{" "}
                <strong>
                  {new Date(recordedAt).toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </strong>
                .
              </>
            )}
          </p>
          <p style={styles.footer}>DDEG Online Performance Solution</p>
        </div>
      </div>
    );
  }

  if (isExpired) {
    return (
      <div style={styles.wrapper}>
        <div style={styles.card}>
          <h1 style={styles.heading}>Link expired</h1>
          <p style={styles.body}>
            This approval link expired on{" "}
            <strong>
              {formatLongDateAU(new Date(review.expires_at), timeZone)}
            </strong>
            . Request a new link below, or contact DDEG if you need help.
          </p>
          <RequestNewLinkForm token={tokenString} />
          <p style={styles.footer}>DDEG Online Performance Solution</p>
        </div>
      </div>
    );
  }

  // Log that the stakeholder accessed their approval link
  await auditLog("stakeholder.token_accessed", null, review.stakeholder_email, {
    projectId: review.project_id,
    metadata: { review_id: review.id, review_cycle: review.review_cycle },
  });

  // Check if stakeholder has a portal account (in parallel with other queries)
  const supabase = createAdminClient();
  const [{ data: pbdbPdf }, { data: sourceDocx }, { data: portalUser }, { data: revisionNoteRow }] = await Promise.all([
    supabase
      .from("project_files")
      .select("storage_path, original_filename")
      .eq("project_id", review.project_id)
      .eq("file_type", "pbdb_pdf")
      .eq("review_cycle", review.review_cycle)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // No cached PDF yet (a failed dispatch-time render, or the #186 purge)?
    // The download/preview routes regenerate it on demand from this cycle's
    // source docx, so the link still shows as long as that docx exists.
    supabase
      .from("project_files")
      .select("original_filename")
      .eq("project_id", review.project_id)
      .eq("file_type", "pbdb")
      .eq("review_cycle", review.review_cycle)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("users")
      .select("id")
      .eq("email", review.stakeholder_email)
      .eq("role", "stakeholder")
      .maybeSingle(),
    // #59: the consultant's "what changed" note for this cycle, shown next to
    // the re-dispatched PBDB — same as the portal review screen, for
    // stakeholders reviewing via this link without a portal account.
    supabase
      .from("revision_notes")
      .select("note")
      .eq("project_id", review.project_id)
      .eq("review_cycle", review.review_cycle)
      .maybeSingle(),
  ]);

  const hasPortalAccount = !!portalUser;
  const revisionNote = (revisionNoteRow?.note as string | null) ?? null;
  const pdfFilename =
    (pbdbPdf?.original_filename as string | undefined) ??
    (sourceDocx?.original_filename
      ? dispatchPdfFilenameFor(sourceDocx.original_filename as string)
      : null);

  return (
    <div style={styles.wrapper}>
      <div style={styles.card}>
        <h1 style={styles.heading}>Approval required</h1>
        <p style={styles.body}>
          Hi <strong>{review.stakeholder_name}</strong>,
        </p>
        <p style={styles.body}>
          Please review the document below and submit your response.
        </p>

        {revisionNote && (
          <div style={styles.revisionNote} data-testid="revision-note">
            <p style={styles.revisionNoteLabel}>Note from your consultant</p>
            <p style={styles.revisionNoteText}>{revisionNote}</p>
          </div>
        )}

        {pdfFilename && (
          <ApproveDownloadLink
            href={`/approve/${tokenString}/download`}
            filename={pdfFilename}
            previewHref={`/approve/${tokenString}/preview`}
          />
        )}

        <ApprovalForm token={tokenString} reviewId={review.id} redirectAfterSubmit={hasPortalAccount} />

        <p style={styles.note}>
          This link expires on{" "}
          {formatLongDateAU(new Date(review.expires_at), timeZone)}
          .
        </p>
        <p style={styles.footer}>DDEG Online Performance Solution</p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  revisionNote: {
    border: "1px solid #bfdbfe",
    backgroundColor: "#eff6ff",
    borderRadius: 6,
    padding: "8px 12px",
    marginBottom: 16,
  },
  revisionNoteLabel: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "#1d4ed8",
    margin: 0,
  },
  revisionNoteText: {
    fontSize: 14,
    color: "#1e3a8a",
    margin: "4px 0 0",
    whiteSpace: "pre-wrap",
  },
  wrapper: {
    minHeight: "100vh",
    backgroundColor: "#f4f4f5",
    padding: "40px 16px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: "8px",
    maxWidth: "560px",
    margin: "0 auto",
    padding: "40px",
  },
  heading: {
    fontSize: "20px",
    fontWeight: 600,
    color: "#18181b",
    marginTop: 0,
    marginBottom: "24px",
  },
  body: {
    fontSize: "15px",
    lineHeight: 1.6,
    color: "#3f3f46",
    margin: "0 0 16px",
  },
  note: {
    fontSize: "13px",
    color: "#71717a",
    margin: "24px 0 0",
  },
  footer: {
    fontSize: "12px",
    color: "#a1a1aa",
    marginTop: "16px",
    marginBottom: 0,
  },
};
