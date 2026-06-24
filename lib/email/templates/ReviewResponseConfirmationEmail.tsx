export interface ReviewResponseConfirmationEmailProps {
  recipientName: string;
  projectRef: string;
  response: "approved" | "rejected";
  comments: string | null;
  portalUrl: string;
}

function e(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderReviewResponseConfirmationEmail({
  recipientName,
  projectRef,
  response,
  comments,
  portalUrl,
}: ReviewResponseConfirmationEmailProps): string {
  const action = response === "approved" ? "approved" : "requested changes to";
  const accentColor = response === "approved" ? "#16a34a" : "#dc2626";
  const badgeText = response === "approved" ? "Approved" : "Changes requested";

  return `
    <div style="background-color:#f4f4f5;padding:40px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
      <div style="background-color:#ffffff;border-radius:8px;max-width:560px;margin:0 auto;padding:40px">
        <h1 style="font-size:20px;font-weight:600;color:#18181b;margin-top:0;margin-bottom:24px">Review response recorded</h1>
        <p style="font-size:15px;line-height:1.6;color:#3f3f46;margin:0 0 16px">Hi ${e(recipientName)},</p>
        <p style="font-size:15px;line-height:1.6;color:#3f3f46;margin:0 0 16px">
          Your response for <strong>${e(projectRef)}</strong> has been recorded. You ${e(action)} the PBDB.
        </p>
        <div style="margin:24px 0;padding:16px;border-radius:6px;border:1px solid #e4e4e7;background-color:#fafafa">
          <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#71717a;text-transform:uppercase;letter-spacing:0.05em">Your response</p>
          <span style="display:inline-block;padding:4px 12px;border-radius:9999px;font-size:13px;font-weight:500;background-color:${response === "approved" ? "#dcfce7" : "#fee2e2"};color:${accentColor}">${e(badgeText)}</span>
          ${comments ? `<p style="margin:12px 0 0;font-size:14px;color:#3f3f46;line-height:1.6;font-style:italic">&ldquo;${e(comments)}&rdquo;</p>` : ""}
        </div>
        ${response === "rejected" ? `<p style="font-size:14px;line-height:1.6;color:#71717a;margin:0 0 24px">Our team has been notified and will review your feedback. You'll hear from us once the document has been updated.</p>` : `<p style="font-size:14px;line-height:1.6;color:#71717a;margin:0 0 24px">Thank you for your approval. We'll be in touch once the final report is ready.</p>`}
        <a href="${e(portalUrl)}" style="display:inline-block;background-color:#18181b;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:500">View your project</a>
        <p style="font-size:12px;color:#a1a1aa;margin-top:32px;margin-bottom:0">DDEG Online Performance Solution</p>
      </div>
    </div>
  `;
}
