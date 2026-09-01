import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import {
  mergeExtractionResults,
  type SingleDocExtraction,
  type ExtractToken,
  type DynamicExtractionResult,
} from "@/lib/documents/extractor";
import { normalizeExtractedFields } from "@/lib/documents/formatters";
import { buildFieldFlagPlan, type FieldFlagPlan } from "@/lib/documents/field-flags";
import type { ComparisonMode } from "@/lib/documents/compare-candidates";
import { resolveMetricsAutofill, type MetricsAutofillConfig } from "@/lib/documents/metrics-autofill";

// #174: the token that identifies which real-world project a document
// belongs to. Its cross-document agreement is checked deterministically
// (see below) so "a PO from project A + a drawing from project B" always
// raises the same soft flag, instead of flickering with LLM non-determinism.
const IDENTITY_TOKEN = "EXTRACT_ADDRESS";

export interface DraftAssemblyInput {
  projectId: string;
  orgId: string;
  perFileResults: SingleDocExtraction[];
  extractTokens: ExtractToken[];
  comparisonModeByToken: Map<string, ComparisonMode>;
  metricsAutofillConfigs: MetricsAutofillConfig[];
}

export interface DraftAssemblyResult {
  error?: string;
  duplicateProjectId?: string;
  extraction: DynamicExtractionResult;
  draftFields: Record<string, string>;
  flagPlans: Map<string, FieldFlagPlan>;
}

/**
 * Cross-document assembly (#115): candidate merge, flag-plan build,
 * duplicate-address check, and draft persistence — extracted out of
 * finalizeSubmission (app/actions/submission.ts) into its own function so
 * this previously-untested logic is directly testable. Runs once at
 * Continue-time over already-computed per-file extraction results (no LLM
 * calls in this path) against a draft project row that, with #115's
 * draft-on-first-drop change, now already exists — so the duplicate-address
 * check must self-exclude the draft's own row, unlike the old flow where the
 * check ran before the draft was ever inserted.
 */
export async function assembleAndPersistDraftFields(
  supabase: ReturnType<typeof createAdminClient>,
  input: DraftAssemblyInput
): Promise<DraftAssemblyResult> {
  const { projectId, orgId, perFileResults, extractTokens, comparisonModeByToken, metricsAutofillConfigs } = input;

  const extraction = mergeExtractionResults(perFileResults, extractTokens);
  resolveMetricsAutofill(metricsAutofillConfigs, extraction.fields);

  const flagPlans = new Map<string, FieldFlagPlan>();
  for (const [token, rawCandidates] of Object.entries(extraction.candidates)) {
    const normalizedCandidates = rawCandidates.map((c) => ({
      ...c,
      value: normalizeExtractedFields({ [token]: c.value })[token],
    }));
    // The identity token always compares in "semantic" (canonicalised) mode,
    // regardless of its admin-configured comparison_mode: street-type
    // abbreviations ("St" vs "Street") on the same real address must not
    // false-flag, and a genuine cross-project mismatch must always flag —
    // deterministically, on every run (#174). groupCandidates is pure, so
    // once extraction is temperature-0 this verdict is stable across retries.
    const mode: ComparisonMode =
      token === IDENTITY_TOKEN ? "semantic" : comparisonModeByToken.get(token) ?? "exact";
    const plan = await buildFieldFlagPlan(normalizedCandidates, mode);
    flagPlans.set(token, plan);
  }

  const draftFields = normalizeExtractedFields(
    Object.fromEntries(Object.entries(extraction.fields).map(([k, v]) => [k, v.value]))
  );

  const extractedAddress = extraction.fields["EXTRACT_ADDRESS"]?.value?.trim() ?? "";
  if (extractedAddress) {
    const [{ data: byAddress }, { data: byDraft }] = await Promise.all([
      supabase
        .from("projects")
        .select("id")
        .eq("client_id", orgId)
        .eq("site_address", extractedAddress)
        .neq("id", projectId)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("projects")
        .select("id")
        .eq("client_id", orgId)
        .filter("extracted_fields->>EXTRACT_ADDRESS", "eq", extractedAddress)
        .neq("id", projectId)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle(),
    ]);
    const existing = byAddress ?? byDraft;
    if (existing) {
      return {
        error: `A project for ${extractedAddress} already exists. Please review the existing project instead of creating a new one.`,
        duplicateProjectId: (existing as { id: string }).id,
        extraction,
        draftFields,
        flagPlans,
      };
    }
  }

  const { error: updateError } = await supabase
    .from("projects")
    .update({
      po_number: extraction.po_number.value || null,
      extracted_fields: draftFields,
    })
    .eq("id", projectId);

  if (updateError) {
    return { error: "Failed to save your draft. Please try again.", extraction, draftFields, flagPlans };
  }

  // Idempotent against a re-run (e.g. re-extraction after a file replace):
  // clear this project's open flags before inserting the freshly-computed
  // set rather than accumulating duplicates across runs.
  await supabase.from("field_flags").delete().eq("project_id", projectId).eq("status", "open");

  const flagRows = [...flagPlans.entries()]
    .filter(([, plan]) => plan.needsFlag)
    .map(([token, plan]) => ({
      project_id: projectId,
      type: plan.flagType,
      field_key: token,
      status: "open",
      current_value: draftFields[token] ?? plan.finalValue,
      candidate_values: plan.candidateRecords,
    }));
  if (flagRows.length > 0) {
    await supabase.from("field_flags").insert(flagRows);
  }

  return { extraction, draftFields, flagPlans };
}
