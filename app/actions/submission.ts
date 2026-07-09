"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { auditLog } from "@/lib/audit/log";
import { notify } from "@/lib/notifications/notify";
import { extractDocumentFields, type ExtractedField, type Confidence } from "@/lib/documents/extractor";
import { normalizeExtractedFields } from "@/lib/documents/formatters";
import { getPublicHolidays } from "@/lib/delivery/public-holidays";
import { addWorkingDays } from "@/lib/delivery/working-days";
import {
  getMetricsAutofillConfigs,
  getAutofillExclusionTokens,
  resolveMetricsAutofill,
  buildMetricsPickRows,
  type MetricsPickRow,
} from "@/lib/documents/metrics-autofill";

// A client's metrics-table autofill config may resolve these — the review UI
// shows the trustee as a correctable dropdown and rainfall intensity as a
// plain extracted field, regardless of which table resolved them.
const TRUSTEE_TOKEN = "EXTRACT_TRUSTEE";
const RAINFALL_TOKEN = "EXTRACT_RAINFALL_INTENSITY";

export interface TokenField {
  token: string;
  label: string;
  value: string;
  confidence: Confidence;
  required: boolean;
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
      projectId: string;
      templateId: string;
    };

// ─── Step 1a: derive an org id from actor role + admin fields (shared) ──────

function resolveOrgId(
  actor: { role: string; client_id?: unknown },
  isAdmin: boolean,
  adminOrgId: string | null
): string {
  return isAdmin ? (adminOrgId?.trim() ?? "") : (actor.client_id as string);
}

type FileReq = {
  id: string; name: string; slug: string;
  max_count: number; required: boolean; no_duplicates: boolean; extraction: boolean;
};

async function loadFileRequirements(
  supabase: ReturnType<typeof createAdminClient>,
  templateId: string
): Promise<FileReq[]> {
  const { data } = await supabase
    .from("file_requirements")
    .select("id, name, slug, max_count, required, no_duplicates, extraction")
    .eq("template_id", templateId)
    .order("sort_order");
  return (data ?? []) as FileReq[];
}

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
  await requireRole("stakeholder", "super_admin", "admin");
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
  const actor = await requireRole("stakeholder", "super_admin", "admin");
  const supabase = createAdminClient();

  if (!templateId) return { error: "No template selected." };

  const isAdmin = actor.role === "super_admin" || actor.role === "admin";
  const orgId = resolveOrgId(actor, isAdmin, adminOrgId);
  if (!orgId) return { error: "Client is required." };
  if (isAdmin && !adminClientId?.trim()) return { error: "Client account is required." };

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

// ─── Step 1b: finalize — download uploaded files for extraction, persist ────

export interface FinalizeUploadItem {
  slug: string;
  name: string;
  path: string;
}

