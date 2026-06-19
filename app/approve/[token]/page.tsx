import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateToken } from "@/lib/stakeholders/tokens";
import { auditLog } from "@/lib/audit/log";
import { ApprovalForm } from "./_components/ApprovalForm";

export default async function ApprovePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token: tokenString } = await params;

  const result = await validateToken(tokenString);
  if (!result) notFound();

  const { review, isExpired } = result;

  if (isExpired) {
    return (
      <div style={styles.wrapper}>
        <div style={styles.card}>
          <h1 style={styles.heading}>Link expired</h1>
          <p style={styles.body}>
            This approval link expired on{" "}
            <strong>
              {new Date(review.expires_at).toLocaleDateString("en-AU", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </strong>
            . Please contact DDEG for a new link.
          </p>
          <p style={styles.footer}>DDEG Online Performance Solution</p>
        </div>
      </div>
    );
  }

  const alreadyResponded = [
    "approved_without_comments",
    "approved_with_comments",
    "rejected_without_comments",
    "rejected_with_comments",
  ].includes(review.status);

  if (alreadyResponded) {
    return (
      <div style={styles.wrapper}>
        <div style={styles.card}>
          <h1 style={styles.heading}>Response recorded</h1>
          <p style={styles.body}>
            Thank you{review.status.startsWith("approved") ? " for your approval" : ""}.
            Your response was recorded on{" "}
            <strong>
              {new Date(review.responded_at!).toLocaleDateString("en-AU", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </strong>
            .
          </p>
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
  const [{ data: pbdbFile }, { data: portalUser }] = await Promise.all([
    supabase
      .from("project_files")
      .select("storage_path, original_filename")
      .eq("project_id", review.project_id)
      .eq("file_type", "pbdb")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("users")
      .select("id")
      .eq("email", review.stakeholder_email)
      .eq("role", "client")
      .maybeSingle(),
  ]);

  const hasPortalAccount = !!portalUser;

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

        {pbdbFile && (
          <a
            href={`/approve/${tokenString}/download`}
            style={styles.downloadLink}
          >
            Download PBDB document
          </a>
        )}

        <ApprovalForm token={tokenString} reviewId={review.id} redirectAfterSubmit={hasPortalAccount} />

        <p style={styles.note}>
          This link expires on{" "}
          {new Date(review.expires_at).toLocaleDateString("en-AU", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
          .
        </p>
        <p style={styles.footer}>DDEG Online Performance Solution</p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
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
  downloadLink: {
    display: "inline-block",
    marginBottom: "24px",
    color: "#18181b",
    fontWeight: 500,
    fontSize: "14px",
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
