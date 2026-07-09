// ─── Event taxonomy ──────────────────────────────────────────────────────────
// Shared between the admin audit page (app/(admin)/admin/audit/page.tsx) and
// any project-scoped audit surfaces (e.g. the consultant project audit tab).
// Keep this in sync with every auditLog(...) call site in the codebase —
// an event type missing here silently drops out of every audit view.

export const CATEGORIES: Record<string, { label: string; color: string; events: string[] }> = {
  auth: {
    label: "Authentication",
    color: "bg-indigo-100 text-indigo-700",
    events: [
      "auth.login",
      "auth.2fa_disabled",
      "auth.2fa_required",
      "auth.password_reset_generated",
      "auth.password_reset_requested",
      "auth.password_reset_rate_limited",
      "auth.password_reset_completed",
    ],
  },
  user: {
    label: "Users",
    color: "bg-cyan-100 text-cyan-700",
    events: [
      "user.account_created",
      "user.deactivated",
      "user.restored",
      "user.email_updated",
      "user.profile_updated",
      "user.soft_deleted",
      "user.recovered",
    ],
  },
  project: {
    label: "Projects",
    color: "bg-blue-100 text-blue-700",
    events: [
      "project.draft_created",
      "project.submitted",
      "project.review_confirmed",
      "project.pbdb_generated",
      "project.pbdb_regenerated",
      "project.pbdb_resent",
      "project.pbdb_qa_uploaded",
      "project.qa_complete",
      "project.revision_complete",
      "project.pbdb_dispatched",
      "project.dispatched", // legacy name for project.pbdb_dispatched — kept so pre-rename rows still render
      "project.purged",
      "project.soft_deleted",
      "project.admin_deleted",
      "project.restored",
      "project.fields_updated",
      "project.details_edited",
      "project.submission_edited",
      "project.number_set",
      "project.paused",
      "project.resumed",
      "project.delivered",
      "assignment.created",
      "pbdr.delivered",
      "pbdr.redelivered",
      "pbdr.conversion_failed",
      "project.complete",
      "project.pbdr_downloaded",
      "project.pbdb_downloaded",
      "evidence.attached",
    ],
  },
  stakeholder: {
    label: "Stakeholders",
    color: "bg-amber-100 text-amber-700",
    events: [
      "stakeholder.responded",
      "stakeholder.responded_via_portal",
      "stakeholder.waived",
      "stakeholder.token_resent",
      "stakeholder.token_self_reissued",
      "stakeholder.email_updated",
      "stakeholder.token_accessed",
      "stakeholder.pbdb_downloaded",
      "stakeholder.soft_deleted",
      "stakeholder.restored",
    ],
  },
  credit: {
    label: "Credits & Payments",
    color: "bg-emerald-100 text-emerald-700",
    events: [
      "credit.top_up",
      "credit.deduction",
      "credit.deferred_debit",
      "payment.override_applied",
      "payment.override_reconciled",
    ],
  },
  email: {
    label: "Email",
    color: "bg-orange-100 text-orange-700",
    events: [
      "email.draft_created",
      "email.thread_reply_invalid",
      "email.thread_attachments_added",
      "email.unrecognised_sender",
      "email.whitelist_blocked",
      "email.no_attachments",
      "email.duplicate_address",
    ],
  },
  template: {
    label: "Templates",
    color: "bg-purple-100 text-purple-700",
    events: [
      "template.uploaded",
      "template.activated",
      "template.deactivated",
      "template.deleted",
      "template.soft_deleted",
      "template.restored",
      "template.reuploaded",
      "template.reactivated",
      "template.mapping_updated",
      "template.token_added",
      "template.token_deleted",
    ],
  },
  org: {
    label: "Clients",
    color: "bg-zinc-200 text-zinc-700",
    events: [
      "org.created",
      "org.updated",
      "org.config_updated",
      "org.frozen",
      "org.unfrozen",
      "org.deleted",
      "org.soft_deleted",
      "org.restored",
    ],
  },
  audit: {
    label: "Audit",
    color: "bg-sky-100 text-sky-700",
    events: ["audit.export_downloaded"],
  },
  settings: {
    label: "Settings",
    color: "bg-teal-100 text-teal-700",
    events: ["settings.digest_schedule_updated", "settings.admin_nav_restrictions_updated"],
  },
};

