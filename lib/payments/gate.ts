import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PaymentMethod } from "@/types";

export interface DispatchGateResult {
  allowed: boolean;
  reason?: string;
}

export interface PbdrGateResult {
  allowed: boolean;
  creditDeducted: boolean;
}

/**
 * Checks whether a project may proceed to PBDB dispatch.
 * Called by the dispatch action (wired in issue #16).
 */
export async function checkDispatchGate(
  orgId: string,
  _projectId: string
): Promise<DispatchGateResult> {
  const supabase = createAdminClient();

  const { data: org, error: orgErr } = await supabase
    .from("clients")
    .select("payment_method, credit_balance, credit_limit, deferred_balance, is_frozen")
    .eq("id", orgId)
    .single();
  if (orgErr || !org) return { allowed: false, reason: "Client not found." };

  const method = org.payment_method as PaymentMethod;

  if (method === "upfront") return { allowed: true };

  if (method === "deferred") {
    if (org.is_frozen as boolean) {
      return { allowed: false, reason: "Account is frozen." };
    }
    const limit = org.credit_limit as number;
    const deferred = org.deferred_balance as number;
    if (limit > 0 && deferred >= limit) {
      return { allowed: false, reason: "Deferred credit limit reached." };
    }
    return { allowed: true };
  }

  // credit_deduction
  const balance = org.credit_balance as number;
  if (balance < 1) {
    return { allowed: false, reason: "Insufficient credit balance." };
  }
  return { allowed: true };
}

/**
 * Checks the PBDR conversion hard gate.
 * Requires: credit_deducted (or payment_override) AND all stakeholder reviews acknowledged/waived.
 */
export async function checkPbdrGate(projectId: string): Promise<PbdrGateResult> {
  const supabase = createAdminClient();

  const { data: project, error } = await supabase
    .from("projects")
    .select("credit_deducted, payment_override, review_cycle")
    .eq("id", projectId)
    .single();
  if (error || !project) return { allowed: false, creditDeducted: false };

  const creditDeducted = (project.credit_deducted as boolean) || (project.payment_override as boolean);

  // Check all stakeholder reviews for current cycle are acknowledged or waived
  const reviewCycle = (project.review_cycle as number) ?? 1;
  const { data: pending } = await supabase
    .from("stakeholder_reviews")
    .select("id")
    .eq("project_id", projectId)
    .eq("review_cycle", reviewCycle)
    .eq("status", "pending");

  const allAcknowledged = !pending || pending.length === 0;

  return { allowed: creditDeducted && allAcknowledged, creditDeducted };
}
