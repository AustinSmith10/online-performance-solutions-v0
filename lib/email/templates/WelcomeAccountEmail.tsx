export interface WelcomeAccountEmailProps {
  firstName: string;
  email: string;
  role: string;
  resetLink: string;
  appUrl: string;
}

function e(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const ROLE_LABELS: Record<string, string> = {
  stakeholder: "Stakeholder",
  consultant: "Consultant",
  admin: "Admin",
  super_admin: "Super Admin",
};

export function WelcomeAccountEmail({
  firstName,
  email,
  role,
  resetLink,
  appUrl,
}: WelcomeAccountEmailProps): string {
  const roleLabel = ROLE_LABELS[role] ?? role;
  return `
    <div style="background-color:#f4f4f5;padding:40px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
      <div style="background-color:#ffffff;border-radius:8px;max-width:560px;margin:0 auto;padding:40px">
        <h1 style="font-size:20px;font-weight:600;color:#18181b;margin-top:0;margin-bottom:24px">Your account is ready</h1>
        <p style="font-size:15px;line-height:1.6;color:#3f3f46;margin:0 0 16px">Hi ${e(firstName)},</p>
        <p style="font-size:15px;line-height:1.6;color:#3f3f46;margin:0 0 16px">
          An account has been created for you on the DDEG Online Performance Solution portal.
        </p>
        <table style="width:100%;border-collapse:collapse;margin:0 0 24px">
          <tr>
            <td style="font-size:14px;color:#71717a;padding:6px 0;width:100px">Email</td>
            <td style="font-size:14px;color:#18181b;padding:6px 0;font-weight:500">${e(email)}</td>
          </tr>
          <tr>
            <td style="font-size:14px;color:#71717a;padding:6px 0">Role</td>
            <td style="font-size:14px;color:#18181b;padding:6px 0;font-weight:500">${e(roleLabel)}</td>
          </tr>
          <tr>
            <td style="font-size:14px;color:#71717a;padding:6px 0">Portal</td>
            <td style="font-size:14px;padding:6px 0"><a href="${e(appUrl)}" style="color:#18181b">${e(appUrl)}</a></td>
          </tr>
        </table>
        <p style="font-size:15px;line-height:1.6;color:#3f3f46;margin:0 0 16px">
          To get started, set your password by clicking the button below. This link expires in 24&nbsp;hours.
        </p>
        <a href="${e(resetLink)}" style="display:inline-block;margin-top:4px;margin-bottom:24px;background-color:#18181b;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:500">Set my password</a>
        <p style="font-size:13px;line-height:1.6;color:#71717a;margin:0 0 8px">
          After setting your password you will be prompted to set up two-factor authentication on first login.
        </p>
        <p style="font-size:13px;line-height:1.6;color:#71717a;margin:0">
          If you were not expecting this email, please contact us at <a href="mailto:info@ddeg.com.au" style="color:#71717a">info@ddeg.com.au</a>.
        </p>
        <p style="font-size:12px;color:#a1a1aa;margin-top:24px;margin-bottom:0">DDEG Online Performance Solution</p>
      </div>
    </div>
  `;
}
