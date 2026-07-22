/**
 * Shared shell for every outbound OPS email.
 *
 * Mirrors the app's card surface (12px radius, 1px zinc-200 border, zinc-900
 * actions) and its status vocabulary (amber asks for action, green confirms,
 * red reports a failure, blue informs) so an email reads as part of the same
 * system as the portal — and so its urgency is legible before a word is read.
 *
 * Everything is tables + inline styles: Outlook has no flexbox or grid, and
 * <style> blocks are stripped by several clients. Authored light-on-light;
 * clients apply their own dark-mode transforms and cannot be relied upon.
 */

export type EmailStatus = "action" | "success" | "error" | "info";

interface StatusTokens {
  rule: string;
  pillBg: string;
  pillText: string;
}

const STATUS: Record<EmailStatus, StatusTokens> = {
  action: { rule: "#d97706", pillBg: "#fef3c7", pillText: "#92400e" },
  success: { rule: "#16a34a", pillBg: "#dcfce7", pillText: "#166534" },
  error: { rule: "#dc2626", pillBg: "#fee2e2", pillText: "#991b1b" },
  info: { rule: "#2563eb", pillBg: "#dbeafe", pillText: "#1e40af" },
};

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,Helvetica,sans-serif";

const INK = "#18181b";
const INK_MID = "#3f3f46";
const INK_SOFT = "#71717a";
const INK_FAINT = "#a1a1aa";
const LINE = "#e4e4e7";
const SUNKEN = "#f4f4f5";

/** Escape untrusted text for interpolation into an HTML attribute or text node. */
export function e(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export interface EmailCta {
  label: string;
  url: string;
}

export interface EmailShellOptions {
  status: EmailStatus;
  /** Short pill text, e.g. "Action needed". Kept to two words where possible. */
  statusLabel: string;
  heading: string;
  /** Trusted HTML for the message body — build it with the helpers below. */
  bodyHtml: string;
  cta?: EmailCta | null;
  /** Small print under the CTA (expiry, caveats). */
  footnote?: string | null;
}

// ─── body helpers ────────────────────────────────────────────────────────────

/** A standard body paragraph. `html` is trusted — escape its inputs first. */
export function paragraph(html: string, marginBottom = 16): string {
  return `<p style="margin:0 0 ${marginBottom}px;font-family:${FONT};font-size:15px;line-height:1.6;color:${INK_MID}">${html}</p>`;
}

/** Emphasised inline value, for references and names inside a sentence. */
export function strong(text: string): string {
  return `<strong style="color:${INK}">${e(text)}</strong>`;
}

/** Tinted callout carrying a single key fact (a deadline, a balance). */
export function noticeBox(html: string, status: EmailStatus = "info"): string {
  const tone = STATUS[status];
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:0 0 16px"><tr><td style="background-color:${tone.pillBg};border-radius:6px;padding:10px 14px;font-family:${FONT};font-size:14px;line-height:1.5;color:${tone.pillText}">${html}</td></tr></table>`;
}

/** Neutral panel — used for quoted stakeholder comments and grouped detail. */
export function panel(labelText: string | null, html: string): string {
  const label = labelText
    ? `<p style="margin:0 0 8px;font-family:${FONT};font-size:12px;font-weight:600;color:${INK_SOFT};text-transform:uppercase;letter-spacing:0.05em">${e(labelText)}</p>`
    : "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:0 0 12px"><tr><td style="background-color:${SUNKEN};border-radius:6px;padding:16px">${label}<p style="margin:0;font-family:${FONT};font-size:14px;line-height:1.6;color:${INK_MID}">${html}</p></td></tr></table>`;
}

/** Key/value record table — for emails whose payload is really a set of fields. */
export function fieldTable(rows: { label: string; value: string }[]): string {
  const body = rows
    .map(
      ({ label, value }, i) => `<tr>
        <td style="padding:7px 0;${i < rows.length - 1 ? `border-bottom:1px solid ${SUNKEN};` : ""}font-family:${FONT};font-size:13px;color:${INK_SOFT};width:40%">${e(label)}</td>
        <td style="padding:7px 0;${i < rows.length - 1 ? `border-bottom:1px solid ${SUNKEN};` : ""}font-family:${FONT};font-size:13px;color:${INK};font-weight:600">${value}</td>
      </tr>`
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:0 0 20px">${body}</table>`;
}

/** Quoted free text (stakeholder comment, revision note). */
export function quote(text: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:0 0 16px"><tr><td style="border-left:3px solid #d4d4d8;background-color:#fafafa;padding:12px 16px;font-family:${FONT};font-size:14px;line-height:1.6;color:${INK_MID};font-style:italic">${e(text)}</td></tr></table>`;
}

/** Secondary text link, e.g. a supporting document download. */
export function link(label: string, url: string): string {
  return `<a href="${e(url)}" style="color:${INK};font-weight:600;text-decoration:underline">${e(label)}</a>`;
}

// ─── shell ───────────────────────────────────────────────────────────────────

export function renderEmailShell({
  status,
  statusLabel,
  heading,
  bodyHtml,
  cta,
  footnote,
}: EmailShellOptions): string {
  const tone = STATUS[status];

  const ctaHtml = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:4px 0 0"><tr><td style="background-color:${INK};border-radius:8px"><a href="${e(cta.url)}" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:14px;font-weight:600;color:#ffffff;text-decoration:none">${e(cta.label)}</a></td></tr></table>`
    : "";

  const footnoteHtml = footnote
    ? `<p style="margin:16px 0 0;font-family:${FONT};font-size:13px;line-height:1.5;color:${INK_SOFT}">${footnote}</p>`
    : "";

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${SUNKEN};border-collapse:collapse">
  <tr>
    <td align="center" style="padding:32px 12px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="width:560px;max-width:100%;background-color:#ffffff;border:1px solid ${LINE};border-radius:12px;border-collapse:separate">
        <tr><td style="height:4px;background-color:${tone.rule};border-radius:12px 12px 0 0;font-size:0;line-height:0">&nbsp;</td></tr>
        <tr>
          <td style="padding:20px 28px 0">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse"><tr>
              <td align="left">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr><td style="background-color:${tone.pillBg};border-radius:999px;padding:4px 11px">
                  <span style="font-family:${FONT};font-size:11px;font-weight:700;color:${tone.pillText};text-transform:uppercase;letter-spacing:0.05em">${e(statusLabel)}</span>
                </td></tr></table>
              </td>
              <td align="right" style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.08em;color:${INK_FAINT};text-transform:uppercase">DDEG&nbsp;OPS</td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 28px 28px">
            <h1 style="margin:0 0 16px;font-family:${FONT};font-size:20px;font-weight:700;line-height:1.3;color:${INK}">${e(heading)}</h1>
            ${bodyHtml}
            ${ctaHtml}
            ${footnoteHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:14px 28px;border-top:1px solid ${LINE}">
            <p style="margin:0;font-family:${FONT};font-size:12px;color:${INK_FAINT}">DDEG Online Performance Solution</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}
