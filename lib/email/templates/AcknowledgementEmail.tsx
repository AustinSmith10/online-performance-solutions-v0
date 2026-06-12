export interface AcknowledgementEmailProps {
  recipientName: string;
  projectId: string;
  expectedDeliveryDate: string;
  portalUrl: string;
}

function e(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function AcknowledgementEmail({
  recipientName,
  projectId,
  expectedDeliveryDate,
  portalUrl,
}: AcknowledgementEmailProps): string {
  return `
    <div style="background-color:#f4f4f5;padding:40px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
      <div style="background-color:#ffffff;border-radius:8px;max-width:560px;margin:0 auto;padding:40px">
        <h1 style="font-size:20px;font-weight:600;color:#18181b;margin-top:0;margin-bottom:24px">Submission received</h1>
        <p style="font-size:15px;line-height:1.6;color:#3f3f46;margin:0 0 16px">Hi ${e(recipientName)},</p>
        <p style="font-size:15px;line-height:1.6;color:#3f3f46;margin:0 0 16px">
          Thank you for submitting your request. Your report is due by
          <strong>${e(expectedDeliveryDate)}</strong>.
        </p>
        <p style="font-size:15px;line-height:1.6;color:#3f3f46;margin:0 0 16px">
          Your reference number is <strong>${e(projectId)}</strong>. Our team will be in touch once
          your report is ready.
        </p>
        <a href="${e(portalUrl)}" style="display:inline-block;margin-top:8px;margin-bottom:24px;background-color:#18181b;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:500">View your submission</a>
        <p style="font-size:12px;color:#a1a1aa;margin-top:24px;margin-bottom:0">DDEG Online Performance Solution</p>
      </div>
    </div>
  `;
}
