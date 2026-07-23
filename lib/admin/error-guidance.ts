// Static, rule-based "what to do about this" copy for the admin System
// Health page (issue #46 follow-up). Job names are a small, fixed set (see
// worker.ts), so a hand-written lookup is more reliable than generating
// explanations on the fly — revisit if the job list grows large or varied
// enough that this stops covering the common cases.

const JOB_GUIDANCE: Record<string, string> = {
  "purge-recovery-bin":
    "This nightly cleanup job failed to purge expired recovery-bin items. Usually transient (a database timeout or lock). Check the worker logs around the failure time; no data is lost since the items stay queued for the next run.",
  "expire-draft":
    "This job failed while auto-expiring abandoned draft projects. Check the per-client abandoned_draft_days setting and the worker logs for a query error; if drafts have piled up, expire them manually from the project list.",
  "approval-buffer":
    "This job failed while checking dispatched projects for overdue stakeholder responses or issuing fresh approval tokens. Open the affected project's stakeholder reviews and confirm whether a fresh token still needs to be sent.",
  "generate-pbdb":
    "PBDB document generation failed for this project. Check the template and the submitted field data for anything malformed, then retry generation from the project detail page.",
  "dispatch-pbdb":
    "Dispatching the PBDB to stakeholders failed. Check the outbound email configuration and the project's stakeholder list, then retry dispatch from the project detail page.",
  "deliver-pbdr":
    "Final PBDR delivery to the client failed. Check the delivery recipient email and the document conversion step, then retry delivery from the project detail page.",
  "release-pending-deliveries":
    "Releasing a business-hours-gated PBDR delivery failed (see #63). Check the project's document conversion step, then retry delivery from the project detail page — the staged pending_deliveries row is cleared before the attempt, so it won't retry automatically.",
};

export function jobGuidance(jobName: string, message?: string | null): string {
  const known = JOB_GUIDANCE[jobName];
  if (known) return known;
  return message
    ? `Failed with: "${message}". Check the worker logs for the "${jobName}" job for more detail.`
    : `Check the worker logs for the "${jobName}" job for more detail.`;
}

export function bounceGuidance(reason: string | null): string {
  const r = (reason ?? "").toLowerCase();
  if (r.includes("full")) {
    return "The recipient's inbox is full. Ask them to clear space, or reach them through an alternate channel until they do.";
  }
  if (r.includes("exist") || r.includes("invalid") || r.includes("no such")) {
    return "This email address looks invalid or no longer exists. Confirm the correct address with the stakeholder or client and update their contact record.";
  }
  if (r.includes("spam") || r.includes("block")) {
    return "The recipient's mail server flagged or blocked this message. Ask them to whitelist our sending domain, or resend from an alternate address.";
  }
  if (r.includes("timeout") || r.includes("temporar")) {
    return "This looks like a temporary delivery failure. It may resolve on its own — retry in a few hours, or reach the recipient through another channel in the meantime.";
  }
  return "The recipient's mail server rejected this message. Verify the address is correct and try an alternate contact method.";
}

export function stalledProjectGuidance(): string {
  return "This project hasn't moved in a while and its delivery date is close or has passed. Reach out to the assigned consultant or the client to find out what's blocking progress, or reassign it if the consultant is unavailable.";
}

export function pendingReviewGuidance(): string {
  return "This stakeholder hasn't responded to their review request. Send them a reminder, confirm you have the right contact email, or waive their review if it's no longer needed.";
}

export function expiringTokenGuidance(): string {
  return "This approval link will expire soon with no response yet. The approval-buffer job should issue a fresh token automatically once it runs, or you can contact the stakeholder directly in the meantime.";
}

export function creditRaceEventGuidance(): string {
  return "A duplicate dispatch/webhook tried to bill this project a second time — the atomic ledger guard caught it and skipped the second write, so no double charge occurred. Usually a retried webhook or a doubled click; no action needed unless this project keeps re-triggering it.";
}