export async function finalizeSubmission(
  projectId: string,
  templateId: string,
  adminOrgId: string | null,
  adminClientId: string | null,
  uploads: FinalizeUploadItem[]
): Promise<ExtractState> {
  const actor = await requireRole("stakeholder", "super_admin", "admin");
  const supabase = createAdminClient();

  const isAdmin = actor.role === "super_admin" || actor.role === "admin";
  const orgId = resolveOrgId(actor, isAdmin, adminOrgId);
  if (!orgId) return { step: 1, error: "Client is required." };
  if (isAdmin && !adminClientId?.trim()) return { step: 1, error: "Client account is required." };

  const fileReqs = await loadFileRequirements(supabase, templateId);
  const reqBySlug = new Map(fileReqs.map((r) => [r.slug, r]));

  const cleanupPaths = uploads.map((u) => u.path);
  const cleanup = async () => {
    if (cleanupPaths.length) await supabase.storage.from("submissions").remove(cleanupPaths);
  };

  // Defensive re-validation: confirm each uploaded object actually exists and
  // is within the size limit (declared sizes were only checked client-side
  // before the signed-URL request; the browser controls the actual bytes).
  const byFolder = new Map<string, FinalizeUploadItem[]>();
  for (const u of uploads) {
    const folder = u.path.slice(0, u.path.lastIndexOf("/"));
    byFolder.set(folder, [...(byFolder.get(folder) ?? []), u]);
  }
  for (const [folder, items] of byFolder) {
    const { data: listing } = await supabase.storage.from("submissions").list(folder);
    for (const item of items) {
      const filename = item.path.slice(item.path.lastIndexOf("/") + 1);
      const entry = listing?.find((f) => f.name === filename);
      if (!entry) {
        await cleanup();
        return { step: 1, error: `Upload for "${item.name}" did not complete. Please try again.` };
      }
      if ((entry.metadata?.size ?? 0) > 50 * 1024 * 1024) {
        await cleanup();
        return { step: 1, error: `"${item.name}" exceeds the 50 MB limit.` };
      }
    }
  }

  // Download only the files needed for extraction (slots with extraction = true)
  const extractionUploads = uploads.filter((u) => reqBySlug.get(u.slug)?.extraction);
  const downloaded = await Promise.all(
    extractionUploads.map(async (u) => {
      const { data, error } = await supabase.storage.from("submissions").download(u.path);
      if (error || !data) throw new Error(`Failed to read "${u.name}" for extraction.`);
      return { label: reqBySlug.get(u.slug)!.name, buffer: Buffer.from(await data.arrayBuffer()) };
    })
  ).catch((err: Error) => err);

  if (downloaded instanceof Error) {
    await cleanup();
    return { step: 1, error: downloaded.message };
  }
  const extractionDocs = downloaded;

  // Load template mappings, section labels, and org config in parallel
  const [mappingsResult, orgResult, templateResult] = await Promise.all([
    supabase
      .from("template_field_mappings")
      .select("placeholder_token, field_key, display_label, extraction_hint, is_required")
      .eq("template_id", templateId)
      .eq("is_mapped", true)
      .order("sort_order")
      .order("placeholder_token"),
    supabase.from("clients").select("client_config").eq("id", orgId).single(),
    supabase.from("templates").select("name, section_labels").eq("id", templateId).single(),
  ]);

  const allMappings = mappingsResult.data ?? [];
  const orgConfig = (orgResult.data?.client_config ?? {}) as Record<string, string>;
  const templateName = (templateResult.data?.name as string | null) ?? null;
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

  const metricsAutofillConfigs = await getMetricsAutofillConfigs(supabase, orgId);
  const metricsExclusionTokens = getAutofillExclusionTokens(metricsAutofillConfigs);
  const extractTokens = extractMappings
    .filter((m) => !metricsExclusionTokens.has(m.placeholder_token))
    .map((m) => ({
      token: m.placeholder_token,
      label: m.display_label ?? m.placeholder_token,
      hint: m.extraction_hint ?? `Extract the value for ${m.placeholder_token} from the documents.`,
    }));

  let extraction;

  try {
    extraction = await extractDocumentFields(extractionDocs, extractTokens);
    resolveMetricsAutofill(metricsAutofillConfigs, extraction.fields);
  } catch (err) {
    await cleanup();
    console.error("[finalizeSubmission] extraction failed:", err);
    return {
      step: 1,
      error:
        "Document extraction failed. Please check that your files are valid PDFs and try again.",
    };
  }

  // Duplicate address check — block draft creation if any non-deleted project
  // for this org already has the same address (submitted or draft).
  const extractedAddress = extraction.fields["EXTRACT_ADDRESS"]?.value?.trim() ?? "";
  if (extractedAddress) {
    const [{ data: byAddress }, { data: byDraft }] = await Promise.all([
      supabase
        .from("projects")
        .select("id")
        .eq("client_id", orgId)
        .eq("site_address", extractedAddress)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("projects")
        .select("id")
        .eq("client_id", orgId)
        .filter("extracted_fields->>EXTRACT_ADDRESS", "eq", extractedAddress)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle(),
    ]);
    const existing = byAddress ?? byDraft;
    if (existing) {
      await cleanup();
      return {
        step: 1,
        error: `A project for ${extractedAddress} already exists. Please review the existing project instead of creating a new one.`,
        duplicateProjectId: (existing as { id: string }).id,
      };
    }
  }

  // Persist draft — normalise and save field values as plain strings
  const draftFields = normalizeExtractedFields(
    Object.fromEntries(Object.entries(extraction.fields).map(([k, v]) => [k, v.value]))
  );
  const { error: projectError } = await supabase.from("projects").insert({
    id: projectId,
    client_id: orgId,
    template_id: templateId,
    submitted_by: isAdmin ? (adminClientId as string) : actor.id,
    status: "draft",
    po_number: extraction.po_number.value || null,
    extracted_fields: draftFields,
  });

  if (projectError) {
    await cleanup();
    console.error("[finalizeSubmission] draft project insert failed:", projectError);
    return { step: 1, error: "Failed to save your draft. Please try again." };
  }

  if (uploads.length > 0) {
    const fileRecords = uploads.map(({ slug, name, path }) => ({
      project_id: projectId,
      file_type: slug,
      storage_path: path,
      original_filename: name,
      uploaded_by: actor.id,
    }));
    await supabase.from("project_files").insert(fileRecords);
  }

  await auditLog("project.draft_created", actor.id, actor.email as string, {
    orgId,
    projectId,
    metadata: {
      templateId,
      templateName,
      files: uploads.map(({ slug, name }) => ({
        slug,
        label: reqBySlug.get(slug)?.name ?? slug,
        filename: name,
      })),
      extracted_fields: draftFields,
      po_number: extraction.po_number.value || null,
    },
  });

  const tokenGroups = {
    extract: extractMappings.map((m) => ({
      token: m.placeholder_token,
      label: m.display_label ?? m.placeholder_token,
      value: draftFields[m.placeholder_token] ?? extraction.fields[m.placeholder_token]?.value ?? "",
      confidence: extraction.fields[m.placeholder_token]?.confidence ?? ("low" as Confidence),
      required: m.is_required ?? false,
    })),
    org: orgMappings.map((m) => ({
      token: m.placeholder_token,
      label: m.display_label ?? m.placeholder_token,
      value: orgConfig[m.placeholder_token] ?? "",
      confidence: "high" as Confidence,
      required: false,
    })),
    client: clientMappings.map((m) => ({
      token: m.placeholder_token,
      label: m.display_label ?? m.placeholder_token,
      value: "",
      confidence: "high" as Confidence,
      required: m.is_required ?? false,
    })),
  };

  const trusteePick = hasTrustee ? buildMetricsPickRows(metricsAutofillConfigs, TRUSTEE_TOKEN) : null;

  return {
    step: 2,
    poNumber: extraction.po_number,
    tokenGroups,
    sectionLabels,
    hasTrustee,
    rainfallToken,
    matchToken: trusteePick?.matchToken ?? null,
    pickRows: trusteePick?.rows ?? [],
    projectId,
    templateId,
  };
}

