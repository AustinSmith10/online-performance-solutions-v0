import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatAddress } from "@/lib/documents/formatters";
import { recordRevisionEvent, getRevisionHistory } from "@/lib/documents/revision-history";
import { buildPbdbFilename } from "@/lib/documents/naming";

/**
 * Runs docxtemplater find-and-replace on the project's active template .docx,
 * stores the result in the `documents` bucket, and records it in `project_files`.
 *
 * Must only be called after `projects.project_number` has been set.
 */
export async function generatePbdb(projectId: string, actorId: string): Promise<void> {
  const supabase = createAdminClient();

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, client_id, template_id, project_number, extracted_fields, created_at, review_cycle, submitted_by")
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
  if (version === 1) {
    await recordRevisionEvent(supabase, projectId, "pbdb", "initial");
  }

  const [revisionHistory, preparedByUsers] = await (async () => {
    const history = await getRevisionHistory(supabase, projectId);
    const ids = [...new Set(history.map((h) => h.prepared_by).filter((x): x is string => !!x))];
    const { data: users } = ids.length
      ? await supabase.from("users").select("id, first_name, last_name").in("id", ids)
      : { data: [] as { id: string; first_name: string | null; last_name: string | null }[] };
    return [history, users ?? []] as const;
  })();

  const preparedByNameById = new Map(
    preparedByUsers.map((u) => [
      u.id as string,
      [u.first_name as string | null, u.last_name as string | null].filter(Boolean).join(" "),
    ])
  );

  const EVENT_LABELS: Record<string, string> = {
    initial: "Initial",
    rejected: "Revision",
    approved_conversion: "Approved — Converted",
  };

  const revisionHistoryForDoc = revisionHistory.map((row) => ({
    DOC_TYPE: row.doc_type.toUpperCase(),
    REV_NUMBER: String(row.rev_number),
    EVENT: EVENT_LABELS[row.event] ?? row.event,
    PREPARED_BY: row.prepared_by ? (preparedByNameById.get(row.prepared_by) ?? "") : "",
    DATE: new Date(row.created_at).toLocaleDateString("en-AU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }),
  }));

  const pbdbRevision = revisionHistory
    .filter((h) => h.doc_type === "pbdb")
    .reduce((max, h) => Math.max(max, h.rev_number), 0);

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
    // ({#REVISION_HISTORY}...{/REVISION_HISTORY}) instead of a single token.
    REVISION_HISTORY: revisionHistoryForDoc,
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
}

