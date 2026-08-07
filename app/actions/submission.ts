"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { auditLog } from "@/lib/audit/log";
import { notify } from "@/lib/notifications/notify";
import type { ExtractedField, ExtractedCandidate, SingleDocExtraction } from "@/lib/documents/extractor";
import { normalizeExtractedFields } from "@/lib/documents/formatters";
import { assembleAndPersistDraftFields } from "@/lib/documents/draft-assembly";
import { resolveOrgId, loadFileRequirements, loadExtractTokens } from "@/lib/documents/submission-shared";
import type { ComparisonMode } from "@/lib/documents/compare-candidates";
import { getPublicHolidays } from "@/lib/delivery/public-holidays";
import { addWorkingDays } from "@/lib/delivery/working-days";
import { performAssignment } from "@/lib/projects/assign";
import { AcknowledgementEmail } from "@/lib/email/templates/AcknowledgementEmail";
import { buildMetricsPickRows, type MetricsPickRow } from "@/lib/documents/metrics-autofill";

// A client's metrics-table autofill config may resolve these — the review UI
// shows the trustee as a correctable dropdown and rainfall intensity as a
// plain extracted field, regardless of which table resolved them.
const TRUSTEE_TOKEN = "EXTRACT_TRUSTEE";
const RAINFALL_TOKEN = "EXTRACT_RAINFALL_INTENSITY";

export interface TokenField {
  token: string;
  label: string;
  value: string;
  required: boolean;
  // Present only when 2+ distinct candidates were found across documents —
  // lets the review form offer a picker alongside free-text correction.
  candidates?: ExtractedCandidate[];
}

// ─── Step 1 → 2 state ────────────────────────────────────────────────────────

export interface SectionLabels {
  extract: string;
  extractDesc: string;
  trusteeDesc: string;
  org: string;
  orgDesc: string;
  client: string;
  clientDesc: string;
}

export type ExtractState =
  | { step: 1; error?: string; duplicateProjectId?: string }
  | {
      step: 2;
      error?: string;
      poNumber: ExtractedField;
      tokenGroups: {
        extract: TokenField[];
        org: TokenField[];
        client: TokenField[];
      };
      sectionLabels: SectionLabels;
      hasTrustee: boolean;
      rainfallToken: string | null;
      matchToken: string | null;
      pickRows: MetricsPickRow[];
      // Lets the review UI re-resolve rainfall intensity live if the
      // stakeholder edits the field that drives its lookup, instead of
      // freezing it at whatever the initial extraction pass produced.
      rainfallMatchToken: string | null;
      rainfallPickRows: MetricsPickRow[];
      projectId: string;
      templateId: string;
      // #113: uploads whose deterministic/AI-judge check flagged a possible
      // mismatch for their slot — each must be confirmed (see submitProject's
      // gate) before final submission proceeds.
      fileVerificationWarnings: {
        fileId: string; slug: string; name: string; previewUrl: string | null; reasons: string[];
      }[];
      // Every uploaded file, previewable regardless of verification status —
      // lets the stakeholder refer back to what they actually uploaded while
      // filling in fields the AI couldn't find.
      documents: { slug: string; label: string; name: string; previewUrl: string | null }[];
    };

// ─── Step 1: request signed upload URLs ─────────────────────────────────────
// The browser uploads file bytes directly to Supabase Storage using these
// URLs — no file body passes through this server action, which keeps the
// per-request payload metadata-only and removes the server-action body-size
// ceiling as upload volume grows (#86).

export interface UploadManifestItem {
  name: string;
  size: number;
}

export type RequestUploadsResult =
  | { error: string }
  | {
      projectId: string;
      uploads: {
        slug: string;
        index: number;
        name: string;
        path: string;
        signedUrl: string;
        token: string;
      }[];
    };

// Best-effort cleanup for files the browser already uploaded before a
// sibling upload in the same batch failed — nothing references these paths
// yet (no draft project exists), so they're safe to remove.
export async function abortSubmissionUploads(paths: string[]): Promise<void> {
  await requireRole("stakeholder", "consultant", "super_admin", "admin");
  if (!paths.length) return;
  const supabase = createAdminClient();
  await supabase.storage.from("submissions").remove(paths);
}

