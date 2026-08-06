import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { extractReferenceSampleText } from "@/lib/documents/file-requirement-verification";
import { getMetricsAutofillConfigs, getAutofillExclusionTokens } from "@/lib/documents/metrics-autofill";

// Helpers shared between app/actions/submission.ts and
// app/actions/submission-pipeline.ts (#115) — kept out of either "use
// server" file because Next.js requires every export of a "use server"
// module to itself be an async server action; a plain sync helper
// (makeSampleTextLoader returns a closure, not a promise) or a helper that
// takes a Supabase client parameter breaks that constraint.

// ─── Step 1a: derive an org id from actor role + on-behalf-of fields (shared) ─
// Admins and consultants both submit "on behalf of" a stakeholder they pick,
// so they share the same org-id resolution and `submitted_by` pinning below.

export function resolveOrgId(
  actor: { role: string; client_id?: unknown },
  actsOnBehalf: boolean,
  onBehalfOrgId: string | null
): string {
  return actsOnBehalf ? (onBehalfOrgId?.trim() ?? "") : (actor.client_id as string);
}

export type FileReq = {
  id: string; name: string; slug: string;
  max_count: number; required: boolean; no_duplicates: boolean; extraction: boolean;
  marker_text_patterns: string[] | null;
  marker_page_count_min: number | null;
  marker_page_count_max: number | null;
  marker_regex: string | null;
  ai_judge_hint: string | null;
  reference_sample_storage_path: string | null;
};

export async function loadFileRequirements(
  supabase: ReturnType<typeof createAdminClient>,
  templateId: string
): Promise<FileReq[]> {
  const { data } = await supabase
    .from("file_requirements")
    .select(
      "id, name, slug, max_count, required, no_duplicates, extraction, marker_text_patterns, marker_page_count_min, marker_page_count_max, marker_regex, ai_judge_hint, reference_sample_storage_path"
    )
    .eq("template_id", templateId)
    .order("sort_order");
  return (data ?? []) as FileReq[];
}

// Reference sample text (#115) is shared grounding across every upload into
// the same slot (a multi-file slot re-checks the same sample per file), so
// it's extracted once per requirement per call rather than per upload.
export function makeSampleTextLoader(
  supabase: ReturnType<typeof createAdminClient>,
  fileReqs: FileReq[]
): (requirementId: string) => Promise<string | null> {
  const cache = new Map<string, Promise<string | null>>();
  const byId = new Map(fileReqs.map((r) => [r.id, r]));

  return (requirementId: string) => {
    if (cache.has(requirementId)) return cache.get(requirementId)!;
    const req = byId.get(requirementId);
    const path = req?.reference_sample_storage_path;
    const promise = path
      ? extractReferenceSampleText(async () => {
          const { data, error } = await supabase.storage.from("templates").download(path);
          if (error || !data) throw new Error(`Failed to read reference sample for ${req!.name}.`);
          return Buffer.from(await data.arrayBuffer());
        })
      : Promise.resolve(null);
    cache.set(requirementId, promise);
    return promise;
  };
}

// Extraction tokens for a template, with metrics-autofill-resolved tokens
// excluded — shared by finalizeSubmission's Continue-time merge and the
// per-file orchestrator's immediate per-file extraction (#115), so both draw
// from the exact same token set rather than risking drift between them.
export async function loadExtractTokens(
  supabase: ReturnType<typeof createAdminClient>,
  orgId: string,
  templateId: string
): Promise<{ extractTokens: { token: string; label: string; hint: string }[]; metricsAutofillConfigs: Awaited<ReturnType<typeof getMetricsAutofillConfigs>> }> {
  const [{ data: allMappings }, metricsAutofillConfigs] = await Promise.all([
    supabase
      .from("template_field_mappings")
      .select("placeholder_token, field_key, display_label, extraction_hint")
      .eq("template_id", templateId)
      .eq("is_mapped", true)
      .eq("field_key", "extract")
      .order("sort_order")
      .order("placeholder_token"),
    getMetricsAutofillConfigs(supabase, orgId),
  ]);

  const metricsExclusionTokens = getAutofillExclusionTokens(metricsAutofillConfigs);
  const extractTokens = (allMappings ?? [])
    .filter((m) => !metricsExclusionTokens.has(m.placeholder_token as string))
    .map((m) => ({
      token: m.placeholder_token as string,
      label: (m.display_label as string | null) ?? (m.placeholder_token as string),
      hint: (m.extraction_hint as string | null) ?? `Extract the value for ${m.placeholder_token} from the documents.`,
    }));

  return { extractTokens, metricsAutofillConfigs };
}
