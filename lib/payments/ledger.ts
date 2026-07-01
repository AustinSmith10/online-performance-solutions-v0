import "server-only";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notifications/notify";
import { auditLog } from "@/lib/audit/log";

const LOW_CREDIT_THRESHOLD = 3;

function e(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ─── helpers ────────────────────────────────────────────────────────────────

async function getSuperAdminIds(): Promise<string[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("users")
    .select("id")
    .in("role", ["super_admin", "admin"]);
  return (data ?? []).map((u: { id: string }) => u.id);
}

async function getOrgClientIds(orgId: string): Promise<string[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("users")
    .select("id")
    .eq("client_id", orgId)
    .eq("role", "stakeholder");
  return (data ?? []).map((u: { id: string }) => u.id);
}

async function fireLowCreditNotifications(orgId: string, balance: number) {
  if (balance >= LOW_CREDIT_THRESHOLD) return;
  const [clientIds, adminIds] = await Promise.all([
    getOrgClientIds(orgId),
    getSuperAdminIds(),
  ]);
  const recipients = [...clientIds, ...adminIds];
  const html = `<p style="font-family:sans-serif">Your organisation's credit balance has dropped to <strong>${balance}</strong>. Please top up to avoid disruption to report requests.</p>`;
  await Promise.all(
    recipients.map((id) =>
      notify({
        recipientId: id,
        type: "low_credit",
        message: `Credit balance is low: ${balance} credit${balance === 1 ? "" : "s"} remaining.`,
        emailSubject: "Low credit balance — action required",
        emailHtml: html,
      }).catch(() => {})
    )
  );
}

// ─── public API ─────────────────────────────────────────────────────────────

export async function topUpCredit(
  orgId: string,
  amount: number,
  performedById: string,
  notes?: string
): Promise<void> {
  if (amount < 1) throw new Error("Top-up amount must be at least 1.");

  const supabase = createAdminClient();

  const { data: org, error: orgErr } = await supabase
    .from("clients")
    .select("credit_balance")
    .eq("id", orgId)
    .single();
  if (orgErr || !org) throw new Error("Client not found.");

  const newBalance = (org.credit_balance as number) + amount;

  const { error: updateErr } = await supabase
    .from("clients")
    .update({ credit_balance: newBalance, updated_at: new Date().toISOString() })
    .eq("id", orgId);
  if (updateErr) throw new Error(updateErr.message);

  await supabase.from("credit_ledger").insert({
    client_id: orgId,
    event_type: "top_up",
    amount,
    balance_after: newBalance,
    performed_by: performedById,
    notes: notes ?? null,
  });

  await auditLog("credit.top_up", performedById, null, {
    orgId,
    metadata: { amount, balance_after: newBalance, notes: notes ?? null },
  });

  revalidatePath(`/admin/credits/${orgId}`);
  revalidatePath("/admin/credits");
}

export async function deductCredit(
  orgId: string,
  projectId: string,
  performedById: string
): Promise<void> {
  const supabase = createAdminClient();

  const { data: org, error: orgErr } = await supabase
    .from("clients")
    .select("credit_balance, name")
    .eq("id", orgId)
    .single();
  if (orgErr || !org) throw new Error("Client not found.");

  const balance = org.credit_balance as number;

  if (balance < 1) {
    const adminIds = await getSuperAdminIds();
    const clientIds = await getOrgClientIds(orgId);
    const html = `<p style="font-family:sans-serif">A report request could not proceed because the organisation's credit balance is <strong>0</strong>. Please top up credits or apply a payment override.</p>`;
    await Promise.all(
      [...clientIds, ...adminIds].map((id) =>
        notify({
          recipientId: id,
          type: "insufficient_credit",
          message: "Insufficient credits — dispatch blocked.",
          projectId,
          emailSubject: "Insufficient credit balance — dispatch blocked",
          emailHtml: html,
        }).catch(() => {})
      )
    );
    throw new Error("Insufficient credit balance — dispatch blocked.");
  }

  const newBalance = balance - 1;

  const [updateErr1, updateErr2] = await Promise.all([
    supabase
      .from("clients")
      .update({ credit_balance: newBalance, updated_at: new Date().toISOString() })
      .eq("id", orgId)
      .then((r) => r.error),
    supabase
      .from("projects")
      .update({ credit_deducted: true, updated_at: new Date().toISOString() })
      .eq("id", projectId)
      .then((r) => r.error),
  ]);
  if (updateErr1) throw new Error(updateErr1.message);
  if (updateErr2) throw new Error(updateErr2.message);

  await supabase.from("credit_ledger").insert({
    client_id: orgId,
    project_id: projectId,
    event_type: "deduction",
    amount: -1,
    balance_after: newBalance,
    performed_by: performedById,
  });

  const adminIds = await getSuperAdminIds();
  const clientIds = await getOrgClientIds(orgId);
  const orgName = e(org.name as string);
  const deductHtml = `<p style="font-family:sans-serif">1 credit has been deducted from <strong>${orgName}</strong>. Remaining balance: <strong>${newBalance}</strong>.</p>`;
  await Promise.all(
    [...clientIds, ...adminIds].map((id) =>
      notify({
        recipientId: id,
        type: "credit_deduction",
        message: `1 credit deducted. New balance: ${newBalance}.`,
        projectId,
        emailSubject: "Credit deducted",
        emailHtml: deductHtml,
      }).catch(() => {})
    )
  );

  await auditLog("credit.deduction", performedById, null, {
    orgId,
    projectId,
    metadata: { balance_after: newBalance },
  });

  await fireLowCreditNotifications(orgId, newBalance);

  revalidatePath(`/admin/credits/${orgId}`);
  revalidatePath("/admin/credits");
}

export async function debitDeferred(
  orgId: string,
  projectId: string,
  performedById: string
): Promise<void> {
  const supabase = createAdminClient();

  const { data: org, error: orgErr } = await supabase
    .from("clients")
    .select("deferred_balance, credit_limit, is_frozen")
    .eq("id", orgId)
    .single();
  if (orgErr || !org) throw new Error("Client not found.");

  if (org.is_frozen as boolean) {
    throw new Error("Client account is frozen — deferred dispatch blocked.");
  }

  const deferred = org.deferred_balance as number;
  const limit = org.credit_limit as number;
  if (limit > 0 && deferred >= limit) {
    throw new Error("Deferred credit limit reached — dispatch blocked.");
  }

  const newDeferred = deferred + 1;

  const [updateErr1, updateErr2] = await Promise.all([
    supabase
      .from("clients")
      .update({ deferred_balance: newDeferred, updated_at: new Date().toISOString() })
      .eq("id", orgId)
      .then((r) => r.error),
    supabase
      .from("projects")
      .update({ credit_deducted: true, updated_at: new Date().toISOString() })
      .eq("id", projectId)
      .then((r) => r.error),
  ]);
  if (updateErr1) throw new Error(updateErr1.message);
  if (updateErr2) throw new Error(updateErr2.message);

  await supabase.from("credit_ledger").insert({
    client_id: orgId,
    project_id: projectId,
    event_type: "deferred_debit",
    amount: -1,
    balance_after: newDeferred,
    performed_by: performedById,
    notes: `Deferred tab: ${newDeferred}`,
  });

  await auditLog("credit.deferred_debit", performedById, null, {
    orgId,
    projectId,
    metadata: { deferred_balance_after: newDeferred },
  });

  revalidatePath(`/admin/credits/${orgId}`);
}

export async function logUpfront(
  orgId: string,
  projectId: string,
  performedById: string
): Promise<void> {
  const supabase = createAdminClient();

  const { data: org, error: orgErr } = await supabase
    .from("clients")
    .select("credit_balance")
    .eq("id", orgId)
    .single();
  if (orgErr || !org) throw new Error("Client not found.");

  await Promise.all([
    supabase.from("credit_ledger").insert({
      client_id: orgId,
      project_id: projectId,
      event_type: "upfront_log",
      amount: 0,
      balance_after: org.credit_balance as number,
      performed_by: performedById,
      notes: "Upfront payment — ledger entry only",
    }),
    supabase
      .from("projects")
      .update({ credit_deducted: true, updated_at: new Date().toISOString() })
      .eq("id", projectId),
  ]);

  revalidatePath(`/admin/credits/${orgId}`);
}

export async function logOverride(
  projectId: string,
  performedById: string,
  reason: string
): Promise<void> {
  const supabase = createAdminClient();

  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("client_id, project_number, site_address, extracted_fields")
    .eq("id", projectId)
    .single();
  if (projErr || !project) throw new Error("Project not found.");

  const { data: org, error: orgErr } = await supabase
    .from("clients")
    .select("credit_balance")
    .eq("id", project.client_id as string)
    .single();
  if (orgErr || !org) throw new Error("Client not found.");

  const now = new Date().toISOString();

  const [overrideErr] = await Promise.all([
    supabase
      .from("projects")
      .update({
        payment_override: true,
        payment_override_reason: reason,
        payment_override_at: now,
        payment_override_by: performedById,
        credit_deducted: true,
        updated_at: now,
      })
      .eq("id", projectId)
      .then((r) => r.error),
    supabase.from("credit_ledger").insert({
      client_id: project.client_id,
      project_id: projectId,
      event_type: "override",
      amount: 0,
      balance_after: org.credit_balance as number,
      performed_by: performedById,
      notes: reason,
    }),
  ]);
  if (overrideErr) throw new Error(overrideErr.message);

  const adminIds = await getSuperAdminIds();
  const address = (project.site_address as string | null) ??
    ((project.extracted_fields as Record<string, string> | null)?.["EXTRACT_ADDRESS"]) ??
    null;
  const projectRef = address ?? (project.project_number as string | null) ?? projectId.slice(0, 8);
  const safeReason = e(reason);
  const html = `<p style="font-family:sans-serif">A payment gate override has been applied to project <strong>${e(projectRef)}</strong>.</p><p style="font-family:sans-serif"><strong>Reason:</strong> ${safeReason}</p><p style="font-family:sans-serif">This project is flagged <em>Override — Payment Pending</em> until manually reconciled.</p>`;
  await Promise.all(
    adminIds.map((id) =>
      notify({
        recipientId: id,
        type: "payment_override",
        message: `Payment override applied to ${projectRef}. Reason: ${reason}`,
        projectId,
        emailSubject: `Payment override applied — ${projectRef}`,
        emailHtml: html,
      }).catch(() => {})
    )
  );

  await auditLog("payment.override_applied", performedById, null, {
    projectId,
    orgId: project.client_id as string,
    metadata: { reason, project_number: project.project_number ?? null },
  });

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath("/admin/projects");
}