export const EVENT_LABELS: Record<string, string> = {
  "auth.login": "User logged in",
  "auth.2fa_disabled": "2FA disabled",
  "auth.2fa_required": "2FA enforced",
  "auth.password_reset_generated": "Password reset link generated",
  "auth.password_reset_requested": "Self-serve password reset requested",
  "auth.password_reset_rate_limited": "Password reset request throttled",
  "auth.password_reset_completed": "Password reset completed",
  "user.account_created": "Account created",
  "user.deactivated": "Account deactivated",
  "user.restored": "Account restored",
  "user.email_updated": "Account email changed",
  "user.profile_updated": "Account profile updated",
  "user.soft_deleted": "Account deleted",
  "user.recovered": "Account restored from recovery bin",
  "project.draft_created": "New report request started",
  "project.submitted": "Project submitted",
  "project.review_confirmed": "Client confirmed report details reviewed",
  "project.pbdb_generated": "PBDB generated",
  "project.pbdb_regenerated": "PBDB regenerated",
  "project.pbdb_resent": "PBDB re-sent to stakeholders",
  "project.pbdb_qa_uploaded": "QA document uploaded",
  "project.qa_complete": "QA marked complete",
  "project.revision_complete": "Revision complete",
  "project.pbdb_dispatched": "PBDB dispatched to stakeholders",
  "project.dispatched": "PBDB dispatched to stakeholders",
  "project.purged": "Project permanently deleted",
  "project.soft_deleted": "Project archived",
  "project.admin_deleted": "Project archived by admin",
  "project.restored": "Project restored",
  "project.fields_updated": "Project fields edited",
  "project.details_edited": "Project details edited",
  "project.submission_edited": "Submission edited",
  "project.number_set": "Project number set",
  "project.paused": "Project paused",
  "project.resumed": "Project resumed",
  "project.delivered": "Project delivered to client",
  "assignment.created": "Consultant assigned",
  "pbdr.delivered": "PBDR delivered to client",
  "pbdr.redelivered": "PBDR re-delivered to client",
  "pbdr.conversion_failed": "PBDR conversion failed",
  "project.complete": "Project marked complete",
  "project.pbdr_downloaded": "PBDR downloaded",
  "project.pbdb_downloaded": "PBDB downloaded",
  "evidence.attached": "Evidence attached",
  "stakeholder.responded": "Stakeholder responded",
  "stakeholder.responded_via_portal": "Stakeholder responded via portal",
  "stakeholder.waived": "Stakeholder review waived",
  "stakeholder.token_resent": "Access link resent",
  "stakeholder.token_self_reissued": "Stakeholder self-served a new access link",
  "stakeholder.email_updated": "Stakeholder email changed",
  "stakeholder.token_accessed": "Stakeholder opened approval link",
  "stakeholder.pbdb_downloaded": "Stakeholder downloaded PBDB",
  "stakeholder.soft_deleted": "Stakeholder deleted",
  "stakeholder.restored": "Stakeholder restored",
  "credit.top_up": "Credits added",
  "credit.deduction": "Credits deducted",
  "credit.deferred_debit": "Deferred debit recorded",
  "payment.override_applied": "Payment override applied",
  "payment.override_reconciled": "Payment override reconciled",
  "email.draft_created": "Project submitted via email",
  "email.thread_reply_invalid": "Invalid email reply rejected",
  "email.thread_attachments_added": "Attachments added via email",
  "email.unrecognised_sender": "Email from unknown sender",
  "email.whitelist_blocked": "Sender not on allowlist",
  "email.no_attachments": "Email received with no attachments",
  "email.duplicate_address": "Duplicate site address detected",
  "template.uploaded": "Template uploaded",
  "template.activated": "Template activated",
  "template.deactivated": "Template deactivated",
  "template.deleted": "Template deleted",
  "template.soft_deleted": "Template moved to recovery bin",
  "template.restored": "Template restored",
  "template.reuploaded": "Template file replaced",
  "template.reactivated": "Template reactivated",
  "template.mapping_updated": "Template mappings updated",
  "template.token_added": "Extraction token added",
  "template.token_deleted": "Extraction token removed",
  "org.created": "Client created",
  "org.updated": "Client updated",
  "org.config_updated": "Client settings changed",
  "org.frozen": "Client frozen",
  "org.unfrozen": "Client unfrozen",
  "org.deleted": "Client deleted",
  "org.soft_deleted": "Client deleted",
  "org.restored": "Client restored",
  "audit.export_downloaded": "Audit trail exported",
  "settings.digest_schedule_updated": "Digest schedule changed",
  "settings.admin_nav_restrictions_updated": "Admin nav restrictions changed",
};