// ─── Step 2: submit project ─────────────────────────────────────────────────

export type SubmitState = { error?: string; duplicateProjectId?: string };

export async function submitProject(
  _prev: SubmitState,
  formData: FormData
): Promise<SubmitState> {
  const actor = await requireRole("stakeholder", "super_admin", "admin");
  const supabase = createAdminClient();

  const isAdmin = actor.role === "super_admin" || actor.role === "admin";
  const orgId = isAdmin
    ? ((formData.get("admin_org_id") as string | null)?.trim() ?? "")
    : (actor.client_id as string);
  if (!orgId) return { error: "Client is required." };
  const adminClientId = isAdmin
    ? ((formData.get("admin_client_id") as string | null)?.trim() ?? "")
    : "";
  if (isAdmin && !adminClientId) return { error: "Client account is required." };

  const projectId = (formData.get("project_id") as string | null)?.trim();
  const templateId = (formData.get("template_id") as string | null)?.trim();

  if (!projectId || !templateId) {
    return { error: "Missing required submission data. Please start over." };
  }

  if (formData.get("reviewed_confirmed") !== "true") {
    return { error: "Please confirm that you have reviewed the details above before submitting." };
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
              message: `Duplicate address submission: "${siteAddress}" already has an active project for ${orgData?.name ?? orgId}. No new record was created.`,
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
  // Clients can only finalise their own draft; admins scoped by id+org is sufficient.
  if (!isAdmin) updateQuery = updateQuery.eq("submitted_by", actor.id);
  const { error: updateError, count } = await updateQuery;

  if (updateError) return { error: `Failed to submit project: ${updateError.message}` };
  if (!count) return { error: "This project has already been submitted or is no longer a draft." };

  // Defer all post-success side effects so they don't block the redirect
  after(async () => {
    await Promise.all([
      notify({
        recipientId: isAdmin ? adminClientId : actor.id,
        type: "acknowledgement",
        message: `Your report request for ${siteAddress ?? "your property"} has been received and is being processed.`,
        projectId,
        emailSubject: "Report request received — OPS",
        emailHtml: submissionConfirmationEmail({ poNumber }),
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
  } else {
    revalidatePath("/portal");
    revalidatePath(`/portal/projects/${projectId}`);
    redirect(`/portal/projects/${projectId}?submitted=1`);
  }
}

// ─── Email templates ─────────────────────────────────────────────────────────

function submissionConfirmationEmail({ poNumber }: { poNumber: string | null }) {
  return `<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; color: #18181b; max-width: 560px; margin: 0 auto; padding: 24px;">
  <h2 style="font-size: 18px; font-weight: 600; margin-bottom: 8px;">Report request received</h2>
  <p style="color: #52525b; margin-bottom: 16px;">
    Thank you — your report request${poNumber ? ` for PO <strong>${escHtml(poNumber)}</strong>` : ""} has been received and is being processed.
  </p>
  <p style="color: #52525b; margin-bottom: 16px;">
    You will be notified once your report is ready. If you have any questions, please contact your account manager.
  </p>
  <p style="color: #a1a1aa; font-size: 13px;">OPS — Online Performance Solution</p>
</body>
</html>`;
}

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
