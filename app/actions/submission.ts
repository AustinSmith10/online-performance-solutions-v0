"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { auditLog } from "@/lib/audit/log";
import { notify } from "@/lib/notifications/notify";
import { extractDocumentFields, type ExtractedField, type Confidence } from "@/lib/documents/extractor";
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

export interface TokenField {
  token: string;
  label: string;
  value: string;
  confidence: Confidence;
  required: boolean;
}

// ─── Step 1 → 2 state ────────────────────────────────────────────────────────

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
  const actor = await requireRole("client");
  const supabase = createAdminClient();

  const templateId = (formData.get("template_id") as string | null)?.trim();
  if (!templateId) return { step: 1, error: "No template selected." };

  const poFile = formData.get("po_file") as File | null;
  const plansFile = formData.get("plans_file") as File | null;

  if (!plansFile || plansFile.size === 0)
    return { step: 1, error: "Building plans document is required." };
  if (plansFile.size > 50 * 1024 * 1024)
    return { step: 1, error: "Building plans must be under 50 MB." };
  if (poFile && poFile.size > 50 * 1024 * 1024)
    return { step: 1, error: "Purchase order must be under 50 MB." };

  const orgId = actor.org_id as string;
  const projectId = crypto.randomUUID();

  const hasPoFile = !!poFile && poFile.size > 0;
  const poBuffer = hasPoFile ? Buffer.from(await poFile.arrayBuffer()) : null;
  const plansBuffer = Buffer.from(await plansFile.arrayBuffer());

  const poPath = hasPoFile ? `${orgId}/${projectId}/po/${poFile.name}` : "";
  const plansPath = `${orgId}/${projectId}/plans/${plansFile.name}`;

  const uploadsToRun: Promise<{ error: { message: string } | null }>[] = [
    supabase.storage
      .from("submissions")
      .upload(plansPath, plansBuffer, { contentType: plansFile.type || "application/pdf" }),
  ];
  if (hasPoFile && poBuffer) {
    uploadsToRun.unshift(
      supabase.storage
        .from("submissions")
        .upload(poPath, poBuffer, { contentType: poFile.type || "application/pdf" })
    );
  }

  const uploadResults = await Promise.all(uploadsToRun);
  for (const result of uploadResults) {
    if (result.error) {
      const uploaded = uploadResults
        .filter((r) => !r.error)
        .map((_, i) => (i === 0 && hasPoFile ? poPath : plansPath));
      await supabase.storage.from("submissions").remove(uploaded);
      return { step: 1, error: `Failed to upload document: ${result.error.message}` };
    }
  }

  // Load template mappings + org config + run extraction in parallel
  const [mappingsResult, orgResult] = await Promise.all([
    supabase
      .from("template_field_mappings")
      .select("placeholder_token, field_key, display_label, extraction_hint, is_required")
      .eq("template_id", templateId)
      .eq("is_mapped", true)
      .order("sort_order")
      .order("placeholder_token"),
    supabase.from("organisations").select("org_config").eq("id", orgId).single(),
  ]);

  const allMappings = mappingsResult.data ?? [];
  const orgConfig = (orgResult.data?.org_config ?? {}) as Record<string, string>;

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

  // Exclude halcyon-resolved tokens from AI extraction
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
      extractDocumentFields(poBuffer, plansBuffer, extractTokens),
      needsHalcyon
        ? supabase
            .from("halcyon_developments")
            .select("dev_name, trustee_entity, aep")
            .order("dev_name")
        : Promise.resolve({ data: [] }),
    ]);
    extraction = extractionResult;
    developments = (devsResult.data ?? []) as Development[];

    // Auto-resolve trustee and rainfall intensity from Halcyon using the extracted dev name
    if (needsHalcyon && developments.length > 0) {
      const devName = extraction.fields["EXTRACT_DEV_NAME"]?.value?.trim() ?? "";
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
    const pathsToRemove = [plansPath, ...(hasPoFile ? [poPath] : [])];
    await supabase.storage.from("submissions").remove(pathsToRemove);
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
    const pathsToRemove = [plansPath, ...(hasPoFile ? [poPath] : [])];
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
      await supabase.storage.from("submissions").remove(pathsToRemove);
      return {
        step: 1,
        error: `A project for ${extractedAddress} already exists. Please review the existing project instead of creating a new one.`,
        duplicateProjectId: (existing as { id: string }).id,
      };
    }
  }

  // Persist draft — save field values as plain strings so the resume page can read them
  const draftFields = Object.fromEntries(
    Object.entries(extraction.fields).map(([k, v]) => [k, v.value])
  );
  const { error: projectError } = await supabase.from("projects").insert({
    id: projectId,
    org_id: orgId,
    template_id: templateId,
    submitted_by: actor.id,
    status: "draft",
    po_number: extraction.po_number.value || null,
    extracted_fields: draftFields,
  });

  if (projectError) {
    const pathsToRemove = [plansPath, ...(hasPoFile ? [poPath] : [])];
    await supabase.storage.from("submissions").remove(pathsToRemove);
    console.error("[extractFields] draft project insert failed:", projectError);
    return { step: 1, error: "Failed to save your draft. Please try again." };
  }

  const fileRecords = [
    {
      project_id: projectId,
      file_type: "building_plans",
      storage_path: plansPath,
      original_filename: plansFile.name,
      uploaded_by: actor.id,
    },
    ...(hasPoFile
      ? [
          {
            project_id: projectId,
            file_type: "po",
            storage_path: poPath,
            original_filename: poFile.name,
            uploaded_by: actor.id,
          },
        ]
      : []),
  ];
  await supabase.from("project_files").insert(fileRecords);

  const tokenGroups = {
    extract: extractMappings.map((m) => ({
      token: m.placeholder_token,
      label: m.display_label ?? m.placeholder_token,
      value: extraction.fields[m.placeholder_token]?.value ?? "",
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
  const actor = await requireRole("client");
  const supabase = createAdminClient();

  const orgId = actor.org_id as string;
  const projectId = (formData.get("project_id") as string | null)?.trim();
  const templateId = (formData.get("template_id") as string | null)?.trim();

  if (!projectId || !templateId) {
    return { error: "Missing required submission data. Please start over." };
  }

  const poNumber = (formData.get("extracted_po_number") as string | null)?.trim() || null;
  const deliveryEmail =
    (formData.get("delivery_recipient_email") as string | null)?.trim() || null;

  // Collect all token values from form (EXTRACT_, ORG_, CLIENT_)
  const extractedFields: Record<string, string> = {};
  for (const [key, rawVal] of formData.entries()) {
    if (
      key.startsWith("EXTRACT_") ||
      key.startsWith("ORG_") ||
      key.startsWith("CLIENT_")
    ) {
      extractedFields[key] = (rawVal as string).trim();
    }
  }

  // Check required fields are populated
  const { data: requiredMappings } = await supabase
    .from("template_field_mappings")
    .select("placeholder_token, display_label")
    .eq("template_id", templateId)
    .eq("is_required", true)
    .eq("is_mapped", true);

  const missingRequired = (requiredMappings ?? []).filter(
    (m) => !extractedFields[m.placeholder_token as string]?.trim()
  );
  if (missingRequired.length > 0) {
    const labels = missingRequired
      .map((m) => m.display_label ?? m.placeholder_token)
      .join(", ");
    return { error: `Please fill in all required fields before submitting: ${labels}.` };
  }

  const siteAddress = (extractedFields["EXTRACT_ADDRESS"] ?? "").trim() || null;

  // Duplicate address check and org delivery config in parallel
  const [duplicateResult, { data: orgData }] = await Promise.all([
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

  if (duplicateResult.data) {
    const existingId = (duplicateResult.data as { id: string }).id;
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

  const { error: updateError } = await supabase
    .from("projects")
    .update({
      status: "submitted",
      po_number: poNumber,
      site_address: siteAddress,
      delivery_recipient_email: deliveryEmail,
      expected_delivery_date: expectedDeliveryDate,
      extracted_fields: extractedFields,
    })
    .eq("id", projectId)
    .eq("org_id", orgId)
    .eq("submitted_by", actor.id);

  if (updateError) return { error: `Failed to submit project: ${updateError.message}` };

  try {
    await notify({
      recipientId: actor.id,
      type: "acknowledgement",
      message: `Your report request for ${siteAddress ?? "your property"} has been received and is being processed.`,
      projectId,
      emailSubject: "Report request received — OPS",
      emailHtml: submissionConfirmationEmail({ poNumber }),
    });
  } catch (err) {
    console.error("[submitProject] client notify failed:", err);
  }

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
        }).catch((err) =>
          console.error("[submitProject] admin notify failed:", err)
        )
      )
    );
  } catch (err) {
    console.error("[submitProject] admin notify setup failed:", err);
  }

  await auditLog("project.submitted", actor.id, actor.email as string, {
    orgId,
    projectId,
    metadata: { poNumber, templateId },
  });

  revalidatePath("/portal");
  revalidatePath(`/portal/projects/${projectId}`);
  redirect(`/portal/projects/${projectId}`);
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
