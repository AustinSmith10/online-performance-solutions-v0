"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { extractDocumentFields, type ExtractedCandidate } from "@/lib/documents/extractor";
import { normalizeExtractedFields } from "@/lib/documents/formatters";
import { buildFieldFlagPlan } from "@/lib/documents/field-flags";
import { groupCandidates, type ComparisonMode } from "@/lib/documents/compare-candidates";
import {
  getMetricsAutofillConfigs,
  getAutofillExclusionTokens,
} from "@/lib/documents/metrics-autofill";

export type ResolutionReason = "self_resolved" | "resolved_for_stakeholder" | "resolved_independently";

export type ResolveFieldFlagResult =
  | { ok: true }
  | { ok: false; conflict: true; resolvedByEmail: string; resolvedValue: string; resolvedAt: string }
  | { ok: false; conflict?: false; error: string };

// Every project detail page that can show flags — revalidated together
// since we don't know here which one the actor is viewing.
function revalidateProjectPaths(projectId: string) {
  revalidatePath(`/ops/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/portal/projects/${projectId}`);
}

export async function resolveFieldFlag(
  flagId: string,
  input: { value: string; reason: ResolutionReason; note?: string; force?: boolean }
): Promise<ResolveFieldFlagResult> {
  const actor = await requireRole("stakeholder", "consultant", "super_admin", "admin");
  const supabase = createAdminClient();

  const { data: flag } = await supabase
    .from("field_flags")
    .select("id, project_id, field_key, status, resolved_by, resolved_at, current_value")
    .eq("id", flagId)
    .maybeSingle();

  if (!flag) return { ok: false, error: "Flag not found." };

  // Race protection: someone else may have resolved this between the page
  // load and this submit — never silently overwrite their resolution. The
  // caller can still override, but only as a conscious second action after
  // being shown who resolved it and what they picked (input.force=true —
  // set by the UI once it has displayed that conflict, or when the caller
  // is the re-extract conflict flow, which *is* that display).
  if (flag.status === "resolved" && !input.force) {
    return await conflictResponse(supabase, flag);
  }

  const value = input.value.trim();
  if (!value) return { ok: false, error: "A value is required." };

  let updateQuery = supabase
    .from("field_flags")
    .update(
      {
        status: "resolved",
        current_value: value,
        resolved_by: actor.id,
        resolved_at: new Date().toISOString(),
        resolution_reason: input.reason,
        resolution_note: input.note?.trim() || null,
      },
      { count: "exact" }
    )
    .eq("id", flagId);
  updateQuery = input.force ? updateQuery.eq("status", flag.status) : updateQuery.eq("status", "open");
  const { error, count } = await updateQuery;

  if (error) return { ok: false, error: error.message };
  if (!count) {
    const { data: refetched } = await supabase
      .from("field_flags")
      .select("id, project_id, field_key, status, resolved_by, resolved_at, current_value")
      .eq("id", flagId)
      .maybeSingle();
    return refetched
      ? await conflictResponse(supabase, refetched)
      : { ok: false, error: "Flag not found." };
  }

  // Keep the project's authoritative extracted_fields value in sync with the
  // resolution so downstream consumers (report generation, display) don't
  // need to know about field_flags at all.
  const { data: project } = await supabase
    .from("projects")
    .select("extracted_fields, site_address")
    .eq("id", flag.project_id)
    .maybeSingle();
  const fields = { ...((project?.extracted_fields as Record<string, string> | null) ?? {}) };
  fields[flag.field_key as string] = value;
  const isAddressToken = flag.field_key === "EXTRACT_ADDRESS";
  await supabase
    .from("projects")
    .update({
      extracted_fields: fields,
      ...(isAddressToken ? { site_address: value } : {}),
    })
    .eq("id", flag.project_id);

  revalidateProjectPaths(flag.project_id as string);
  return { ok: true };
}

async function conflictResponse(
  supabase: ReturnType<typeof createAdminClient>,
  flag: { resolved_by: string | null; resolved_at: string | null; current_value: string }
): Promise<ResolveFieldFlagResult> {
  const { data: resolver } = flag.resolved_by
    ? await supabase.from("users").select("email").eq("id", flag.resolved_by).maybeSingle()
    : { data: null };
  return {
    ok: false,
    conflict: true,
    resolvedByEmail: (resolver?.email as string | undefined) ?? "another user",
    resolvedValue: flag.current_value,
    resolvedAt: flag.resolved_at ?? new Date().toISOString(),
  };
}

export interface ReExtractConflict {
  flagId: string;
  token: string;
  label: string;
  resolvedValue: string;
  resolvedByEmail: string;
  newCandidates: ExtractedCandidate[];
}

export type ReExtractResult =
  | { ok: false; error: string }
  | { ok: true; newFlags: number; updatedFlags: number; conflicts: ReExtractConflict[] };

