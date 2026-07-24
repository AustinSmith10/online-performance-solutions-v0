import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notifications/notify";
import { auditLog } from "@/lib/audit/log";
import { renderCreditDeductionEmail } from "@/lib/email/templates/CreditDeductionEmail";
import { renderLowCreditEmail } from "@/lib/email/templates/LowCreditEmail";
import { renderEmailShell, e, paragraph, strong, panel } from "@/lib/email/templates/shell";

const LOW_CREDIT_THRESHOLD = 3;

// ─── helpers ────────────────────────────────────────────────────────────────

async function getSuperAdminIds(): Promise<string[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("users")
    .select("id")
    .in("role", ["super_admin", "admin"]);
  return (data ?? []).map((u: { id: string }) => u.id);
}

// Human-readable project reference for emails: site address if known, else the
// project number, else a short id. Mirrors how applyPaymentOverride builds it.
async function resolveProjectRef(projectId: string): Promise<string> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("projects")
    .select("project_number, site_address, extracted_fields")
    .eq("id", projectId)
    .maybeSingle();
  if (!data) return projectId.slice(0, 8);
  const address =
    (data.site_address as string | null) ??
    ((data.extracted_fields as Record<string, string> | null)?.["EXTRACT_ADDRESS"] ?? null);
  return address ?? (data.project_number as string | null) ?? projectId.slice(0, 8);
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

async function getClientName(orgId: string): Promise<string> {
  const supabase = createAdminClient();
  const { data } = await supabase.from("clients").select("name").eq("id", orgId).maybeSingle();
  return (data?.name as string | undefined) ?? "Client";
}

async function fireLowCreditNotifications(orgId: string, balance: number, orgName: string) {
  if (balance >= LOW_CREDIT_THRESHOLD) return;
  const [clientIds, adminIds] = await Promise.all([
    getOrgClientIds(orgId),
    getSuperAdminIds(),
  ]);
  const message = `Credit balance is low: ${balance} credit${balance === 1 ? "" : "s"} remaining.`;
  // Client users and admins land on different account pages, so each group gets
  // a CTA pointing at the view they can actually act on.
  const recipients: { ids: string[]; portalUrl: string }[] = [
    { ids: clientIds, portalUrl: `${process.env.NEXT_PUBLIC_APP_URL}/portal` },
    { ids: adminIds, portalUrl: `${process.env.NEXT_PUBLIC_APP_URL}/admin/credits/${orgId}` },
  ];
  await Promise.all(
    recipients.flatMap(({ ids, portalUrl }) =>
      ids.map((id) =>
        notify({
          recipientId: id,
          type: "low_credit",
          message,
          emailSubject: "Low credit balance — action required",
          emailHtml: renderLowCreditEmail({ orgName, currentBalance: balance, portalUrl }),
        }).catch(() => {})
      )
    )
  );
}

// credit_deducted claims lost to a concurrent call are expected, quiet
// successes — but they must not fail silently, so every "already_deducted"
// outcome from the atomic RPCs lands here for admin visibility (issue #103).
async function recordCreditRaceEvent(
  eventType: "deduct_credit" | "debit_deferred" | "log_upfront" | "log_override" | "reconcile_override",
  clientId: string | null,
  projectId: string | null
) {
  const supabase = createAdminClient();
  await supabase.from("credit_race_events").insert({
    client_id: clientId,
    project_id: projectId,
    event_type: eventType,
  });
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

  const { data, error } = await supabase
    .rpc("top_up_credit", {
      p_client_id: orgId,
      p_amount: amount,
      p_performed_by: performedById,
      p_notes: notes ?? null,
    })
    .single();
  if (error) throw new Error(error.message);

  const { status, new_balance: newBalance } = data as { status: string; new_balance: number | null };
  if (status === "not_found") throw new Error("Client not found.");

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

  const { data, error } = await supabase
    .rpc("deduct_credit", {
      p_client_id: orgId,
      p_project_id: projectId,
      p_performed_by: performedById,
    })
    .single();
  if (error) throw new Error(error.message);

  const { status, new_balance: newBalance } = data as { status: string; new_balance: number | null };

  if (status === "not_found") throw new Error("Client not found.");

  if (status === "already_deducted") {
    await recordCreditRaceEvent("deduct_credit", orgId, projectId);
    return;
  }

  if (status === "insufficient_balance") {
    const orgName = await getClientName(orgId);
    const adminIds = await getSuperAdminIds();
    const clientIds = await getOrgClientIds(orgId);
    const html = renderEmailShell({
      status: "error",
      statusLabel: "Dispatch blocked",
      heading: "Insufficient credit balance",
      bodyHtml:
        paragraph(
          `A report request for ${strong(orgName)} could not proceed — the credit balance is 0.`
        ) + paragraph("Please top up credits or apply a payment override to continue.", 20),
    });
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

  // status === "ok"
  const orgName = await getClientName(orgId);
  const [adminIds, clientIds, projectRef] = await Promise.all([
    getSuperAdminIds(),
    getOrgClientIds(orgId),
    resolveProjectRef(projectId),
  ]);
  const message = `1 credit deducted. New balance: ${newBalance}.`;
  // Client users and admins land on different account pages, so each group gets
  // a CTA pointing at the view they can actually act on.
  const deductionRecipients: { ids: string[]; portalUrl: string }[] = [
    { ids: clientIds, portalUrl: `${process.env.NEXT_PUBLIC_APP_URL}/portal` },
    { ids: adminIds, portalUrl: `${process.env.NEXT_PUBLIC_APP_URL}/admin/credits/${orgId}` },
  ];
  await Promise.all(
    deductionRecipients.flatMap(({ ids, portalUrl }) =>
      ids.map((id) =>
        notify({
          recipientId: id,
          type: "credit_deduction",
          message,
          projectId,
          emailSubject: "Credit deducted",
          emailHtml: renderCreditDeductionEmail({
            orgName,
            projectRef,
            creditsDeducted: 1,
            newBalance: newBalance as number,
            portalUrl,
          }),
        }).catch(() => {})
      )
    )
  );

  await auditLog("credit.deduction", performedById, null, {
    orgId,
    projectId,
    metadata: { balance_after: newBalance },
  });

  await fireLowCreditNotifications(orgId, newBalance as number, orgName);

  revalidatePath(`/admin/credits/${orgId}`);
  revalidatePath("/admin/credits");
}

export async function debitDeferred(
  orgId: string,
  projectId: string,
  performedById: string
): Promise<void> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .rpc("debit_deferred", {
      p_client_id: orgId,
      p_project_id: projectId,
      p_performed_by: performedById,
    })
    .single();
  if (error) throw new Error(error.message);

  const { status, new_deferred_balance: newDeferred } = data as {
    status: string;
    new_deferred_balance: number | null;
  };

  if (status === "not_found") throw new Error("Client not found.");

  if (status === "already_deducted") {
    await recordCreditRaceEvent("debit_deferred", orgId, projectId);
    return;
  }

  if (status === "frozen") {
    throw new Error("Client account is frozen — deferred dispatch blocked.");
  }
  if (status === "limit_reached") {
    throw new Error("Deferred credit limit reached — dispatch blocked.");
  }

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

  const { data, error } = await supabase
    .rpc("log_upfront", {
      p_client_id: orgId,
      p_project_id: projectId,
      p_performed_by: performedById,
    })
    .single();
  if (error) throw new Error(error.message);

  const { status } = data as { status: string; balance: number | null };

  if (status === "not_found") throw new Error("Client not found.");

  if (status === "already_deducted") {
    await recordCreditRaceEvent("log_upfront", orgId, projectId);
    return;
  }

  revalidatePath(`/admin/credits/${orgId}`);
}