export async function requestSubmissionUploadUrls(
  templateId: string,
  adminOrgId: string | null,
  adminClientId: string | null,
  manifestBySlug: Record<string, UploadManifestItem[]>
): Promise<RequestUploadsResult> {
  const actor = await requireRole("stakeholder", "consultant", "super_admin", "admin");
  const supabase = createAdminClient();

  if (!templateId) return { error: "No template selected." };

  const isAdmin = actor.role === "super_admin" || actor.role === "admin";
  const actsOnBehalf = isAdmin || actor.role === "consultant";
  const orgId = resolveOrgId(actor, actsOnBehalf, adminOrgId);
  if (!orgId) return { error: "Client is required." };
  if (actsOnBehalf && !adminClientId?.trim()) return { error: "Stakeholder account is required." };

  const fileReqs = await loadFileRequirements(supabase, templateId);

  // Collect manifest items per requirement slot (defensively re-sliced to max_count)
  const itemsBySlug: Record<string, UploadManifestItem[]> = {};
  for (const req of fileReqs) {
    itemsBySlug[req.slug] = (manifestBySlug[req.slug] ?? []).slice(0, req.max_count);
  }

  // Validate required slots
  for (const req of fileReqs) {
    if (req.required && !itemsBySlug[req.slug]?.length) {
      return { error: `"${req.name}" is required. Please attach a file.` };
    }
  }

  // Validate file sizes (50 MB per file)
  for (const req of fileReqs) {
    for (const item of itemsBySlug[req.slug] ?? []) {
      if (item.size > 50 * 1024 * 1024) {
        return { error: `"${req.name}" — "${item.name}" exceeds the 50 MB limit.` };
      }
    }
  }

  // Validate no_duplicates within each slot
  for (const req of fileReqs) {
    if (req.no_duplicates) {
      const names = (itemsBySlug[req.slug] ?? []).map((i) => i.name);
      if (new Set(names).size < names.length) {
        return { error: `"${req.name}" cannot contain files with duplicate names.` };
      }
    }
  }

  const projectId = crypto.randomUUID();

  const uploadPlan = fileReqs.flatMap((req) =>
    (itemsBySlug[req.slug] ?? []).map((item, index) => ({
      slug: req.slug,
      index,
      name: item.name,
      path: `${orgId}/${projectId}/${req.slug}/${item.name}`,
    }))
  );

  const signedResults = await Promise.all(
    uploadPlan.map((item) => supabase.storage.from("submissions").createSignedUploadUrl(item.path))
  );

  const failed = signedResults.find((r) => r.error);
  if (failed?.error) {
    return { error: "Failed to prepare uploads. Please try again." };
  }

  return {
    projectId,
    uploads: uploadPlan.map((item, i) => ({
      ...item,
      signedUrl: signedResults[i].data!.signedUrl,
      token: signedResults[i].data!.token,
    })),
  };
}

// ─── Step 1b: finalize — merge already-computed per-file results, persist ───
// #115: verification and (where applicable) extraction have already run per
// file, the instant each landed (see app/actions/submission-pipeline.ts).
// This is now a Continue-time-only merge over cached results — no LLM calls,
// no downloads, no per-file verification — plus the same duplicate-address
// check, flag-plan build, and draft persistence as before, now delegated to
// the separately-testable assembleAndPersistDraftFields.