export const EVENT_CATEGORY: Record<string, string> = {};
for (const [key, cat] of Object.entries(CATEGORIES)) {
  for (const ev of cat.events) {
    EVENT_CATEGORY[ev] = key;
  }
}

export function getCategoryInfo(eventType: string) {
  const key = EVENT_CATEGORY[eventType];
  return key ? { key, ...CATEGORIES[key] } : null;
}

// ─── Metadata → natural language ─────────────────────────────────────────────

export function formatDetails(
  eventType: string,
  metadata: Record<string, unknown> | null
): string {
  if (!metadata) return "";
  const s = (v: unknown): string => (typeof v === "string" ? v : "");
  const n = (v: unknown): number | null => (typeof v === "number" ? v : null);

  const parts: string[] = [];

  switch (eventType) {
    case "auth.login":
      if (s(metadata.role))
        parts.push(`Logged in as ${s(metadata.role).replace(/_/g, " ")}`);
      break;

    case "auth.password_reset_generated":
    case "auth.password_reset_requested":
    case "auth.password_reset_rate_limited":
    case "auth.password_reset_completed":
      if (s(metadata.target_email)) parts.push(s(metadata.target_email));
      break;

    case "project.pbdb_generated":
      if (s(metadata.project_number)) parts.push(`Project #${s(metadata.project_number)}`);
      break;

    case "project.pbdb_regenerated":
      if (s(metadata.actor)) parts.push(`By ${s(metadata.actor).replace(/_/g, " ")}`);
      break;

    case "project.pbdb_resent": {
      const cycle = n(metadata.review_cycle);
      const ver = n(metadata.version);
      if (cycle !== null) parts.push(`Cycle ${cycle}`);
      if (ver !== null) parts.push(`v${ver}`);
      if (s(metadata.filename)) parts.push(s(metadata.filename));
      break;
    }

    case "project.revision_complete": {
      const cycle = n(metadata.review_cycle);
      const ver = n(metadata.version);
      if (cycle !== null) parts.push(`Cycle ${cycle}`);
      if (ver !== null) parts.push(`v${ver}`);
      if (s(metadata.filename)) parts.push(s(metadata.filename));
      break;
    }

    case "project.pbdb_qa_uploaded": {
      const ver = n(metadata.version);
      if (ver !== null) parts.push(`v${ver}`);
      if (s(metadata.filename)) parts.push(s(metadata.filename));
      break;
    }

    case "project.qa_complete":
      if (s(metadata.project_ref)) parts.push(`Ref: ${s(metadata.project_ref)}`);
      break;

    case "project.draft_created": {
      if (s(metadata.templateName)) parts.push(`Report type: ${s(metadata.templateName)}`);
      const files = metadata.files as { slug?: string; label?: string; filename?: string }[] | undefined;
      if (Array.isArray(files) && files.length > 0) {
        parts.push(files.map((f) => `${f.label ?? f.slug ?? "file"}: ${f.filename ?? "—"}`).join(", "));
      }
      const fields = metadata.extracted_fields as Record<string, string> | undefined;
      if (fields) {
        const filled = Object.entries(fields).filter(([, v]) => v);
        if (filled.length > 0) {
          const preview = filled.slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(", ");
          parts.push(
            filled.length > 3 ? `${preview}, +${filled.length - 3} more field${filled.length - 3 !== 1 ? "s" : ""}` : preview
          );
        }
      }
      break;
    }

    case "project.pbdb_dispatched":
    case "project.dispatched": {
      const stakeholders = metadata.stakeholders;
      if (Array.isArray(stakeholders) && stakeholders.length > 0) {
        const names = stakeholders
          .map((sh) => {
            if (!sh || typeof sh !== "object") return null;
            const name = s((sh as Record<string, unknown>).name);
            const email = s((sh as Record<string, unknown>).email);
            if (name && email) return `${name} <${email}>`;
            return name || email || null;
          })
          .filter((v): v is string => !!v);
        if (names.length > 0) parts.push(`Sent to: ${names.join(", ")}`);
      } else {
        const count = n(metadata.stakeholder_count);
        if (count !== null) parts.push(`Sent to ${count} stakeholder${count === 1 ? "" : "s"}`);
      }
      break;
    }

    case "project.submitted": {
      if (s(metadata.poNumber)) parts.push(`PO: ${s(metadata.poNumber)}`);
      const corrected = metadata.corrected_fields;
      if (Array.isArray(corrected) && corrected.length > 0) {
        parts.push(`Corrected: ${corrected.join(", ")}`);
      }
      break;
    }

    case "project.purged":
      if (s(metadata.deletedBy)) parts.push(`Deleted by ${s(metadata.deletedBy)}`);
      break;

    case "project.admin_deleted":
      if (s(metadata.status_at_deletion)) parts.push(`Status: ${s(metadata.status_at_deletion)}`);
      break;

    case "project.details_edited":
    case "project.submission_edited": {
      const changed = metadata.changed_fields;
      if (Array.isArray(changed) && changed.length > 0) parts.push(changed.join(", "));
      if (s(metadata.document_added)) parts.push(`Added ${s(metadata.document_added)}`);
      const replaced = metadata.document_replaced as { previous?: string; new?: string } | undefined;
      if (replaced?.new) parts.push(`Replaced ${replaced.previous ?? "file"} → ${replaced.new}`);
      if (s(metadata.previous_po_number) || s(metadata.new_po_number))
        parts.push(`PO: ${s(metadata.previous_po_number) || "—"} → ${s(metadata.new_po_number) || "—"}`);
      if (s(metadata.previous_number) || s(metadata.new_number))
        parts.push(`#${s(metadata.previous_number) || "—"} → ${s(metadata.new_number) || "—"}`);
      break;
    }

    case "project.number_set":
      if (s(metadata.project_number)) parts.push(`#${s(metadata.project_number)}`);
      if (s(metadata.previous_number)) parts.push(`(was ${s(metadata.previous_number)})`);
      break;

    case "project.paused":
      if (s(metadata.previous_status)) parts.push(`From ${s(metadata.previous_status).replace(/_/g, " ")}`);
      if (s(metadata.reason)) parts.push(s(metadata.reason));
      break;

    case "project.resumed":
      if (s(metadata.restored_to_status))
        parts.push(`To ${s(metadata.restored_to_status).replace(/_/g, " ")}`);
      if (s(metadata.delivery_date_extended_to))
        parts.push(`Due ${s(metadata.delivery_date_extended_to)}`);
      break;

    case "project.delivered":
      if (s(metadata.project_number)) parts.push(`#${s(metadata.project_number)}`);
      break;

    case "assignment.created":
      if (s(metadata.consultant_name)) parts.push(`→ ${s(metadata.consultant_name)}`);
      break;

    case "pbdr.delivered":
    case "pbdr.redelivered": {
      const ver = n(metadata.pbdr_version);
      if (ver !== null) parts.push(`v${ver}`);
      if (s(metadata.triggered_by) === "auto") parts.push("Auto-triggered");
      else if (s(metadata.triggered_by)) parts.push(s(metadata.triggered_by).replace(/_/g, " "));
      break;
    }

    case "pbdr.conversion_failed": {
      const ver = n(metadata.pbdr_version);
      if (ver !== null) parts.push(`v${ver}`);
      if (s(metadata.error)) parts.push(s(metadata.error));
      break;
    }

    case "stakeholder.responded":
    case "stakeholder.responded_via_portal":
      if (s(metadata.response)) parts.push(`Response: ${s(metadata.response)}`);
      if (n(metadata.review_cycle) !== null) parts.push(`Cycle ${n(metadata.review_cycle)}`);
      break;

    case "stakeholder.waived":
      if (s(metadata.reason)) parts.push(s(metadata.reason));
      break;

    case "stakeholder.token_resent":
    case "stakeholder.token_self_reissued":
      if (s(metadata.email)) parts.push(s(metadata.email));
      break;

    case "stakeholder.email_updated":
      if (s(metadata.new_email)) parts.push(`→ ${s(metadata.new_email)}`);
      break;

    case "stakeholder.token_accessed":
      if (n(metadata.review_cycle) !== null) parts.push(`Cycle ${n(metadata.review_cycle)}`);
      break;

    case "stakeholder.pbdb_downloaded":
      if (n(metadata.version) !== null) parts.push(`v${n(metadata.version)}`);
      break;

    case "project.complete":
      if (s(metadata.project_number)) parts.push(`#${s(metadata.project_number)}`);
      break;

    case "project.pbdr_downloaded":
      if (s(metadata.role)) parts.push(s(metadata.role).replace(/_/g, " "));
      if (s(metadata.filename)) parts.push(s(metadata.filename));
      break;

    case "project.pbdb_downloaded":
      if (s(metadata.role)) parts.push(s(metadata.role).replace(/_/g, " "));
      if (n(metadata.version) !== null) parts.push(`v${n(metadata.version)}`);
      if (s(metadata.filename)) parts.push(s(metadata.filename));
      break;

    case "evidence.attached":
      if (s(metadata.filename)) parts.push(s(metadata.filename));
      if (s(metadata.reference)) parts.push(`Re: ${s(metadata.reference)}`);
      break;

    case "credit.top_up": {
      const amount = n(metadata.amount);
      const bal = n(metadata.balance_after);
      if (amount !== null) parts.push(`+${amount} credits`);
      if (bal !== null) parts.push(`Balance: ${bal}`);
      if (s(metadata.notes)) parts.push(s(metadata.notes));
      break;
    }

    case "credit.deduction": {
      const bal = n(metadata.balance_after);
      if (bal !== null) parts.push(`Balance after: ${bal}`);
      break;
    }

    case "credit.deferred_debit": {
      const bal = n(metadata.deferred_balance_after);
      if (bal !== null) parts.push(`Deferred balance: ${bal}`);
      break;
    }

    case "payment.override_applied":
      if (s(metadata.project_number)) parts.push(`#${s(metadata.project_number)}`);
      if (s(metadata.reason)) parts.push(s(metadata.reason));
      break;

    case "payment.override_reconciled":
      if (s(metadata.project_number)) parts.push(`#${s(metadata.project_number)}`);
      break;

    case "email.draft_created": {
      const atts = metadata.attachments;
      if (Array.isArray(atts))
        parts.push(`${atts.length} attachment${atts.length !== 1 ? "s" : ""}`);
      break;
    }

    case "email.thread_attachments_added": {
      const atts = metadata.attachments;
      if (Array.isArray(atts))
        parts.push(`${atts.length} attachment${atts.length !== 1 ? "s" : ""}`);
      break;
    }

    case "email.duplicate_address":
      if (s(metadata.site_address)) parts.push(s(metadata.site_address));
      break;

    case "template.uploaded":
    case "template.activated":
    case "template.deactivated":
    case "template.deleted":
    case "template.reuploaded":
    case "template.reactivated":
      if (s(metadata.name)) parts.push(s(metadata.name));
      break;

    case "template.mapping_updated": {
      if (s(metadata.name)) parts.push(s(metadata.name));
      const count = n(metadata.tokenCount);
      if (count !== null) parts.push(`${count} token${count !== 1 ? "s" : ""}`);
      break;
    }

    case "template.token_added":
    case "template.token_deleted":
      if (s(metadata.name)) parts.push(s(metadata.name));
      if (s(metadata.token)) parts.push(`{${s(metadata.token)}}`);
      break;

    case "project.fields_updated": {
      const keys = Object.keys((metadata.updated as object) ?? {});
      if (keys.length > 0) parts.push(keys.join(", "));
      break;
    }

    case "org.created":
    case "org.updated":
    case "org.deleted":
    case "org.soft_deleted":
    case "org.restored":
      if (s(metadata.name)) parts.push(s(metadata.name));
      if (s(metadata.payment_method))
        parts.push(`(${s(metadata.payment_method).replace(/_/g, " ")})`);
      break;

    case "org.config_updated":
      if (Array.isArray(metadata.keys))
        parts.push(`Updated: ${(metadata.keys as string[]).join(", ")}`);
      break;

    case "settings.digest_schedule_updated":
      if (s(metadata.morning)) parts.push(`Morning: ${s(metadata.morning)}`);
      if (s(metadata.afternoon)) parts.push(`Afternoon: ${s(metadata.afternoon)}`);
      break;

    case "settings.admin_nav_restrictions_updated":
      if (Array.isArray(metadata.restricted)) {
        parts.push(
          metadata.restricted.length
            ? `Restricted: ${(metadata.restricted as string[]).join(", ")}`
            : "No restrictions"
        );
      }
      break;

    case "audit.export_downloaded": {
      if (s(metadata.format)) parts.push(s(metadata.format).toUpperCase());
      const count = n(metadata.entry_count);
      if (count !== null) parts.push(`${count} entr${count === 1 ? "y" : "ies"}`);
      const sha = s(metadata.sha256);
      if (sha) parts.push(`sha256:${sha.slice(0, 12)}…`);
      break;
    }

    default:
      break;
  }

  return parts.join(" · ");
}
