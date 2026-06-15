"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { auditLog } from "@/lib/audit/log";
import { notify } from "@/lib/notifications/notify";
import { extractDocumentFields, type ExtractionResult } from "@/lib/documents/extractor";

export interface Development {
  dev_name: string;
  trustee_entity: string;
}

// ─── Step 1: upload + extract ───────────────────────────────────────────────

export type ExtractState =
  | { step: 1; error?: string }
  | {
      step: 2;
      error?: string;
      extracted: ExtractionResult;
      poPath: string;
      plansPath: string;
      templateId: string;
      orgConfig: Record<string, string>;
      developments: Development[];
    };

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

  if (!poFile || poFile.size === 0) return { step: 1, error: "Purchase order document is required." };
  if (!plansFile || plansFile.size === 0) return { step: 1, error: "Building plans document is required." };
  if (poFile.size > 50 * 1024 * 1024) return { step: 1, error: "Purchase order must be under 50 MB." };
  if (plansFile.size > 50 * 1024 * 1024) return { step: 1, error: "Building plans must be under 50 MB." };

  const orgId = actor.org_id as string;
  const submissionId = crypto.randomUUID();

  const poBuffer = Buffer.from(await poFile.arrayBuffer());
  const plansBuffer = Buffer.from(await plansFile.arrayBuffer());

  const poPath = `${orgId}/${submissionId}/po/${poFile.name}`;
  const plansPath = `${orgId}/${submissionId}/plans/${plansFile.name}`;

  const [poUpload, plansUpload] = await Promise.all([
    supabase.storage.from("submissions").upload(poPath, poBuffer, { contentType: poFile.type || "application/pdf" }),
    supabase.storage.from("submissions").upload(plansPath, plansBuffer, { contentType: plansFile.type || "application/pdf" }),
  ]);

  if (poUpload.error) return { step: 1, error: `Failed to upload PO: ${poUpload.error.message}` };
  if (plansUpload.error) {
    await supabase.storage.from("submissions").remove([poPath]);
    return { step: 1, error: `Failed to upload plans: ${plansUpload.error.message}` };
  }

  // Run extraction + fetch org config + fetch developments in parallel
  let extracted: ExtractionResult;
  let orgConfig: Record<string, string> = {};
  let developments: Development[] = [];

  try {
    const [extractionResult, orgResult, devsResult] = await Promise.all([
      extractDocumentFields(poBuffer, plansBuffer),
      supabase.from("organisations").select("org_config").eq("id", orgId).single(),
      supabase.from("halcyon_developments").select("dev_name, trustee_entity").order("dev_name"),
    ]);

    extracted = extractionResult;
    orgConfig = (orgResult.data?.org_config ?? {}) as Record<string, string>;
    developments = (devsResult.data ?? []) as Development[];
  } catch (err) {
    await supabase.storage.from("submissions").remove([poPath, plansPath]);
    console.error("[extractFields] extraction failed:", err);
    return { step: 1, error: "Document extraction failed. Please check that your files are valid PDFs and try again." };
  }

  return { step: 2, extracted, poPath, plansPath, templateId, orgConfig, developments };
}

// ─── Step 2: submit project ─────────────────────────────────────────────────

export type SubmitState = { error?: string };