export async function finalizeSubmission(
  projectId: string,
  templateId: string,
  adminOrgId: string | null,
  adminClientId: string | null
): Promise<ExtractState> {
  const actor = await requireRole("stakeholder", "consultant", "super_admin", "admin");
  const supabase = createAdminClient();

  const isAdmin = actor.role === "super_admin" || actor.role === "admin";
  const actsOnBehalf = isAdmin || actor.role === "consultant";
  const orgId = resolveOrgId(actor, actsOnBehalf, adminOrgId);
  if (!orgId) return { step: 1, error: "Client is required." };
  if (actsOnBehalf && !adminClientId?.trim()) return { step: 1, error: "Stakeholder account is required." };

  const fileReqs = await loadFileRequirements(supabase, templateId);
  const reqBySlug = new Map(fileReqs.map((r) => [r.slug, r]));

  const { data: projectFiles } = await supabase
    .from("project_files")
    .select(
      "id, storage_path, file_type, original_filename, verification_mismatch_reasons, verification_completed_at, verification_confirmed_at, extraction_status, extraction_result"
    )
    .eq("project_id", projectId);
  const files = projectFiles ?? [];

  // Defensive re-validation: the client only enables Continue once every
  // file has settled (see continueGate.ts), but the server re-derives the
  // same gate rather than trusting that state wasn't stale.
  for (const req of fileReqs) {
    if (req.required && !files.some((f) => f.file_type === req.slug)) {
      return { step: 1, error: `"${req.name}" is required. Please attach a file.` };
    }
  }
  for (const f of files) {
    if (!f.verification_completed_at) {
      return { step: 1, error: `"${f.original_filename}" is still being checked. Please wait.` };
    }
    if (f.verification_mismatch_reasons && !f.verification_confirmed_at) {
      return { step: 1, error: `Please confirm the flagged file "${f.original_filename}" before continuing.` };
    }
    if (f.extraction_status === "pending" || f.extraction_status === "running") {
      return { step: 1, error: `"${f.original_filename}" is still being processed. Please wait.` };
    }
    if (f.extraction_status === "failed") {
      return { step: 1, error: `Extraction failed for "${f.original_filename}". Please retry or replace it.` };
    }
  }

  const perFileResults = files
    .filter((f) => reqBySlug.get(f.file_type as string)?.extraction && f.extraction_result)
    .map((f) => f.extraction_result as unknown as SingleDocExtraction);

  // Load template mappings, section labels, and org config in parallel
  const [mappingsResult, orgResult, templateResult] = await Promise.all([
    supabase
      .from("template_field_mappings")
      .select("placeholder_token, field_key, display_label, extraction_hint, is_required, comparison_mode")
      .eq("template_id", templateId)
      .eq("is_mapped", true)
      .order("sort_order")
      .order("placeholder_token"),
    supabase.from("clients").select("client_config").eq("id", orgId).single(),
    supabase.from("templates").select("name, section_labels").eq("id", templateId).single(),
  ]);

  const allMappings = mappingsResult.data ?? [];
  const orgConfig = (orgResult.data?.client_config ?? {}) as Record<string, string>;
  const rawLabels = (templateResult.data?.section_labels ?? {}) as Record<string, string>;
  const sectionLabels: SectionLabels = {
    extract: rawLabels.extract || "Extracted from your documents",
    extractDesc: rawLabels.extractDesc || "Review and correct any fields marked below before submitting.",
    trusteeDesc: rawLabels.trusteeDesc || "",
    org: rawLabels.org || "Client details",
    orgDesc: rawLabels.orgDesc || "These details are pre-filled from your organisation's configuration.",
    client: rawLabels.client || "Additional information",
    clientDesc: rawLabels.clientDesc || "Please fill in the remaining details required for this report.",
  };

  const extractMappings = allMappings.filter((m) => m.field_key === "extract");
  const orgMappings = allMappings.filter((m) => m.field_key === "org");
  const clientMappings = allMappings.filter((m) => m.field_key === "client");

  const hasTrustee = extractMappings.some(
    (m) => m.placeholder_token === TRUSTEE_TOKEN
  );
  const rainfallMapping = extractMappings.find(
    (m) => m.placeholder_token === RAINFALL_TOKEN
  );
  const rainfallToken = rainfallMapping ? RAINFALL_TOKEN : null;

  const { extractTokens, metricsAutofillConfigs } = await loadExtractTokens(supabase, orgId, templateId);

  const comparisonModeByToken = new Map(
    extractMappings.map((m) => [m.placeholder_token as string, (m.comparison_mode as ComparisonMode) ?? "exact"])
  );

  const assembly = await assembleAndPersistDraftFields(supabase, {
    projectId,
    orgId,
    perFileResults,
    extractTokens,
    comparisonModeByToken,
    metricsAutofillConfigs,
  });

  if (assembly.error) {
    return { step: 1, error: assembly.error, duplicateProjectId: assembly.duplicateProjectId };
  }

  const { extraction, draftFields, flagPlans } = assembly;

  // Signs every uploaded file once — feeds both fileVerificationWarnings
  // (mismatched files only) and documents (the full list, so the
  // stakeholder can preview anything they uploaded regardless of
  // verification outcome).
  const signedFiles = await Promise.all(
    files.map(async (f) => {
      const { data: signed } = await supabase.storage
        .from("submissions")
        .createSignedUrl(f.storage_path as string, 3600);
      return {
        fileId: f.id as string,
        slug: f.file_type as string,
        label: reqBySlug.get(f.file_type as string)?.name ?? (f.file_type as string),
        name: f.original_filename as string,
        previewUrl: signed?.signedUrl ?? null,
        reasons: (f.verification_mismatch_reasons as string[] | null) ?? null,
        needsConfirmation: Boolean(f.verification_mismatch_reasons) && !f.verification_confirmed_at,
      };
    })
  );

  const fileVerificationWarnings = signedFiles
    .filter((f) => f.needsConfirmation)
    .map(({ fileId, slug, name, previewUrl, reasons }) => ({ fileId, slug, name, previewUrl, reasons: reasons ?? [] }));

  const documents = signedFiles.map(({ slug, label, name, previewUrl }) => ({ slug, label, name, previewUrl }));

  await auditLog("project.draft_created", actor.id, actor.email as string, {
    orgId,
    projectId,
    metadata: {
      templateId,
      files: files.map((f) => ({
        slug: f.file_type,
        label: reqBySlug.get(f.file_type as string)?.name ?? f.file_type,
        filename: f.original_filename,
      })),
      extracted_fields: draftFields,
      po_number: extraction.po_number.value || null,
    },
  });

  const tokenGroups = {
    extract: extractMappings.map((m) => {
      const plan = flagPlans.get(m.placeholder_token);
      const hasMultipleCandidates = plan?.flagType === "inconsistency" || plan?.flagType === "both";
      return {
        token: m.placeholder_token,
        label: m.display_label ?? m.placeholder_token,
        value: draftFields[m.placeholder_token] ?? extraction.fields[m.placeholder_token]?.value ?? "",
        required: m.is_required ?? false,
        candidates: hasMultipleCandidates ? plan!.candidateRecords : undefined,
      };
    }),
    org: orgMappings.map((m) => ({
      token: m.placeholder_token,
      label: m.display_label ?? m.placeholder_token,
      value: orgConfig[m.placeholder_token] ?? "",
      required: false,
    })),
    client: clientMappings.map((m) => ({
      token: m.placeholder_token,
      label: m.display_label ?? m.placeholder_token,
      value: "",
      required: m.is_required ?? false,
    })),
  };

  const trusteePick = hasTrustee ? buildMetricsPickRows(metricsAutofillConfigs, TRUSTEE_TOKEN) : null;
  const rainfallPick = rainfallToken ? buildMetricsPickRows(metricsAutofillConfigs, RAINFALL_TOKEN) : null;

  return {
    step: 2,
    poNumber: extraction.po_number,
    tokenGroups,
    sectionLabels,
    hasTrustee,
    rainfallToken,
    matchToken: trusteePick?.matchToken ?? null,
    pickRows: trusteePick?.rows ?? [],
    rainfallMatchToken: rainfallPick?.matchToken ?? null,
    rainfallPickRows: rainfallPick?.rows ?? [],
    projectId,
    templateId,
    fileVerificationWarnings,
    documents,
  };
}

