"use server";

// Per-file real-time pipeline (#115): each stakeholder upload is verified
// and (when applicable) extracted the instant it lands, rather than batched
// at "Continue" as in the old flow (see finalizeSubmission in
// app/actions/submission.ts, now a Continue-time-only merge over these
// per-file results). Kept as its own file rather than folding into the
// already-931-line submission.ts.
//
// These orchestrator actions are intentionally thin/untested, matching the
// existing convention for DB+storage+network-heavy "use server" actions in
// this codebase (uploadQaPbdb, finalizeSubmission) — their value is tested
// through the pure/mockable pieces they call (mergeExtractionResults,
// verifyUploadAgainstRequirement, assembleAndPersistDraftFields).

import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { resolveOrgId, loadFileRequirements, loadExtractTokens, makeSampleTextLoader } from "@/lib/documents/submission-shared";
import type { UploadManifestItem } from "@/app/actions/submission";
import { verifyUploadAgainstRequirement } from "@/lib/documents/file-requirement-verification";
import { extractSingleDocument, type SingleDocExtraction } from "@/lib/documents/extractor";
import { getJudgeDocumentTextCharCap } from "@/lib/settings/judge-document-text-cap";

type ExtractionStatus = "not_applicable" | "pending" | "running" | "completed" | "failed";

async function actorContext(adminOrgId: string | null, adminClientId: string | null) {
  const actor = await requireRole("stakeholder", "consultant", "super_admin", "admin");
  const isAdmin = actor.role === "super_admin" || actor.role === "admin";
  const actsOnBehalf = isAdmin || actor.role === "consultant";
  const orgId = resolveOrgId(actor, actsOnBehalf, adminOrgId);
  const submittedBy = actsOnBehalf ? (adminClientId as string) : (actor.id as string);
  return { actor, orgId, submittedBy };
}

// Idempotent — every per-file orchestrator call ensures the draft exists
// rather than requiring a single "first" caller to win a race. The client
// generates `projectId` once (crypto.randomUUID()) and reuses it for the
// whole upload session, so there's no ambiguity about which row is "the"
// draft; ON CONFLICT DO NOTHING avoids a check-then-insert TOCTOU gap.
async function ensureDraftProject(
  supabase: ReturnType<typeof createAdminClient>,
  projectId: string,
  templateId: string,
  orgId: string,
  submittedBy: string
): Promise<void> {
  await supabase
    .from("projects")
    .upsert(
      { id: projectId, client_id: orgId, template_id: templateId, submitted_by: submittedBy, status: "draft" },
      { onConflict: "id", ignoreDuplicates: true }
    );
}

async function touchProject(supabase: ReturnType<typeof createAdminClient>, projectId: string): Promise<void> {
  await supabase.from("projects").update({ updated_at: new Date().toISOString() }).eq("id", projectId);
}

// ─── Signed upload URL for a single file ────────────────────────────────────
// Single-file counterpart to requestSubmissionUploadUrls — that one validates
// every required slot is filled, which is wrong for the per-file flow where
// slots fill in one at a time.

export type RequestSingleUploadResult =
  | { error: string }
  | { path: string; signedUrl: string; token: string };

export async function requestSingleUploadUrl(
  projectId: string,
  templateId: string,
  adminOrgId: string | null,
  adminClientId: string | null,
  slug: string,
  item: UploadManifestItem
): Promise<RequestSingleUploadResult> {
  const { orgId, submittedBy } = await actorContext(adminOrgId, adminClientId);
  if (!orgId) return { error: "Client is required." };
  const supabase = createAdminClient();

  if (item.size > 50 * 1024 * 1024) return { error: `"${item.name}" exceeds the 50 MB limit.` };

  await ensureDraftProject(supabase, projectId, templateId, orgId, submittedBy);

  const path = `${orgId}/${projectId}/${slug}/${item.name}`;
  const { data, error } = await supabase.storage.from("submissions").createSignedUploadUrl(path);
  if (error || !data) return { error: "Failed to prepare upload. Please try again." };

  return { path, signedUrl: data.signedUrl, token: data.token };
}

// ─── Per-file pipeline: verify, then extract if applicable ─────────────────

export interface ProcessUploadedFileResult {
  fileId?: string;
  error?: string;
  mismatchReasons?: string[] | null;
  extractionStatus?: ExtractionStatus;
  extractionError?: string | null;
}

async function runExtractionForFile(
  supabase: ReturnType<typeof createAdminClient>,
  fileId: string,
  label: string,
  buffer: Buffer,
  orgId: string,
  templateId: string
): Promise<void> {
  await supabase.from("project_files").update({ extraction_status: "running" as ExtractionStatus }).eq("id", fileId);
  try {
    const { extractTokens } = await loadExtractTokens(supabase, orgId, templateId);
    const singleResult: SingleDocExtraction = await extractSingleDocument({ label, buffer }, extractTokens);
    await supabase
      .from("project_files")
      .update({ extraction_status: "completed" as ExtractionStatus, extraction_result: singleResult, extraction_error: null })
      .eq("id", fileId);
  } catch (err) {
    console.error(`[submission-pipeline] extraction failed for file ${fileId}:`, err);
    await supabase
      .from("project_files")
      .update({
        extraction_status: "failed" as ExtractionStatus,
        extraction_error: err instanceof Error ? err.message : "Extraction failed.",
      })
      .eq("id", fileId);
  }
}

