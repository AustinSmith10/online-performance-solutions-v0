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

export interface Development {
  dev_name: string;
  trustee_entity: string;
  aep: number;
}

// Tokens auto-resolved from halcyon_developments — never sent to AI extraction
const TRUSTEE_TOKEN = "EXTRACT_TRUSTEE";
const RAINFALL_TOKEN = "EXTRACT_RAINFALL_INTENSITY";
const HALCYON_LOOKUP_TOKEN = "EXTRACT_DEV_NAME";

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
      developments: Development[];
      projectId: string;
      templateId: string;
    };

// ─── Step 1: upload + extract ───────────────────────────────────────────────

export async function extractFields(
  _prev: ExtractState,
  formData: FormData
): Promise<ExtractState> {
  const actor = await requireRole("client", "super_admin", "admin");
  const supabase = createAdminClient();

  const templateId = (formData.get("template_id") as string | null)?.trim();
  if (!templateId) return { step: 1, error: "No template selected." };

  const isAdmin = actor.role === "super_admin";
  const orgId = isAdmin
    ? ((formData.get("admin_org_id") as string | null)?.trim() ?? "")
    : (actor.org_id as string);
  if (!orgId) return { step: 1, error: "Organisation is required." };
  const adminClientId = isAdmin
    ? ((formData.get("admin_client_id") as string | null)?.trim() ?? "")
    : "";
  if (isAdmin && !adminClientId) return { step: 1, error: "Client account is required." };
  const projectId = crypto.randomUUID();

  // Load file requirements for this template
  const { data: fileReqsData } = await supabase
    .from("file_requirements")
    .select("id, name, slug, max_count, required, no_duplicates, extraction")
    .eq("template_id", templateId)
    .order("sort_order");

  type FileReq = {
    id: string; name: string; slug: string;
    max_count: number; required: boolean; no_duplicates: boolean; extraction: boolean;
  };
  const fileReqs = (fileReqsData ?? []) as FileReq[];

  // Collect uploaded files per requirement slot
  const filesBySlug: Record<string, File[]> = {};
  for (const req of fileReqs) {
    const all = formData.getAll(req.slug) as (File | string)[];
    filesBySlug[req.slug] = all
      .filter((f): f is File => f instanceof File && f.size > 0)
      .slice(0, req.max_count);
  }

  // Validate required slots
  for (const req of fileReqs) {
    if (req.required && !filesBySlug[req.slug]?.length) {
      return { step: 1, error: `"${req.name}" is required. Please attach a file.` };
    }
  }

  // Validate file sizes (50 MB per file)
  for (const req of fileReqs) {
    for (const file of filesBySlug[req.slug] ?? []) {
      if (file.size > 50 * 1024 * 1024) {
        return { step: 1, error: `"${req.name}" — "${file.name}" exceeds the 50 MB limit.` };
      }
    }
  }

  // Validate no_duplicates within each slot
  for (const req of fileReqs) {
    if (req.no_duplicates) {
      const names = (filesBySlug[req.slug] ?? []).map((f) => f.name);
      if (new Set(names).size < names.length) {
        return { step: 1, error: `"${req.name}" cannot contain files with duplicate names.` };
      }
    }
  }

  // Read all file buffers and build upload manifest
  type UploadItem = { req: FileReq; file: File; path: string; buffer: Buffer };
  const uploadItems: UploadItem[] = await Promise.all(
    fileReqs.flatMap((req) =>
      (filesBySlug[req.slug] ?? []).map(async (file) => ({
        req,
        file,
        path: `${orgId}/${projectId}/${req.slug}/${file.name}`,
        buffer: Buffer.from(await file.arrayBuffer()),
      }))
    )
  );

  // Upload all files in parallel
  const uploadResults = await Promise.all(
    uploadItems.map(({ buffer, file, path }) =>
      supabase.storage
        .from("submissions")
        .upload(path, buffer, { contentType: file.type || "application/pdf" })
    )
  );

  const failedIdx = uploadResults.findIndex((r) => r.error);
  if (failedIdx >= 0) {
    const successPaths = uploadResults.slice(0, failedIdx).map((_, i) => uploadItems[i].path);
    if (successPaths.length) await supabase.storage.from("submissions").remove(successPaths);
    return { step: 1, error: `Failed to upload "${uploadItems[failedIdx].file.name}". Please try again.` };
  }

  // Collect extraction documents (only slots with extraction = true)
  const extractionDocs = uploadItems
    .filter((item) => item.req.extraction)
    .map((item) => ({ label: item.req.name, buffer: item.buffer }));

  // Load template mappings, section labels, and org config in parallel
  const [mappingsResult, orgResult, templateResult] = await Promise.all([
    supabase
      .from("template_field_mappings")
      .select("placeholder_token, field_key, display_label, extraction_hint, is_required")
      .eq("template_id", templateId)
      .eq("is_mapped", true)
      .order("sort_order")
      .order("placeholder_token"),
    supabase.from("organisations").select("org_config").eq("id", orgId).single(),
    supabase.from("templates").select("section_labels").eq("id", templateId).single(),
  ]);

  const allMappings = mappingsResult.data ?? [];
  const orgConfig = (orgResult.data?.org_config ?? {}) as Record<string, string>;
  const rawLabels = (templateResult.data?.section_labels ?? {}) as Record<string, string>;
  const sectionLabels: SectionLabels = {
    extract: rawLabels.extract || "Extracted from your documents",
    extractDesc: rawLabels.extractDesc || "Review and correct any fields marked below before submitting.",
    trusteeDesc: rawLabels.trusteeDesc || "",
    org: rawLabels.org || "Organisation details",
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
  const needsHalcyon = hasTrustee || rainfallToken !== null;

  // Exclude halcyon-resolved tokens from AI extraction (HOUSE_TYPE is extracted by AI, used as lookup key)
  const halcyonTokens = new Set([TRUSTEE_TOKEN, RAINFALL_TOKEN]);
  const extractTokens = extractMappings
    .filter((m) => !halcyonTokens.has(m.placeholder_token))
    .map((m) => ({
      token: m.placeholder_token,
      label: m.display_label ?? m.placeholder_token,
      hint: m.extraction_hint ?? `Extract the value for ${m.placeholder_token} from the documents.`,
    }));

  let extraction;
  let developments: Development[] = [];

  try {
    const [extractionResult, devsResult] = await Promise.all([
      extractDocumentFields(extractionDocs, extractTokens),
      needsHalcyon
        ? supabase
            .from("halcyon_developments")
            .select("dev_name, trustee_entity, aep")
            .order("dev_name")
        : Promise.resolve({ data: [] }),
    ]);
    extraction = extractionResult;
    developments = (devsResult.data ?? []) as Development[];

    // Auto-resolve trustee and rainfall intensity from the Halcyon developments table
    // using the extracted development name.
    if (needsHalcyon && developments.length > 0) {
      const devName = extraction.fields[HALCYON_LOOKUP_TOKEN]?.value?.trim() ?? "";
      if (devName) {
        const needle = devName.toLowerCase();
        const matchedDev =
          developments.find((d) => d.dev_name.toLowerCase() === needle) ??
          developments.find(
            (d) =>
              d.dev_name.toLowerCase().includes(needle) ||
              needle.includes(d.dev_name.toLowerCase())
          );
        if (matchedDev) {
          if (hasTrustee) {
            extraction.fields[TRUSTEE_TOKEN] = {
              value: matchedDev.trustee_entity,
              confidence: "high",
            };
          }
          if (rainfallToken) {
            extraction.fields[RAINFALL_TOKEN] = {
              value: String(matchedDev.aep),
              confidence: "high",
            };
          }
        }
      }
    }
  } catch (err) {
    const pathsToRemove = uploadItems.map((i) => i.path);
    if (pathsToRemove.length) await supabase.storage.from("submissions").remove(pathsToRemove);
    console.error("[extractFields] extraction failed:", err);
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
    const pathsToRemove = uploadItems.map((i) => i.path);
    const [{ data: byAddress }, { data: byDraft }] = await Promise.all([
      supabase
        .from("projects")
        .select("id")
        .eq("org_id", orgId)
        .eq("site_address", extractedAddress)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("projects")
        .select("id")
        .eq("org_id", orgId)
        .filter("extracted_fields->>EXTRACT_ADDRESS", "eq", extractedAddress)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle(),
    ]);
    const existing = byAddress ?? byDraft;
    if (existing) {
      if (pathsToRemove.length) await supabase.storage.from("submissions").remove(pathsToRemove);
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
    org_id: orgId,
    template_id: templateId,
    submitted_by: isAdmin ? adminClientId : actor.id,
    status: "draft",
    po_number: extraction.po_number.value || null,
    extracted_fields: draftFields,
  });

  if (projectError) {
    const pathsToRemove = uploadItems.map((i) => i.path);
    if (pathsToRemove.length) await supabase.storage.from("submissions").remove(pathsToRemove);
    console.error("[extractFields] draft project insert failed:", projectError);
    return { step: 1, error: "Failed to save your draft. Please try again." };
  }

  if (uploadItems.length > 0) {
    const fileRecords = uploadItems.map(({ req, file, path }) => ({
      project_id: projectId,
      file_type: req.slug,
      storage_path: path,
      original_filename: file.name,
      uploaded_by: actor.id,
    }));
    await supabase.from("project_files").insert(fileRecords);
  }

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

  return {
    step: 2,
    poNumber: extraction.po_number,
    tokenGroups,
    sectionLabels,
    hasTrustee,
    rainfallToken,
    developments,
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
  const actor = await requireRole("client", "super_admin", "admin");
  const supabase = createAdminClient();

  const isAdmin = actor.role === "super_admin";
  const orgId = isAdmin
    ? ((formData.get("admin_org_id") as string | null)?.trim() ?? "")
    : (actor.org_id as string);
  if (!orgId) return { error: "Organisation is required." };
  const adminClientId = isAdmin
    ? ((formData.get("admin_client_id") as string | null)?.trim() ?? "")
    : "";
  if (isAdmin && !adminClientId) return { error: "Client account is required." };

  const projectId = (formData.get("project_id") as string | null)?.trim();
  const templateId = (formData.get("template_id") as string | null)?.trim();

  if (!projectId || !templateId) {
    return { error: "Missing required submission data. Please start over." };
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

  // Required-fields check, duplicate check, and org config all in parallel
  const [
    { data: requiredMappings },
    duplicateResult,
    { data: orgData },
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
          .eq("org_id", orgId)
          .eq("site_address", siteAddress)
          .neq("id", projectId)
          .is("deleted_at", null)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("organisations")
      .select("name, delivery_working_days, state_territory")
      .eq("id", orgId)
      .single(),
  ]);

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
    .eq("org_id", orgId)
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

      (async () => {
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
                message: `New project submission received for ${siteAddress ?? "unknown address"} from ${orgData?.name ?? orgId}.`,
                projectId,
                emailSubject: "New project submission — OPS",
                emailHtml: adminSubmissionEmail({ poNumber, projectId }),
              }).catch((err: unknown) => console.error("[submitProject] admin notify failed:", err))
            )
          );
        } catch (err) {
          console.error("[submitProject] admin notify setup failed:", err);
        }
      })(),

      auditLog("project.submitted", actor.id, actor.email as string, {
        orgId,
        projectId,
        metadata: { poNumber, templateId },
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

function adminSubmissionEmail({
  poNumber,
  projectId,
}: {
  poNumber: string | null;
  projectId: string;
}) {
  return `<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; color: #18181b; max-width: 560px; margin: 0 auto; padding: 24px;">
  <h2 style="font-size: 18px; font-weight: 600; margin-bottom: 8px;">New project submission</h2>
  <p style="color: #52525b; margin-bottom: 16px;">
    A new project has been submitted${poNumber ? ` with PO number <strong>${escHtml(poNumber)}</strong>` : " (no PO number)"}.
  </p>
  <p style="color: #52525b; margin-bottom: 16px;">
    Project ID: <code>${escHtml(projectId)}</code>
  </p>
  <p>
    <a href="${process.env.NEXT_PUBLIC_APP_URL ?? ""}/admin/projects/${escHtml(projectId)}"
       style="display: inline-block; background: #18181b; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-size: 14px;">
      View project
    </a>
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