// Manual, stakeholder/consultant-initiated re-check of a project's currently
// uploaded documents (#58). Never silently reopens an already-resolved
// flag — a conflicting re-extraction is surfaced to the caller instead, so
// the UI can pre-load the resolution component with old + new candidates.
export async function reExtractProject(projectId: string): Promise<ReExtractResult> {
  await requireRole("stakeholder", "consultant", "super_admin", "admin");
  const supabase = createAdminClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, client_id, template_id")
    .eq("id", projectId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!project) return { ok: false, error: "Project not found." };
  if (!project.template_id) return { ok: false, error: "Project has no template." };

  const [{ data: fileReqs }, { data: mappings }, { data: existingFlags }] = await Promise.all([
    supabase
      .from("file_requirements")
      .select("slug")
      .eq("template_id", project.template_id)
      .eq("extraction", true),
    supabase
      .from("template_field_mappings")
      .select("placeholder_token, display_label, extraction_hint, comparison_mode")
      .eq("template_id", project.template_id)
      .eq("field_key", "extract")
      .eq("is_mapped", true),
    supabase
      .from("field_flags")
      .select("id, field_key, status, current_value, resolved_by")
      .eq("project_id", projectId),
  ]);

  const extractionSlugs = new Set((fileReqs ?? []).map((r) => r.slug as string));
  const { data: projectFiles } = await supabase
    .from("project_files")
    .select("file_type, storage_path, original_filename")
    .eq("project_id", projectId)
    .in("file_type", [...extractionSlugs]);

  if (!projectFiles || projectFiles.length === 0) {
    return { ok: false, error: "No extractable documents are attached to this project." };
  }

  const documents = await Promise.all(
    projectFiles.map(async (f) => {
      const { data, error } = await supabase.storage
        .from("submissions")
        .download(f.storage_path as string);
      if (error || !data) throw new Error(`Failed to read "${f.original_filename}".`);
      return { label: f.original_filename as string, buffer: Buffer.from(await data.arrayBuffer()) };
    })
  ).catch((err: Error) => err);

  if (documents instanceof Error) return { ok: false, error: documents.message };

  const metricsAutofillConfigs = await getMetricsAutofillConfigs(supabase, project.client_id as string);
  const metricsExclusionTokens = getAutofillExclusionTokens(metricsAutofillConfigs);

  const extractTokens = (mappings ?? [])
    .filter((m) => !metricsExclusionTokens.has(m.placeholder_token as string))
    .map((m) => ({
      token: m.placeholder_token as string,
      label: (m.display_label as string | null) ?? (m.placeholder_token as string),
      hint: (m.extraction_hint as string | null) ?? "",
    }));
  const comparisonModeByToken = new Map(
    (mappings ?? []).map((m) => [m.placeholder_token as string, (m.comparison_mode as ComparisonMode) ?? "exact"])
  );
  const labelByToken = new Map(
    (mappings ?? []).map((m) => [m.placeholder_token as string, (m.display_label as string | null) ?? (m.placeholder_token as string)])
  );

  const extraction = await extractDocumentFields(documents, extractTokens);

  const existingByToken = new Map((existingFlags ?? []).map((f) => [f.field_key as string, f]));

  const resolverIds = [
    ...new Set((existingFlags ?? []).map((f) => f.resolved_by as string | null).filter((v): v is string => !!v)),
  ];
  const { data: resolvers } = resolverIds.length
    ? await supabase.from("users").select("id, email").in("id", resolverIds)
    : { data: [] };
  const resolverEmailById = new Map((resolvers ?? []).map((u) => [u.id as string, u.email as string]));

  let newFlags = 0;
  let updatedFlags = 0;
  const conflicts: ReExtractConflict[] = [];

  for (const [token, rawCandidates] of Object.entries(extraction.candidates)) {
    const mode = comparisonModeByToken.get(token) ?? "exact";
    const normalizedCandidates = rawCandidates.map((c) => ({
      ...c,
      value: normalizeExtractedFields({ [token]: c.value })[token],
    }));
    const existing = existingByToken.get(token);

    if (existing?.status === "resolved") {
      // Re-extraction finding nothing this time is not evidence the resolved
      // value is wrong — never run the conflict check against an empty
      // result, or a plain extraction miss would spuriously read as "found a
      // different (empty) value" and reopen a decision already made. Only a
      // genuine new candidate can conflict (extraction-flag-model-decisions:
      // "new document uploads never auto-reopen a resolved flag").
      if (rawCandidates.length === 0) continue;

      // Would the resolved value still be considered "the same" as what
      // re-extraction just found? If so, nothing to do — no rework for a
      // decision already made.
      const combined: ExtractedCandidate[] = [
        { value: existing.current_value as string, confidence: "high", source_document: "previous resolution" },
        ...normalizedCandidates,
      ];
      const groups = await groupCandidates(combined, mode);
      if (groups.length > 1) {
        conflicts.push({
          flagId: existing.id as string,
          token,
          label: labelByToken.get(token) ?? token,
          resolvedValue: existing.current_value as string,
          resolvedByEmail: resolverEmailById.get(existing.resolved_by as string) ?? "a previous reviewer",
          newCandidates: normalizedCandidates,
        });
      }
      continue;
    }

    // Unresolved (open or never-flagged) tokens are checked even with zero
    // candidates — a field re-extraction that found nothing anywhere must
    // flag/stay flagged for review (extraction-verification-layer-decisions
    // #7), not be silently skipped.
    const plan = await buildFieldFlagPlan(normalizedCandidates, mode);
    if (!plan.needsFlag) continue;

    if (existing?.status === "open") {
      await supabase
        .from("field_flags")
        .update({
          type: plan.flagType,
          current_value: plan.finalValue,
          candidate_values: plan.candidateRecords,
        })
        .eq("id", existing.id);
      updatedFlags++;
    } else {
      await supabase.from("field_flags").insert({
        project_id: projectId,
        type: plan.flagType,
        field_key: token,
        status: "open",
        current_value: plan.finalValue,
        candidate_values: plan.candidateRecords,
      });
      newFlags++;
    }
  }

  revalidateProjectPaths(projectId);
  return { ok: true, newFlags, updatedFlags, conflicts };
}
