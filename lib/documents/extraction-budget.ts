import type { SupabaseClient } from "@supabase/supabase-js";
import { getExtractionDailyLimit } from "@/lib/settings/extraction-budget";

export interface ClaimExtractionSlotResult {
  allowed: boolean;
  limit: number;
}

// Claims one slot in the caller's rolling 24-hour extraction budget (#152),
// via the claim_extraction_slot RPC (00000000000126_extraction_usage_budget.sql)
// — same atomic lock-check-act shape as the credit-ledger RPCs, adapted for
// an aggregate constraint rather than a single balance row (see the
// migration's own comment for why).
//
// Fails OPEN on an RPC error (logged, not thrown): this is a soft usage
// guardrail against runaway spend, not a financial boundary like the credit
// ledger — the same call site already goes on to touch Supabase Storage and
// the Anthropic API regardless, so a transient DB blip here isn't a
// meaningfully separate failure mode, and blocking every user's submission
// pipeline on it would be a worse outcome than letting one extraction
// through unmetered. Mirrors the #153 kill switch's fail-open decision for
// the same reason.
export async function claimExtractionSlot(
  supabase: SupabaseClient,
  userId: string
): Promise<ClaimExtractionSlotResult> {
  const limit = await getExtractionDailyLimit(supabase);

  const { data, error } = await supabase
    .rpc("claim_extraction_slot", { p_user_id: userId, p_limit: limit })
    .single<{ status: string; remaining: number }>();

  if (error || !data) {
    console.error("[claimExtractionSlot] RPC failed, failing open:", error);
    return { allowed: true, limit };
  }

  return { allowed: data.status === "ok", limit };
}

export interface ClaimExtractionSlotsResult {
  /** How many of the requested slots were granted (claimed in order, stopping at the first refusal). */
  granted: number;
  limit: number;
}

// Claims one slot per document for a multi-document extraction (re-extract,
// email attachments) — one extraction = one document, the same unit the
// single-upload call sites above charge. Stops at the first refusal, so a
// caller can extract just the documents that fit (email) or refuse the whole
// batch (re-extract). Same fail-open behaviour per slot as claimExtractionSlot.
export async function claimExtractionSlots(
  supabase: SupabaseClient,
  userId: string,
  count: number
): Promise<ClaimExtractionSlotsResult> {
  let granted = 0;
  let limit = 0;
  for (let i = 0; i < count; i++) {
    const res = await claimExtractionSlot(supabase, userId);
    limit = res.limit;
    if (!res.allowed) break;
    granted++;
  }
  return { granted, limit };
}
