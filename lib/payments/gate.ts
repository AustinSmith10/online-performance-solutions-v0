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
    .from("organisations")
    .select("payment_method, credit_balance, credit_limit, deferred_balance, is_frozen")
    .eq("id", orgId)
    .single();
  if (orgErr || !org) return { allowed: false, reason: "Organisation not found." };

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
 * Stakeholder approval gate is deferred to issue #17.
 */
export async function checkPbdrGate(projectId: string): Promise<PbdrGateResult> {
  const supabase = createAdminClient();

  const { data: project, error } = await supabase
    .from("projects")
    .select("credit_deducted")
    .eq("id", projectId)
    .single();
  if (error || !project) return { allowed: false, creditDeducted: false };

  const creditDeducted = project.credit_deducted as boolean;
  return { allowed: creditDeducted, creditDeducted };
}
