"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { topUpCredit, logOverride, reconcileOverride } from "@/lib/payments/ledger";
import { auditLog } from "@/lib/audit/log";

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
    .from("clients")
    .update({ is_frozen: frozen, updated_at: new Date().toISOString() })
    .eq("id", orgId);

  if (error) return { error: error.message };

  await auditLog(frozen ? "org.frozen" : "org.unfrozen", actor.id, actor.email, {
    orgId,
    metadata: { source: "credits" },
  });

  revalidatePath(`/admin/credits/${orgId}`);
  revalidatePath("/admin/credits");
  revalidatePath(`/admin/clients/${orgId}`);
  revalidatePath("/admin/clients");
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

  // Guard: don't allow overriding an already-overridden project, or one with
  // nothing to override in the first place — without this, a project whose
  // payment was already resolved normally (credit_deducted already true)
  // silently "succeeds" here: the RPC's already_deducted idempotency guard
  // (shared with the real double-override race) treats it as a no-op rather
  // than an error, so the caller would otherwise land on the success page
  // having overridden nothing.
  const supabase = createAdminClient();
  const { data: project } = await supabase
    .from("projects")
    .select("payment_override, status, credit_deducted")
    .eq("id", projectId)
    .maybeSingle();
  if (project?.status === "paused") {
    return { error: "Cannot apply a payment override while the project is paused. Resume the project first." };
  }
  if (project?.payment_override) {
    return { error: "This project already has a payment override applied." };
  }
  if (project?.credit_deducted) {
    return { error: "This project's payment has already been resolved — there is no payment gate to override." };
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

  try {
    await reconcileOverride(projectId, actor.id, actor.email ?? null);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Reconciliation failed." };
  }

  redirect(`/admin/projects/${projectId}?payment_reconciled=1`);
}