export async function logOverride(
  projectId: string,
  performedById: string,
  reason: string
): Promise<void> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .rpc("log_override", {
      p_project_id: projectId,
      p_performed_by: performedById,
      p_reason: reason,
    })
    .single();
  if (error) throw new Error(error.message);

  const { status } = data as { status: string; balance: number | null };

  if (status === "not_found") throw new Error("Project not found.");

  const { data: project } = await supabase
    .from("projects")
    .select("client_id, project_number, site_address, extracted_fields")
    .eq("id", projectId)
    .maybeSingle();

  if (status === "already_deducted") {
    await recordCreditRaceEvent(
      "log_override",
      (project?.client_id as string | undefined) ?? null,
      projectId
    );
    return;
  }

  // status === "ok"
  const adminIds = await getSuperAdminIds();
  const address =
    (project?.site_address as string | null) ??
    ((project?.extracted_fields as Record<string, string> | null)?.["EXTRACT_ADDRESS"]) ??
    null;
  const projectRef = address ?? (project?.project_number as string | null) ?? projectId.slice(0, 8);
  const html = renderEmailShell({
    status: "action",
    statusLabel: "Needs reconciling",
    heading: "Payment override applied",
    bodyHtml:
      paragraph(`A payment gate override has been applied to project ${strong(projectRef)}.`) +
      panel("Reason", e(reason)) +
      paragraph(
        "This project stays flagged <em>Override — Payment Pending</em> until it is manually reconciled.",
        20
      ),
  });
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
    orgId: (project?.client_id as string) ?? null,
    metadata: { reason, project_number: project?.project_number ?? null },
  });

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath("/admin/projects");
}

export async function reconcileOverride(
  projectId: string,
  performedById: string,
  performedByEmail: string | null
): Promise<void> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .rpc("reconcile_override", {
      p_project_id: projectId,
      p_performed_by: performedById,
      p_notes: `Override reconciled by ${performedByEmail ?? performedById}`,
    })
    .single();
  if (error) throw new Error(error.message);

  const { status } = data as { status: string; balance: number | null };

  if (status === "not_found") throw new Error("Project not found.");

  if (status === "no_override") {
    // Either there was never an override, or someone else already reconciled
    // it (double-submit) — the same idempotency-guard shape as log_override's
    // already_deducted, so it's recorded as a race rather than thrown.
    const { data: project } = await supabase
      .from("projects")
      .select("client_id")
      .eq("id", projectId)
      .maybeSingle();
    await recordCreditRaceEvent(
      "reconcile_override",
      (project?.client_id as string | undefined) ?? null,
      projectId
    );
    throw new Error("No active override to reconcile.");
  }

  const { data: project } = await supabase
    .from("projects")
    .select("client_id, project_number")
    .eq("id", projectId)
    .maybeSingle();

  await auditLog("payment.override_reconciled", performedById, performedByEmail, {
    projectId,
    orgId: (project?.client_id as string) ?? null,
    metadata: { project_number: project?.project_number ?? null },
  });

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath("/admin/projects");
}