export async function processUploadedFile(
  projectId: string,
  templateId: string,
  adminOrgId: string | null,
  adminClientId: string | null,
  requirementId: string,
  slug: string,
  name: string,
  path: string
): Promise<ProcessUploadedFileResult> {
  const { actor, orgId, submittedBy } = await actorContext(adminOrgId, adminClientId);
  if (!orgId) return { error: "Client is required." };
  const supabase = createAdminClient();

  await ensureDraftProject(supabase, projectId, templateId, orgId, submittedBy);

  const fileReqs = await loadFileRequirements(supabase, templateId);
  const requirement = fileReqs.find((r) => r.id === requirementId);
  if (!requirement) return { error: "Unknown file requirement." };

  const { data: downloaded, error: downloadError } = await supabase.storage.from("submissions").download(path);
  if (downloadError || !downloaded) return { error: `Failed to read "${name}".` };
  const buffer = Buffer.from(await downloaded.arrayBuffer());

  const isPdf = name.toLowerCase().endsWith(".pdf");
  let reasons: string[] = [];
  try {
    const loadSampleText = makeSampleTextLoader(supabase, fileReqs);
    const sampleText = await loadSampleText(requirement.id);
    const docTextCap = await getJudgeDocumentTextCharCap(supabase);
    reasons = await verifyUploadAgainstRequirement(
      {
        name: requirement.name,
        markerTextPatterns: requirement.marker_text_patterns,
        markerPageCountMin: requirement.marker_page_count_min,
        markerPageCountMax: requirement.marker_page_count_max,
        markerRegex: requirement.marker_regex,
        aiJudgeHint: requirement.ai_judge_hint,
      },
      buffer,
      isPdf,
      sampleText,
      docTextCap
    );
  } catch (err) {
    console.error(`[submission-pipeline] verification failed for "${name}", failing open:`, err);
  }

  const clean = reasons.length === 0;
  const extractionStatus: ExtractionStatus = !requirement.extraction ? "not_applicable" : clean ? "running" : "pending";

  const { data: inserted, error: insertError } = await supabase
    .from("project_files")
    .insert({
      project_id: projectId,
      file_type: slug,
      storage_path: path,
      original_filename: name,
      uploaded_by: actor.id,
      verification_mismatch_reasons: clean ? null : reasons,
      verification_completed_at: new Date().toISOString(),
      extraction_status: extractionStatus,
    })
    .select("id")
    .single();

  if (insertError || !inserted) return { error: "Failed to save the uploaded file. Please try again." };
  const fileId = inserted.id as string;

  await touchProject(supabase, projectId);

  if (requirement.extraction && clean) {
    await runExtractionForFile(supabase, fileId, requirement.name, buffer, orgId, templateId);
    await touchProject(supabase, projectId);
    const state = await readBackExtractionState(supabase, fileId);
    return { fileId, mismatchReasons: clean ? null : reasons, ...state };
  }

  return { fileId, mismatchReasons: clean ? null : reasons, extractionStatus };
}

// ─── Stakeholder confirms a flagged file ────────────────────────────────────

export interface FileActionResult {
  error?: string;
  extractionStatus?: ExtractionStatus;
  extractionError?: string | null;
}

export async function confirmFileVerification(fileId: string): Promise<FileActionResult> {
  const actor = await requireRole("stakeholder", "consultant", "super_admin", "admin");
  const supabase = createAdminClient();

  const { data: file, error: fetchErr } = await supabase
    .from("project_files")
    .select("id, project_id, storage_path, original_filename, extraction_status")
    .eq("id", fileId)
    .maybeSingle();
  if (fetchErr || !file) return { error: "File not found." };

  await supabase
    .from("project_files")
    .update({ verification_confirmed_at: new Date().toISOString(), verification_confirmed_by: actor.id })
    .eq("id", fileId);

  // Extraction was withheld pending confirmation (#115: "starts on clean or
  // confirm") — kick it off now that the stakeholder has signed off.
  if (file.extraction_status === "pending") {
    const { data: project } = await supabase
      .from("projects")
      .select("client_id, template_id")
      .eq("id", file.project_id as string)
      .maybeSingle();
    if (project?.template_id) {
      const { data: downloaded } = await supabase.storage
        .from("submissions")
        .download(file.storage_path as string);
      if (downloaded) {
        const buffer = Buffer.from(await downloaded.arrayBuffer());
        await runExtractionForFile(
          supabase,
          fileId,
          file.original_filename as string,
          buffer,
          project.client_id as string,
          project.template_id as string
        );
      }
    }
  }

  await touchProject(supabase, file.project_id as string);
  return readBackExtractionState(supabase, fileId);
}

// ─── Retry a failed extraction ───────────────────────────────────────────────