// ─── Step 2: submit project ─────────────────────────────────────────────────

export type SubmitState = { error?: string; duplicateProjectId?: string };

export async function submitProject(
  _prev: SubmitState,
  formData: FormData
): Promise<SubmitState> {
  const actor = await requireRole("stakeholder", "consultant", "super_admin", "admin");
  const supabase = createAdminClient();

  const isAdmin = actor.role === "super_admin" || actor.role === "admin";
  const isConsultant = actor.role === "consultant";
  const actsOnBehalf = isAdmin || isConsultant;
  const orgId = actsOnBehalf
    ? ((formData.get("admin_org_id") as string | null)?.trim() ?? "")
    : (actor.client_id as string);
  if (!orgId) return { error: "Client is required." };
  const adminClientId = actsOnBehalf
    ? ((formData.get("admin_client_id") as string | null)?.trim() ?? "")
    : "";
  if (actsOnBehalf && !adminClientId) return { error: "Stakeholder account is required." };

  const projectId = (formData.get("project_id") as string | null)?.trim();
  const templateId = (formData.get("template_id") as string | null)?.trim();

  if (!projectId || !templateId) {
    return { error: "Missing required submission data. Please start over." };
  }

  if (formData.get("reviewed_confirmed") !== "true") {
    return { error: "Please confirm that you have reviewed the details above before submitting." };
  }

  // #113/#115: any upload flagged by the verification layer must be
  // confirmed before submission proceeds — soft block, not a hard block on
  // upload itself. Confirmation now happens inline during the real-time
  // per-file pipeline (confirmFileVerification, before Continue is even
  // enabled — see continueGate.ts), so this re-derives readiness straight
  // from verification_confirmed_at rather than trusting client-posted ids.
  const { data: flaggedFiles } = await supabase
    .from("project_files")
    .select("id, verification_mismatch_reasons, verification_confirmed_at")
    .eq("project_id", projectId)
    .not("verification_mismatch_reasons", "is", null);

  if (flaggedFiles && flaggedFiles.length > 0) {
    const unconfirmed = flaggedFiles.filter((f) => !f.verification_confirmed_at);
    if (unconfirmed.length > 0) {
      return { error: "Please review and confirm the flagged file(s) before submitting." };
    }
  }

  const poNumber = (formData.get("extracted_po_number") as string | null)?.trim() || null;
  const deliveryEmail =
    (formData.get("delivery_recipient_email") as string | null)?.trim() || null;

  // Collect all token values from form (EXTRACT_, ORG_, CLIENT_)
  const rawFields: Record<string, string> = {};
  for (const [key, rawVal] of formData.entries()) {
    if (
      key.startsWith("EXTRACT_") ||
      key.startsWith("ORG_") ||
      key.startsWith("CLIENT_")
    ) {
      rawFields[key] = (rawVal as string).trim();
    }
  }
  const extractedFields = normalizeExtractedFields(rawFields);

  const siteAddress = (extractedFields["EXTRACT_ADDRESS"] ?? "").trim() || null;

  // Required-fields check, duplicate check, org config, and the pre-correction
  // draft snapshot (to diff against what's actually being submitted) all in parallel
  const [
    { data: requiredMappings },
    duplicateResult,
    { data: orgData },
    { data: draftBefore },
    { data: openFlags },
    { data: flagLabelMappings },
  ] = await Promise.all([
    supabase
      .from("template_field_mappings")
      .select("placeholder_token, display_label")
      .eq("template_id", templateId)
      .eq("is_required", true)
      .eq("is_mapped", true),
    siteAddress
      ? supabase
          .from("projects")
          .select("id")
          .eq("client_id", orgId)
          .eq("site_address", siteAddress)
          .neq("id", projectId)
          .is("deleted_at", null)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("clients")
      .select("name, delivery_working_days, state_territory")
      .eq("id", orgId)
      .single(),
    supabase
      .from("projects")
      .select("extracted_fields")
      .eq("id", projectId)
      .maybeSingle(),
    supabase
      .from("field_flags")
      .select("id, field_key, candidate_values")
      .eq("project_id", projectId)
      .eq("status", "open"),
    supabase
      .from("template_field_mappings")
      .select("placeholder_token, display_label")
      .eq("template_id", templateId),
  ]);

  const draftFieldsBefore = (draftBefore?.extracted_fields as Record<string, string> | null) ?? {};
  const correctedFields = [
    ...new Set([...Object.keys(draftFieldsBefore), ...Object.keys(extractedFields)]),
  ].filter((k) => (draftFieldsBefore[k] ?? "") !== (extractedFields[k] ?? ""));

  const missingRequired = (requiredMappings ?? []).filter(
    (m) => !extractedFields[m.placeholder_token as string]?.trim()
  );
  if (missingRequired.length > 0) {
    const labels = missingRequired
      .map((m) => m.display_label ?? m.placeholder_token)
      .join(", ");
    return { error: `Please fill in all required fields before submitting: ${labels}.` };
  }

  // #105: a flagged field doesn't need to be actively resolved to submit —
  // the pre-filled default candidate counts as a valid selection on its own
  // — but it can't be blank. A stakeholder clearing a flagged field out
  // entirely is the one case that still blocks.
  const flagLabelByToken = new Map(
    (flagLabelMappings ?? []).map((m) => [m.placeholder_token as string, m.display_label as string | null])
  );
  const blankFlaggedFields = (openFlags ?? []).filter(
    (f) => !extractedFields[f.field_key as string]?.trim()
  );
  if (blankFlaggedFields.length > 0) {
    const labels = blankFlaggedFields
      .map((f) => flagLabelByToken.get(f.field_key as string) ?? f.field_key)
      .join(", ");
    return { error: `Please provide a value for the flagged field(s) before submitting: ${labels}.` };
  }

  if (duplicateResult.data) {
    const existingId = (duplicateResult.data as { id: string }).id;
    after(async () => {
      try {
        const { data: admins } = await supabase
          .from("users")
          .select("id")
          .eq("role", "super_admin");
        await Promise.all(
          (admins ?? []).map((admin: { id: string }) =>
            notify({
              recipientId: admin.id,
              type: "project_submitted",
              title: "Duplicate submission",
              message: `"${siteAddress}" already has an active project for ${orgData?.name ?? orgId} — no new record was created.`,
              emailSubject: "Duplicate address submission — OPS",
              emailHtml: duplicateSubmissionEmail({ siteAddress, orgId }),
            }).catch((err) =>
              console.error("[submitProject] duplicate admin notify failed:", err)
            )
          )
        );
      } catch (err) {
        console.error("[submitProject] duplicate notify setup failed:", err);
      }
    });
    return {
      error: `A project for this address is already active for your organisation.`,
      duplicateProjectId: existingId,
    };
  }

  // Calculate expected delivery date
  let expectedDeliveryDate: string | null = null;
  try {
    const deliveryDays = orgData?.delivery_working_days ?? 5;
    const stateTerritory = (orgData?.state_territory as string | null) ?? null;
    const now = new Date();
    const yearA = now.getUTCFullYear();
    const yearB = yearA + 1;
    const [holidaysA, holidaysB] = await Promise.all([
      getPublicHolidays(stateTerritory, yearA),
      getPublicHolidays(stateTerritory, yearB),
    ]);
    const holidays = new Set([...holidaysA, ...holidaysB]);
    const dueDate = addWorkingDays(now, deliveryDays, holidays);
    expectedDeliveryDate = dueDate.toISOString().slice(0, 10);
  } catch (err) {
    console.error("[submitProject] delivery date calculation failed:", err);
  }

  let updateQuery = supabase
    .from("projects")
    .update(
      {
        status: "submitted",
        po_number: poNumber,
        site_address: siteAddress,
        delivery_recipient_email: deliveryEmail,
        expected_delivery_date: expectedDeliveryDate,
        extracted_fields: extractedFields,
      },
      { count: "exact" }
    )
    .eq("id", projectId)
    .eq("client_id", orgId)
    .eq("status", "draft");
  // Clients can only finalise their own draft; admins/consultants acting on
  // behalf of a stakeholder are scoped by id+org instead (submitted_by is the
  // stakeholder's id, not the acting actor's).
  if (!actsOnBehalf) updateQuery = updateQuery.eq("submitted_by", actor.id);
  const { error: updateError, count } = await updateQuery;

  if (updateError) return { error: `Failed to submit project: ${updateError.message}` };
  if (!count) return { error: "This project has already been submitted or is no longer a draft." };

  // #105: submission no longer force-resolves every open flag on the form.
  // A flag the stakeholder actively picked/corrected was already resolved
  // via resolveFieldFlag at that point; one left untouched rides through at
  // its default value and stays open for the consultant to acknowledge.
  //
  // The one exception: a flag whose only "candidate" is buildFieldFlagPlan's
  // synthetic not-found-in-any-document placeholder (field-flags.ts) never
  // had real extraction evidence behind it in the first place — the
  // blankFlaggedFields check above already forced the stakeholder to type
  // this value themselves before they could submit at all, so it's already
  // self-attested. Auto-resolving it here (unlike genuinely-flagged fields,
  // which stay open) keeps field_flags in sync with the extracted_fields
  // value that was just saved, instead of leaving a stale, permanently-open
  // flag with no source document for a consultant to meaningfully review.
  const noExtractionFlags = (openFlags ?? []).filter((f) => {
    const candidates = (f.candidate_values as ExtractedCandidate[] | null) ?? [];
    return candidates.length === 1 && candidates[0].source_document === "none";
  });
  // Runs before the redirect below, not deferred into after() — the very
  // next page the stakeholder lands on (their own submitted-details view)
  // reads these same flags, so this has to be committed before that request
  // arrives, not racing it in the background. try/catch keeps a failure here
  // from ever blocking the submission that already succeeded above.
  if (noExtractionFlags.length > 0) {
    try {
      const resolvedAt = new Date().toISOString();
      await Promise.all(
        noExtractionFlags.map((f) =>
          supabase
            .from("field_flags")
            .update({
              status: "resolved",
              current_value: extractedFields[f.field_key as string] ?? "",
              resolved_by: actor.id,
              resolved_at: resolvedAt,
              resolved_stage: "submitted",
              resolution_reason: "self_resolved",
              // No consultant reviewed this (consultant_acknowledged_by
              // stays null — nobody did), but every gate that checks
              // consultant_acknowledged_at IS NULL to mean "still needs
              // review" (generatePbdbForProject's server-side gate, the
              // Right Now pickup card, etc.) needs a single source of truth
              // that this flag doesn't need one, rather than each consumer
              // re-deriving "no extraction evidence" from candidate_values
              // itself. Setting it here, once, at the point the flag stops
              // needing review, is that source of truth.
              consultant_acknowledged_at: resolvedAt,
            })
            .eq("id", f.id)
        )
      );
    } catch (err) {
      console.error("[submitProject] auto-resolving no-extraction-evidence flags failed:", err);
    }
  }

  // Defer all remaining post-success side effects so they don't block the redirect
  after(async () => {
    let recipientName = (actor.first_name as string | null) ?? "there";
    if (actsOnBehalf) {
      const { data: recipientUser } = await supabase
        .from("users")
        .select("first_name")
        .eq("id", adminClientId as string)
        .single();
      recipientName = (recipientUser?.first_name as string | null) ?? "there";
    }

    await Promise.all([
      notify({
        recipientId: actsOnBehalf ? adminClientId : actor.id,
        type: "acknowledgement",
        title: "Request received",
        message: `Your report request for ${siteAddress ?? "your property"} has been received and is being processed.`,
        projectId,
        emailSubject: "Report request received — OPS",
        emailHtml: AcknowledgementEmail({
          recipientName,
          projectId: siteAddress ?? projectId.slice(0, 8),
          expectedDeliveryDate: expectedDeliveryDate
            ? new Date(expectedDeliveryDate).toLocaleDateString("en-AU")
            : "To be confirmed",
          portalUrl: `${process.env.NEXT_PUBLIC_APP_URL}/portal/projects/${projectId}`,
          poNumber,
        }),
      }).catch((err) => console.error("[submitProject] client notify failed:", err)),

      auditLog("project.submitted", actor.id, actor.email as string, {
        orgId,
        projectId,
        metadata: {
          poNumber,
          templateId,
          ...(correctedFields.length > 0 ? { corrected_fields: correctedFields } : {}),
        },
      }),

      // Logged as its own event (rather than folded into project.submitted's
      // metadata) so the acknowledgement is visible as a distinct line in the
      // audit trail, not buried in another event's details.
      auditLog("project.review_confirmed", actor.id, actor.email as string, {
        orgId,
        projectId,
      }),
    ]);
  });

  if (isAdmin) {
    revalidatePath("/admin/projects");
    revalidatePath(`/admin/projects/${projectId}`);
    redirect(`/admin/projects/${projectId}`);
  } else if (isConsultant) {
    // A consultant uploading on a stakeholder's behalf is claiming the
    // project themselves — self-assign immediately rather than leaving it
    // in the unassigned "submitted" pool for another consultant to pick up.
    try {
      await performAssignment(projectId, actor.id, actor.id, actor.email as string);
    } catch (err) {
      console.error("[submitProject] consultant self-assign failed:", err);
    }
    revalidatePath("/ops");
    revalidatePath(`/ops/projects/${projectId}`);
    redirect(`/ops/projects/${projectId}`);
  } else {
    revalidatePath("/portal");
    revalidatePath(`/portal/projects/${projectId}`);
    redirect(`/portal/projects/${projectId}?submitted=1`);
  }
}

// ─── Email templates ─────────────────────────────────────────────────────────

function duplicateSubmissionEmail({
  siteAddress,
  orgId,
}: {
  siteAddress: string | null;
  orgId: string;
}) {
  return `<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; color: #18181b; max-width: 560px; margin: 0 auto; padding: 24px;">
  <h2 style="font-size: 18px; font-weight: 600; margin-bottom: 8px;">Duplicate address submission</h2>
  <p style="color: #52525b; margin-bottom: 16px;">
    A client from organisation <code>${escHtml(orgId)}</code> attempted to submit a project for address
    <strong>${escHtml(siteAddress ?? "—")}</strong>, which already has an active project record. No new record was created.
  </p>
  <p style="color: #52525b; margin-bottom: 16px;">
    Please review and make a final call on whether a new record is required.
  </p>
  <p style="color: #a1a1aa; font-size: 13px;">OPS — Online Performance Solution</p>
</body>
</html>`;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
