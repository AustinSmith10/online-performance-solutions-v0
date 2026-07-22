/**
 * One-off: trigger PBDR conversion and delivery for a project.
 * Uses soffice (LibreOffice) directly instead of Gotenberg — no Docker needed.
 * Usage: npx tsx --env-file .env.local scripts/deliver-pbdr.ts <projectId>
 */
import { execFileSync, spawnSync } from "child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPbdrGate } from "@/lib/payments/gate";
import { convertPbdbToPbdr } from "@/lib/documents/converter";
import { stripRedTokenColor } from "@/lib/documents/color-strip";
import { buildPbdrFilename } from "@/lib/documents/naming";
import { formatAddress } from "@/lib/documents/formatters";
import { auditLog } from "@/lib/audit/log";
import { notify } from "@/lib/notifications/notify";
import { sendEmail } from "@/lib/email/sender";
import { renderPbdrDeliveryEmail } from "@/lib/email/templates/PBDRDeliveryEmail";

function findSoffice(): string {
  const candidates = [
    "/Applications/LibreOffice.app/Contents/MacOS/soffice",
    "/opt/homebrew/bin/soffice",
    "soffice",
  ];
  for (const c of candidates) {
    try {
      execFileSync(c, ["--version"], { stdio: "pipe" });
      return c;
    } catch {
      // try next
    }
  }
  throw new Error("LibreOffice (soffice) not found. Install it via: brew install --cask libreoffice");
}

