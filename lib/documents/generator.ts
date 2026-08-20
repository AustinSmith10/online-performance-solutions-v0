import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatAddress } from "@/lib/documents/formatters";
import {
  recordRevisionEvent,
  getRevisionHistory,
  formatRevisionHistoryRows,
  peekNextRevNumber,
  type RevisionHistoryRow,
} from "@/lib/documents/revision-history";
import { buildPbdbFilename } from "@/lib/documents/naming";
import { writeProgress, PROGRESS_MILESTONES } from "@/lib/documents/progress";

/**
 * Runs docxtemplater find-and-replace on the project's active template .docx,
 * stores the result in the `documents` bucket, and records it in `project_files`.
 *
 * Must only be called after `projects.project_number` has been set.
 */
export async function generatePbdb(projectId: string, actorId: string): Promise<void> {
  const supabase = createAdminClient();
  await writeProgress(supabase, projectId, PROGRESS_MILESTONES[0]); // 20

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select(
      "id, client_id, template_id, project_number, extracted_fields, created_at, review_cycle, submitted_by, assigned_consultant_id"
    )
    .eq("id", projectId)
    .is("deleted_at", null)
    .single();

  if (projectError || !project) throw new Error("Project not found");
  if (!project.project_number) throw new Error("Project number must be set before generating PBDB");
  if (!project.template_id) throw new Error("No template assigned to this project");

  const [{ data: template, error: templateError }, { data: orgData }, { data: submitter }, { data: tokenLinkRows }] =
    await Promise.all([
      supabase
        .from("templates")
        .select("id, storage_path, name")
        .eq("id", project.template_id as string)
        .eq("status", "active")
        .single(),
      supabase
        .from("clients")
        .select("client_config")
        .eq("id", project.client_id as string)
        .single(),
      supabase
        .from("users")
        .select("first_name, last_name")
        .eq("id", project.submitted_by as string)
        .maybeSingle(),
      supabase
        .from("client_config_token_links")
        .select("token, field, stakeholders(name, email, company)")
        .eq("client_id", project.client_id as string),
    ]);

  if (templateError || !template) {
    throw new Error("No active template found — template may be inactive or missing");
  }

  await writeProgress(supabase, projectId, PROGRESS_MILESTONES[1]); // 40

  const { data: templateBlob, error: downloadError } = await supabase.storage
    .from("templates")
    .download(template.storage_path as string);

  if (downloadError || !templateBlob) {
    throw new Error(`Failed to download template: ${downloadError?.message ?? "unknown error"}`);
  }

  const templateBuffer = Buffer.from(await templateBlob.arrayBuffer());

  // Determine next version (1 on first generation, N+1 on QA re-upload)
  const { data: existingPbdbs } = await supabase
    .from("project_files")
    .select("version")
    .eq("project_id", projectId)
    .eq("file_type", "pbdb")
    .order("version", { ascending: false })
    .limit(1);

  const version =
    existingPbdbs && existingPbdbs.length > 0
      ? (existingPbdbs[0].version as number) + 1
      : 1;

  // The revision_history row is only created on the true first-ever
  // generation — a regenerate (version > 1, still pre-dispatch) does not
  // create a new row. Post-dispatch revisions are recorded separately, at
  // rejection time (see app/actions/approval.ts / app/actions/stakeholders.ts).
  //
  // The row must not actually be *inserted* until the PBDB file has been
  // uploaded and the project_files row committed (see the end of this
  // function) — inserting it here, before that can fail, left an orphaned
  // "initial" row on a failed upload/insert that a retry would duplicate
  // (#148). But the rendered document still needs to show this pending
  // event in its revision-history table and use its rev number for
  // SYS_REV_NO, so peek the number/row it would get without writing it yet.
  const pendingInitialEvent: RevisionHistoryRow | null =
    version === 1
      ? {
          rev_number: await peekNextRevNumber(supabase, projectId, "pbdb"),
          doc_type: "pbdb",
          event: "initial",
          prepared_by: (project.assigned_consultant_id as string | null) ?? null,
          created_at: new Date().toISOString(),
        }
      : null;

  const fullHistory = await getRevisionHistory(supabase, projectId);
  const pbdbHistory = fullHistory.filter((row) => row.doc_type === "pbdb");
  if (pendingInitialEvent) pbdbHistory.push(pendingInitialEvent);

  // This is the PBDB document, so its table shows only PBDB rows — PBDR
  // gets its own independently-scoped table (see lib/documents/delivery.ts).
  const revisionHistoryForDoc = await formatRevisionHistoryRows(supabase, pbdbHistory);

  const pbdbRevision = pbdbHistory.reduce((max, h) => Math.max(max, h.rev_number), 0);

  // Build substitution context
  const extractedFields = (project.extracted_fields as Record<string, string>) ?? {};

  // ORG_ tokens: prefer value confirmed by client during submission, fall back to client_config
  const orgConfig = ((orgData?.client_config ?? {}) as Record<string, string>);
  const orgValues: Record<string, string> = {};
  for (const [k, v] of Object.entries(orgConfig)) {
    if (k.startsWith("ORG_") && !extractedFields[k]) {
      orgValues[k] = v;
    }
  }

  // Tokens explicitly linked to a roster (third-party stakeholder) entry pull
  // the live value from that entry instead of the static client_config
  // string, so editing the roster once keeps the document in sync. Still
  // yields to a client-confirmed override, same as plain org config above.
  for (const row of tokenLinkRows ?? []) {
    const token = row.token as string;
    if (extractedFields[token]) continue;
    const linked = row.stakeholders as
      | { name: string; email: string; company: string | null }
      | { name: string; email: string; company: string | null }[]
      | null;
    const entry = Array.isArray(linked) ? linked[0] : linked;
    if (!entry) continue;
    const field = row.field as "name" | "email" | "company";
    const value = entry[field];
    if (value) orgValues[token] = value;
  }

  const genDate = new Date();
  const subDate = new Date(project.created_at as string);

  // All dates in the document use DD/MM/YYYY
  const fmtDate = (d: Date) => {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${d.getFullYear()}`;
  };

  // R[n] now derives from revision_history's PBDB counter (#108/#109),
  // replacing the old review_cycle-based calculation.
  const revision = pbdbRevision;

  const submitterName = [
    (submitter?.first_name as string | null) ?? "",
    (submitter?.last_name as string | null) ?? "",
  ].filter(Boolean).join(" ");

  const context: Record<string, unknown> = {
    ...orgValues,
    ...extractedFields,
    // PROJECT_NO includes the -S suffix per naming convention
    PROJECT_NO: `${project.project_number as string}-S`,
    SYS_GEN_DATE: fmtDate(genDate),
    SYS_SUB_DATE: fmtDate(subDate),
    SYS_REV_NO: String(revision),
    SYS_USER_NAME: submitterName,
    // Full growing revision-history table, for a docxtemplater loop
    // ({#SYS_REVISION_HISTORY}...{/SYS_REVISION_HISTORY}) instead of a single
    // token. Named with the SYS_ prefix (like SYS_REV_NO etc.) so the
    // template-upload token scanner (lib/documents/validator.ts) classifies
    // and tracks the loop itself via the normal token-registry pipeline —
    // it just needs a display label, no extraction hint, same as any other
    // system-auto-filled token. Its five per-row fields (DOC_TYPE,
    // REV_NUMBER, EVENT, PREPARED_BY, DATE) are loop-scoped and deliberately
    // excluded from that registry — see validator.ts's loop-depth tracking.
    SYS_REVISION_HISTORY: revisionHistoryForDoc,
  };

  // Run docxtemplater — nullGetter returns "" for any token missing from context
  const zip = new PizZip(templateBuffer);
  let doc: Docxtemplater;
  try {
    doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter() {
        return "";
      },
    });
    doc.render(context);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Template rendering failed: ${msg}`);
  }

  const outputBuffer = doc.getZip().generate({ type: "nodebuffer" }) as Buffer;

  await writeProgress(supabase, projectId, PROGRESS_MILESTONES[2]); // 70

  // Filename: {projectNumber}-S PBDB Rev{n} {address} {date} For QA.docx
  const rawAddress = (extractedFields["EXTRACT_ADDRESS"] ?? "").trim();
  const address = formatAddress(rawAddress);
  const filename = buildPbdbFilename(
    (project.project_number as string) ?? projectId.slice(0, 8),
    revision,
    address,
    genDate,
    { forQa: true }
  );

  // Regenerating on the same day with an unchanged revision produces an identical
  // filename — prefix the storage object with the version counter to guarantee a
  // unique path while keeping original_filename (the download name) canonical.
  const storagePath = `${project.client_id as string}/${projectId}/pbdb/v${version}_${filename}`;

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storagePath, outputBuffer, {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

  if (uploadError) throw new Error(`Failed to store generated PBDB: ${uploadError.message}`);

  await writeProgress(supabase, projectId, PROGRESS_MILESTONES[3]); // 90

  const { error: insertError } = await supabase.from("project_files").insert({
    project_id: projectId,
    file_type: "pbdb",
    storage_path: storagePath,
    original_filename: filename,
    uploaded_by: actorId,
    version,
    review_cycle: (project.review_cycle as number) ?? 1,
  });

  if (insertError) {
    // Clean up the uploaded file if the DB record can't be written
    await supabase.storage.from("documents").remove([storagePath]);
    throw new Error(`Failed to record PBDB in database: ${insertError.message}`);
  }

  // Only now that the file is durably recorded do we commit the "initial"
  // revision-history row itself — writing it earlier (before the upload/insert
  // could fail) let a failed generation leave an orphan row that a retry
  // would then duplicate (#148).
  if (pendingInitialEvent) {
    await recordRevisionEvent(supabase, projectId, "pbdb", "initial");
  }

  await writeProgress(supabase, projectId, PROGRESS_MILESTONES[4]); // 100
}