async function readBackExtractionState(
  supabase: ReturnType<typeof createAdminClient>,
  fileId: string
): Promise<FileActionResult> {
  const { data } = await supabase
    .from("project_files")
    .select("extraction_status, extraction_error")
    .eq("id", fileId)
    .maybeSingle();
  return {
    extractionStatus: (data?.extraction_status as ExtractionStatus | undefined) ?? "not_applicable",
    extractionError: (data?.extraction_error as string | null | undefined) ?? null,
  };
}

export async function retryFileExtraction(fileId: string): Promise<FileActionResult> {
  await requireRole("stakeholder", "consultant", "super_admin", "admin");
  const supabase = createAdminClient();

  const { data: file, error: fetchErr } = await supabase
    .from("project_files")
    .select("id, project_id, storage_path, original_filename")
    .eq("id", fileId)
    .maybeSingle();
  if (fetchErr || !file) return { error: "File not found." };

  const { data: project } = await supabase
    .from("projects")
    .select("client_id, template_id")
    .eq("id", file.project_id as string)
    .maybeSingle();
  if (!project?.template_id) return { error: "Project not found." };

  const { data: downloaded, error: downloadError } = await supabase.storage
    .from("submissions")
    .download(file.storage_path as string);
  if (downloadError || !downloaded) return { error: "Failed to read the file for retry." };

  const buffer = Buffer.from(await downloaded.arrayBuffer());
  await runExtractionForFile(
    supabase,
    fileId,
    file.original_filename as string,
    buffer,
    project.client_id as string,
    project.template_id as string
  );
  await touchProject(supabase, file.project_id as string);
  return readBackExtractionState(supabase, fileId);
}

// ─── Remove an uploaded file (also covers "replace": remove, then re-upload) ─

export async function removeUploadedFile(fileId: string): Promise<{ error?: string }> {
  await requireRole("stakeholder", "consultant", "super_admin", "admin");
  const supabase = createAdminClient();

  const { data: file, error: fetchErr } = await supabase
    .from("project_files")
    .select("id, project_id, storage_path")
    .eq("id", fileId)
    .maybeSingle();
  if (fetchErr || !file) return { error: "File not found." };

  await supabase.storage.from("submissions").remove([file.storage_path as string]);
  await supabase.from("project_files").delete().eq("id", fileId);
  await touchProject(supabase, file.project_id as string);
  return {};
}

// ─── Lightweight status poll ────────────────────────────────────────────────
// Server action via createAdminClient (service role), like every other
// action in this codebase — sidesteps the RLS-visibility gaps across roles
// (stakeholder / consultant-on-behalf / admin-on-behalf) that would apply to
// a client-side Realtime subscription (see RealtimeRefresh.tsx's fallback
// poll for the same class of problem).

export interface PipelineFileStatus {
  fileId: string;
  requirementId: string;
  slug: string;
  name: string;
  verificationCompleted: boolean;
  mismatchReasons: string[] | null;
  confirmed: boolean;
  extractionStatus: ExtractionStatus;
  extractionError: string | null;
}

export interface DraftPipelineStatus {
  files: PipelineFileStatus[];
  readyToContinue: boolean;
}

export async function getDraftPipelineStatus(
  projectId: string,
  templateId: string
): Promise<DraftPipelineStatus> {
  await requireRole("stakeholder", "consultant", "super_admin", "admin");
  const supabase = createAdminClient();

  const [fileReqs, { data: rows }] = await Promise.all([
    loadFileRequirements(supabase, templateId),
    supabase
      .from("project_files")
      .select(
        "id, file_type, original_filename, verification_mismatch_reasons, verification_completed_at, verification_confirmed_at, extraction_status, extraction_error"
      )
      .eq("project_id", projectId),
  ]);

  const reqBySlug = new Map(fileReqs.map((r) => [r.slug, r]));
  const files: PipelineFileStatus[] = (rows ?? []).map((r) => {
    const req = reqBySlug.get(r.file_type as string);
    return {
      fileId: r.id as string,
      requirementId: req?.id ?? "",
      slug: r.file_type as string,
      name: r.original_filename as string,
      verificationCompleted: !!r.verification_completed_at,
      mismatchReasons: (r.verification_mismatch_reasons as string[] | null) ?? null,
      confirmed: !!r.verification_confirmed_at,
      extractionStatus: r.extraction_status as ExtractionStatus,
      extractionError: (r.extraction_error as string | null) ?? null,
    };
  });

  const filesBySlug = new Map<string, PipelineFileStatus[]>();
  for (const f of files) {
    filesBySlug.set(f.slug, [...(filesBySlug.get(f.slug) ?? []), f]);
  }

  const everyRequiredSlotFilled = fileReqs
    .filter((r) => r.required)
    .every((r) => (filesBySlug.get(r.slug)?.length ?? 0) > 0);
  const everyFileSettled = files.every(
    (f) =>
      f.verificationCompleted &&
      (f.extractionStatus === "not_applicable" || f.extractionStatus === "completed") &&
      (!f.mismatchReasons || f.confirmed)
  );

  return { files, readyToContinue: everyRequiredSlotFilled && everyFileSettled };
}
