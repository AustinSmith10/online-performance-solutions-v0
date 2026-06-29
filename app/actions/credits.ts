"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { topUpCredit, logOverride } from "@/lib/payments/ledger";
import { auditLog } from "@/lib/audit/log";
import type { CreditEventType } from "@/types";

export type FreezeState = { error?: string; success?: boolean };

export async function setOrgFrozenFromCredits(
  orgId: string,
  frozen: boolean,
  _prev: FreezeState,
  _formData: FormData
): Promise<FreezeState> {
  const actor = await requireRole("super_admin", "admin");

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("organisations")
    .update({ is_frozen: frozen, updated_at: new Date().toISOString() })
    .eq("id", orgId);

  if (error) return { error: error.message };

  await auditLog(frozen ? "org.frozen" : "org.unfrozen", actor.id, actor.email, {
    orgId,
    metadata: { source: "credits" },
  });

  revalidatePath(`/admin/credits/${orgId}`);
  revalidatePath("/admin/credits");
  revalidatePath(`/admin/organisations/${orgId}`);
  revalidatePath("/admin/organisations");
  return { success: true };
}

export type TopUpState = { error?: string; success?: boolean };
export type OverrideState = { error?: string; success?: boolean };
export type ReconcileState = { error?: string; success?: boolean };

export async function topUpCreditAction(
  orgId: string,
  _prev: TopUpState,
  formData: FormData
): Promise<TopUpState> {
  const actor = await requireRole("super_admin", "admin");

  const rawAmount = formData.get("amount");
  const amount = parseInt(String(rawAmount ?? ""), 10);
  if (isNaN(amount) || amount < 1) {
    return { error: "Amount must be a whole number of at least 1." };
  }
  if (amount > 10000) {
    return { error: "Amount may not exceed 10,000 per top-up." };
  }

  const notes = (formData.get("notes") as string | null)?.trim() || undefined;

  try {
    await topUpCredit(orgId, amount, actor.id, notes);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Top-up failed." };
  }
}

export async function overridePaymentGateAction(
  projectId: string,
  _prev: OverrideState,
  formData: FormData
): Promise<OverrideState> {
  const actor = await requireRole("super_admin");

  const reason = (formData.get("reason") as string | null)?.trim() ?? "";
  if (reason.length < 10) {
    return { error: "Reason must be at least 10 characters." };
  }

  // Guard: don't allow overriding an already-overridden project
  const supabase = createAdminClient();
  const { data: project } = await supabase
    .from("projects")
    .select("payment_override, status")
    .eq("id", projectId)
    .maybeSingle();
  if (project?.status === "paused") {
    return { error: "Cannot apply a payment override while the project is paused. Resume the project first." };
  }
  if (project?.payment_override) {
    return { error: "This project already has a payment override applied." };
  }

  try {
    await logOverride(projectId, actor.id, reason);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Override failed." };
  }
  redirect(`/admin/projects/${projectId}?payment_overridden=1`);
}

export async function reconcileOverrideAction(
  projectId: string,
  _prev: ReconcileState,
  _formData: FormData
): Promise<ReconcileState> {
  const actor = await requireRole("super_admin");

  const supabase = createAdminClient();

  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("payment_override, org_id, project_number")
    .eq("id", projectId)
    .maybeSingle();

  if (projErr || !project) return { error: "Project not found." };
  if (!project.payment_override) return { error: "No active override to reconcile." };

  const { data: org } = await supabase
    .from("organisations")
    .select("credit_balance")
    .eq("id", project.org_id as string)
    .maybeSingle();

  const now = new Date().toISOString();

  const { error: updateErr } = await supabase
    .from("projects")
    .update({
      payment_override: false,
      payment_override_reason: null,
      payment_override_at: null,
      payment_override_by: null,
      updated_at: now,
    })
    .eq("id", projectId);

  if (updateErr) return { error: updateErr.message };

  // Log reconciliation as an override event with a note
  await supabase.from("credit_ledger").insert({
    org_id: project.org_id,
    project_id: projectId,
    event_type: "override" as CreditEventType,
    amount: 0,
    balance_after: (org?.credit_balance as number) ?? 0,
    performed_by: actor.id,
    notes: `Override reconciled by ${actor.email ?? actor.id}`,
  });

  await auditLog("payment.override_reconciled", actor.id, actor.email, {
    projectId,
    orgId: project.org_id as string,
    metadata: { project_number: project.project_number ?? null },
  });

  redirect(`/admin/projects/${projectId}?payment_reconciled=1`);
}
