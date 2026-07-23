import { renderEmailShell, e, paragraph } from "./shell";

export interface ClarificationRequestEmailProps {
  message: string;
}

// Sent when an inbound email matched a known third-party stakeholder but
// carried no reply token, so nothing links it to a project or review cycle
// (#101 follow-up — the queue's stakeholder_table_fallback case). The
// message itself is free-text, written by the admin/consultant in the queue
// UI — this just wraps it in the standard branded shell. The reply threads
// straight back onto the same queue row via a per-entry token.
export function renderClarificationRequestEmail({ message }: ClarificationRequestEmailProps): string {
  const bodyHtml = message
    .split("\n")
    .map((line) => (line.trim() ? paragraph(e(line), 12) : ""))
    .join("");

  return renderEmailShell({
    status: "action",
    statusLabel: "Reply needed",
    heading: "Which project is this regarding?",
    bodyHtml,
  });
}