export async function submitProject(
  _prev: SubmitState,
  formData: FormData
): Promise<SubmitState> {
  const actor = await requireRole("client");
  const supabase = createAdminClient();

  const orgId = actor.org_id as string;

  const templateId = (formData.get("template_id") as string | null)?.trim();
  const poPath = (formData.get("po_path") as string | null)?.trim();
  const plansPath = (formData.get("plans_path") as string | null)?.trim();
  const poOriginalName = (formData.get("po_original_name") as string | null)?.trim() ?? "purchase_order.pdf";
  const plansOriginalName = (formData.get("plans_original_name") as string | null)?.trim() ?? "building_plans.pdf";

  if (!templateId || !poPath || !plansPath) {
    return { error: "Missing required submission data. Please start over." };
  }

  const clientAddress = (formData.get("client_address") as string | null)?.trim();
  const deliveryEmail = (formData.get("delivery_recipient_email") as string | null)?.trim() || null;

  if (!clientAddress) return { error: "Site address is required." };

  const poNumber = (formData.get("extracted_po_number") as string | null)?.trim();
  if (!poNumber) return { error: "PO number could not be determined. Please start over and re-upload your documents." };

  // Build extracted_fields: EXTRACT_ fields the client confirmed/overrode
  const extractedFields: Record<string, string> = {};
  for (const key of ["house_type", "site_wd_no", "floor_wd_no", "roof_wd_no", "draw_date", "dev_name"]) {
    const val = (formData.get(`extracted_${key}`) as string | null)?.trim() ?? "";
    if (val) extractedFields[`EXTRACT_${key.toUpperCase()}`] = val;
  }

  // Trustee confirmed/overridden by client
  const trustee = (formData.get("EXTRACT_TRUSTEE") as string | null)?.trim() ?? "";
  if (trustee) extractedFields["EXTRACT_TRUSTEE"] = trustee;

  // ORG_ fields confirmed/overridden by client
  const orgFields: Record<string, string> = {};
  for (const key of ["ORG_BUILDER_COY", "ORG_CERTIFIER_COY", "ORG_CERTIFIER_NAME"]) {
    const val = (formData.get(key) as string | null)?.trim() ?? "";
    if (val) orgFields[key] = val;
  }

  // Duplicate check: same PO number for this org with an active status
  const { data: existing } = await supabase
    .from("projects")
    .select("id, status")
    .eq("org_id", orgId)
    .eq("po_number", poNumber)
    .not("status", "in", '("delivered","complete")');

  if (existing && existing.length > 0) {
    try {
      const { data: admins } = await supabase.from("users").select("id").eq("role", "super_admin");
      await Promise.all(
        (admins ?? []).map((admin: { id: string }) =>
          notify({
            recipientId: admin.id,
            type: "project_submitted",
            message: `Duplicate submission attempt: PO ${poNumber} already has an active project for org ${orgId}. No new record was created.`,
            emailSubject: "Duplicate submission attempt — OPS",
            emailHtml: duplicateSubmissionEmail({ poNumber, orgId }),
          }).catch((err) => console.error("[submitProject] duplicate admin notify failed:", err))
        )
      );
    } catch (err) {
      console.error("[submitProject] duplicate notify setup failed:", err);
    }
    return { error: `A project with PO number ${poNumber} is already active for your organisation. Your account manager has been notified.` };
  }

  const projectId = crypto.randomUUID();
  const { error: insertError } = await supabase.from("projects").insert({
    id: projectId,
    org_id: orgId,
    template_id: templateId,
    submitted_by: actor.id,
    status: "submitted",
    po_number: poNumber,
    delivery_recipient_email: deliveryEmail,
    extracted_fields: {
      CLIENT_ADDRESS: clientAddress,
      ...extractedFields,
      ...orgFields,
    },
  });

  if (insertError) return { error: `Failed to create project: ${insertError.message}` };

  const { error: filesError } = await supabase.from("project_files").insert([
    { project_id: projectId, file_type: "po", storage_path: poPath, original_filename: poOriginalName, uploaded_by: actor.id },
    { project_id: projectId, file_type: "building_plans", storage_path: plansPath, original_filename: plansOriginalName, uploaded_by: actor.id },
  ]);

  if (filesError) {
    console.error("[submitProject] project_files insert error:", filesError);
  }

  try {
    await notify({
      recipientId: actor.id,
      type: "acknowledgement",
      message: `Your report request (PO: ${poNumber}) has been received and is being processed.`,
      projectId,
      emailSubject: "Report request received — OPS",
      emailHtml: submissionConfirmationEmail({ poNumber }),
    });
  } catch (err) {
    console.error("[submitProject] client notify failed:", err);
  }

  try {
    const { data: admins } = await supabase.from("users").select("id").eq("role", "super_admin");
    await Promise.all(
      (admins ?? []).map((admin: { id: string }) =>
        notify({
          recipientId: admin.id,
          type: "project_submitted",
          message: `New project submission received (PO: ${poNumber}) from org ${orgId}.`,
          projectId,
          emailSubject: "New project submission — OPS",
          emailHtml: adminSubmissionEmail({ poNumber, projectId }),
        }).catch((err) => console.error("[submitProject] admin notify failed:", err))
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
  redirect("/portal");
}

// ─── Email templates ─────────────────────────────────────────────────────────

function submissionConfirmationEmail({ poNumber }: { poNumber: string }) {
  return `<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; color: #18181b; max-width: 560px; margin: 0 auto; padding: 24px;">
  <h2 style="font-size: 18px; font-weight: 600; margin-bottom: 8px;">Report request received</h2>
  <p style="color: #52525b; margin-bottom: 16px;">
    Thank you — your report request for PO <strong>${escHtml(poNumber)}</strong> has been received and is being processed.
  </p>
  <p style="color: #52525b; margin-bottom: 16px;">
    You will be notified once your report is ready. If you have any questions, please contact your account manager.
  </p>
  <p style="color: #a1a1aa; font-size: 13px;">OPS — Online Performance Solution</p>
</body>
</html>`;
}

function duplicateSubmissionEmail({ poNumber, orgId }: { poNumber: string; orgId: string }) {
  return `<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; color: #18181b; max-width: 560px; margin: 0 auto; padding: 24px;">
  <h2 style="font-size: 18px; font-weight: 600; margin-bottom: 8px;">Duplicate submission attempt</h2>
  <p style="color: #52525b; margin-bottom: 16px;">
    A client from organisation <code>${escHtml(orgId)}</code> attempted to submit a project with PO number
    <strong>${escHtml(poNumber)}</strong>, which already has an active project record. No new record was created.
  </p>
  <p style="color: #52525b; margin-bottom: 16px;">
    Please review and make a final call on whether a new record is required.
  </p>
  <p style="color: #a1a1aa; font-size: 13px;">OPS — Online Performance Solution</p>
</body>
</html>`;
}

function adminSubmissionEmail({ poNumber, projectId }: { poNumber: string; projectId: string }) {
  return `<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; color: #18181b; max-width: 560px; margin: 0 auto; padding: 24px;">
  <h2 style="font-size: 18px; font-weight: 600; margin-bottom: 8px;">New project submission</h2>
  <p style="color: #52525b; margin-bottom: 16px;">
    A new project has been submitted with PO number <strong>${escHtml(poNumber)}</strong>.
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
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
