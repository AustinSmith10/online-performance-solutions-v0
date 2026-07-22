import { SUPPORT_EMAIL } from "@/lib/config/support";
import { renderEmailShell, e, paragraph, fieldTable } from "./shell";

export interface WelcomeAccountEmailProps {
  firstName: string;
  email: string;
  role: string;
  resetLink: string;
  appUrl: string;
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

  const body = [
    paragraph(`Hi ${e(firstName)},`),
    paragraph("An account has been created for you on the DDEG Online Performance Solution portal."),
    fieldTable([
      { label: "Email", value: e(email) },
      { label: "Role", value: e(roleLabel) },
      {
        label: "Portal",
        value: `<a href="${e(appUrl)}" style="color:#18181b;text-decoration:underline">${e(appUrl)}</a>`,
      },
    ]),
    paragraph(
      "To get started, set your password using the button below. This link expires in 24&nbsp;hours.",
      20
    ),
  ].join("");

  const footnote =
    `After setting your password you will be prompted to set up two-factor authentication on first login.` +
    `<br />If you were not expecting this email, please contact us at ` +
    `<a href="mailto:${SUPPORT_EMAIL}" style="color:#71717a">${SUPPORT_EMAIL}</a>.`;

  return renderEmailShell({
    status: "info",
    statusLabel: "Welcome",
    heading: "Your account is ready",
    bodyHtml: body,
    cta: { label: "Set my password", url: resetLink },
    footnote,
  });
}