async function convertDocxToPdfLocal(docxBuffer: Buffer): Promise<Buffer> {
  const soffice = findSoffice();
  const dir = mkdtempSync(join(tmpdir(), "pbdr-"));
  const inPath = join(dir, "document.docx");
  const outPath = join(dir, "document.pdf");
  try {
    writeFileSync(inPath, docxBuffer);
    const result = spawnSync(
      soffice,
      ["--headless", "--convert-to", "pdf", "--outdir", dir, inPath],
      { timeout: 60_000 }
    );
    if (result.status !== 0) {
      throw new Error(`soffice exited ${result.status}: ${result.stderr?.toString()}`);
    }
    return readFileSync(outPath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const projectId = process.argv[2];
  if (!projectId) {
    console.error("Usage: npx tsx --env-file .env.local scripts/deliver-pbdr.ts <projectId>");
    process.exit(1);
  }

  const supabase = createAdminClient();

  // Resolve a super admin to use as file uploader
  const { data: admins } = await supabase.from("users").select("id, email").eq("role", "super_admin").limit(1);
  const admin = admins?.[0] as { id: string; email: string } | undefined;
  if (!admin) { console.error("No super admin found."); process.exit(1); }

  // Load project
  const { data: project } = await supabase
    .from("projects")
    .select("id, org_id, status, project_number, extracted_fields, delivery_recipient_email, submitted_by, strip_token_color")
    .eq("id", projectId)
    .is("deleted_at", null)
    .single();

  if (!project) { console.error("Project not found."); process.exit(1); }
  if ((project.status as string) !== "dispatched") {
    console.error(`Project is in '${project.status}' status — expected 'dispatched'.`);
    process.exit(1);
  }

  // Gate check
  const gate = await checkPbdrGate(projectId);
  if (!gate.allowed) {
    console.error("Gate blocked:", !gate.creditDeducted ? "credit not deducted" : "stakeholders still pending");
    process.exit(1);
  }

  // Claim project
  const conversionStart = new Date();
  const { count } = await supabase
    .from("projects")
    .update({ status: "converting", updated_at: conversionStart.toISOString() }, { count: "exact" })
    .eq("id", projectId)
    .eq("status", "dispatched");

  if (!count) { console.error("Already converting or status changed."); process.exit(1); }
  console.log("[deliver-pbdr] status → converting");

  let pdfStoragePath: string | null = null;

  try {
    // Download QA'd PBDB
    const { data: pbdbFile } = await supabase
      .from("project_files")
      .select("storage_path, version")
      .eq("project_id", projectId)
      .eq("file_type", "pbdb")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!pbdbFile) throw new Error("QA'd PBDB not found");
    console.log(`[deliver-pbdr] downloading PBDB v${pbdbFile.version}…`);

    const { data: blob } = await supabase.storage.from("documents").download(pbdbFile.storage_path as string);
    if (!blob) throw new Error("Failed to download PBDB");

    const pbdbBuffer = Buffer.from(await blob.arrayBuffer());

    // Transform DOCX
    console.log("[deliver-pbdr] applying PBDB→PBDR transformations…");
    let transformedDocx = convertPbdbToPbdr(pbdbBuffer);
    if (project.strip_token_color as boolean) {
      transformedDocx = stripRedTokenColor(transformedDocx);
    }

    // Convert to PDF via soffice
    console.log("[deliver-pbdr] converting to PDF via LibreOffice…");
    const pdfBuffer = await convertDocxToPdfLocal(transformedDocx);
    console.log(`[deliver-pbdr] PDF generated (${(pdfBuffer.length / 1024).toFixed(0)} KB)`);

    // Build filename
    const rawAddress = (project.extracted_fields as Record<string, string> | null)?.["EXTRACT_ADDRESS"] ?? "";
    const address = formatAddress(rawAddress);
    const { data: existingPbdrs } = await supabase
      .from("project_files").select("id").eq("project_id", projectId).eq("file_type", "pbdr");
    const revisionIndex = (existingPbdrs ?? []).length;
    const pbdrFilename = buildPbdrFilename(
      (project.project_number as string | null) ?? projectId.slice(0, 8),
      revisionIndex,
      address,
      conversionStart
    );
    pdfStoragePath = `${project.org_id as string}/${projectId}/pbdr/${pbdrFilename}`;
    console.log(`[deliver-pbdr] uploading as ${pbdrFilename}…`);

    // Upload
    const { error: uploadErr } = await supabase.storage
      .from("documents")
      .upload(pdfStoragePath, pdfBuffer, { contentType: "application/pdf" });
    if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

    // Record file
    const { error: insertErr } = await supabase.from("project_files").insert({
      project_id: projectId,
      file_type: "pbdr",
      storage_path: pdfStoragePath,
      original_filename: pbdrFilename,
      uploaded_by: admin.id,
      version: revisionIndex + 1,
    });
    if (insertErr) throw new Error(`project_files insert failed: ${insertErr.message}`);

    // Signed URL for emails
    const { data: signed } = await supabase.storage
      .from("documents")
      .createSignedUrl(pdfStoragePath, 30 * 24 * 3600);
    const downloadUrl = signed?.signedUrl ?? null;
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000).toLocaleDateString("en-AU", {
      day: "numeric", month: "long", year: "numeric",
    });

    // Deliver to submitter
    const { data: submitter } = await supabase
      .from("users").select("id, email, first_name, last_name")
      .eq("id", project.submitted_by as string).maybeSingle();

    if (submitter && downloadUrl) {
      const name = [(submitter.first_name as string | null), (submitter.last_name as string | null)]
        .filter(Boolean).join(" ") || (submitter.email as string);
      console.log(`[deliver-pbdr] notifying submitter ${submitter.email}…`);
      await notify({
        recipientId: submitter.id as string,
        type: "pbdr_delivery",
        message: `Your PBDR for project ${projectId.slice(0, 8)} has been delivered.`,
        projectId,
        emailSubject: `Your Performance Report is ready — ${projectId.slice(0, 8)}`,
        emailHtml: renderPbdrDeliveryEmail({ recipientName: name, projectId: projectId.slice(0, 8), downloadUrl, expiresAt }),
      }).catch((err) => console.warn("[deliver-pbdr] submitter notify failed:", err));
    }

    // Optional extra recipient
    const recipientEmail = project.delivery_recipient_email as string | null;
    if (recipientEmail && downloadUrl) {
      const submitterEmail = (submitter?.email as string | null)?.toLowerCase();
      if (recipientEmail.toLowerCase() !== submitterEmail) {
        console.log(`[deliver-pbdr] sending to delivery_recipient ${recipientEmail}…`);
        await sendEmail({
          to: recipientEmail,
          subject: `Your Performance Report is ready — ${projectId.slice(0, 8)}`,
          html: renderPbdrDeliveryEmail({ recipientName: recipientEmail, projectId: projectId.slice(0, 8), downloadUrl, expiresAt }),
          source: "script_deliver_pbdr",
          projectId,
        }).catch((err) => console.warn("[deliver-pbdr] delivery_recipient email failed:", err));
      }
    }

    const conversionEnd = new Date();
    await supabase.from("projects").update({
      status: "delivered",
      delivered_at: conversionEnd.toISOString(),
      updated_at: conversionEnd.toISOString(),
    }).eq("id", projectId);

    await auditLog("pbdr.delivered", admin.id, admin.email, {
      projectId,
      orgId: project.org_id as string,
      metadata: {
        pbdb_version: pbdbFile.version,
        pbdr_version: revisionIndex + 1,
        pbdr_filename: pbdrFilename,
        conversion_start: conversionStart.toISOString(),
        conversion_end: conversionEnd.toISOString(),
        triggered_by: "script",
        outcome: "success",
      },
    });

    console.log("[deliver-pbdr] done — project marked complete.");
    if (downloadUrl) console.log(`[deliver-pbdr] download URL: ${downloadUrl}`);
  } catch (err) {
    if (pdfStoragePath) {
      await supabase.storage.from("documents").remove([pdfStoragePath]).catch(() => {});
    }
    await supabase.from("projects").update({ status: "dispatched", updated_at: new Date().toISOString() }).eq("id", projectId);
    console.error("[deliver-pbdr] failed — status reset to dispatched:", err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[deliver-pbdr] fatal:", err);
  process.exit(1);
});
