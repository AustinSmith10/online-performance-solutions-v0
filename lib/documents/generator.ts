import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatAddress } from "@/lib/documents/formatters";

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
    .select("id, org_id, template_id, project_number, extracted_fields, created_at")
    .eq("id", projectId)
    .is("deleted_at", null)
    .single();

  if (projectError || !project) throw new Error("Project not found");
  if (!project.project_number) throw new Error("Project number must be set before generating PBDB");
  if (!project.template_id) throw new Error("No template assigned to this project");

  const [{ data: template, error: templateError }, { data: orgData }] = await Promise.all([
    supabase
      .from("templates")
      .select("id, storage_path, name")
      .eq("id", project.template_id as string)
      .eq("status", "active")
      .single(),
    supabase
      .from("organisations")
      .select("org_config")
      .eq("id", project.org_id as string)
      .single(),
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

  // Build substitution context
  const extractedFields = (project.extracted_fields as Record<string, string>) ?? {};

  // ORG_ tokens: prefer value confirmed by client during submission, fall back to org_config
  const orgConfig = ((orgData?.org_config ?? {}) as Record<string, string>);
  const orgValues: Record<string, string> = {};
  for (const [k, v] of Object.entries(orgConfig)) {
    if (k.startsWith("ORG_") && !extractedFields[k]) {
      orgValues[k] = v;
    }
  }

  const genDate = new Date();
  const subDate = new Date(project.created_at as string);

  // All dates in the document use DD/MM/YYYY
  const fmtDate = (d: Date) => {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${d.getFullYear()}`;
  };

  // Revision is 0-indexed in both the document and filename (R0, R1, R2…)
  const revision = version - 1;

  const context: Record<string, string> = {
    ...orgValues,
    ...extractedFields,
    // PROJECT_NO includes the -S suffix per naming convention
    PROJECT_NO: `${project.project_number as string}-S`,
    SYS_GEN_DATE: fmtDate(genDate),
    SYS_SUB_DATE: fmtDate(subDate),
    SYS_REV_NO: String(revision),
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

  // Filename: {projectNumber}-S PBDB R{n} {address} {yyyy mm dd}.docx
  const rawAddress = (extractedFields["EXTRACT_ADDRESS"] ?? "").trim();
  const address = formatAddress(rawAddress);
  const genYyyy = genDate.getFullYear();
  const genMm = String(genDate.getMonth() + 1).padStart(2, "0");
  const genDd = String(genDate.getDate()).padStart(2, "0");
  const filename = [
    `${project.project_number as string}-S PBDB R${revision}`,
    address,
    `${genYyyy} ${genMm} ${genDd}`,
  ]
    .filter(Boolean)
    .join(" ") + ".docx";

  const storagePath = `${project.org_id as string}/${projectId}/pbdb/${filename}`;

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
  });

  if (insertError) {
    // Clean up the uploaded file if the DB record can't be written
    await supabase.storage.from("documents").remove([storagePath]);
    throw new Error(`Failed to record PBDB in database: ${insertError.message}`);
  }
}

