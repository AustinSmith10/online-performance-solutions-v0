import "server-only";

// Streaming core of the per-file submission pipeline (#115). The old
// app/actions/submission-pipeline.ts:processUploadedFile ran
// download → verify → extract as one opaque server action, so the browser
// saw a single state jump from "Uploading…" to the final result. This
// module runs the same steps as an async generator that yields a live event
// per stage, so the upload UI can narrate "checking the document" → then
// "reading N of M values". processUploadedFile is now a thin drain over this
// (kept for the reconnect/refresh fallback), and app/api/portal/submit/
// process-stream/route.ts pipes the events straight to the browser as SSE.
//
// The DB writes here are byte-for-byte what the old flow made — extraction_
// status transitions through running → completed/failed exactly as before —
// so getDraftPipelineStatus's poll stays a correct reconciliation source if
// the stream drops.

import { createAdminClient } from "@/lib/supabase/admin";
import {
  resolveOrgId,
  loadFileRequirements,
  loadExtractTokens,
  makeSampleTextLoader,
} from "@/lib/documents/submission-shared";
import { verifyUploadAgainstRequirement } from "@/lib/documents/file-requirement-verification";
import {
  extractSingleDocumentStreaming,
  extractionFieldTotal,
  type SingleDocExtraction,
} from "@/lib/documents/extractor";
import { getJudgeDocumentTextCharCap } from "@/lib/settings/judge-document-text-cap";
import { claimExtractionSlot } from "@/lib/documents/extraction-budget";

export type ExtractionStatus = "not_applicable" | "pending" | "running" | "completed" | "failed";

type Supa = ReturnType<typeof createAdminClient>;

// The session user as returned by getSessionUser() — only the fields the
// pipeline actually needs to resolve org / submitter / auto-assignment.
export interface PipelineActor {
  id: string;
  role: string;
  client_id?: string | null;
}

// Pure derivation shared by the SSE route (actor from getSessionUser) and
// the drain wrapper (actor from requireRole) — mirrors the old private
// actorContext() minus the auth call, which each caller now does itself.
export function deriveActorContext(
  actor: PipelineActor,
  adminOrgId: string | null,
  adminClientId: string | null
): { orgId: string; submittedBy: string; assignedConsultantId: string | null } {
  const isAdmin = actor.role === "super_admin" || actor.role === "admin";
  const actsOnBehalf = isAdmin || actor.role === "consultant";
  const orgId = resolveOrgId(actor, actsOnBehalf, adminOrgId);
  const submittedBy = actsOnBehalf ? (adminClientId ?? "") : actor.id;
  const assignedConsultantId = actor.role === "consultant" ? actor.id : null;
  return { orgId, submittedBy, assignedConsultantId };
}

export async function ensureDraftProject(
  supabase: Supa,
  projectId: string,
  templateId: string,
  orgId: string,
  submittedBy: string,
  assignedConsultantId: string | null
): Promise<void> {
  await supabase.from("projects").upsert(
    {
      id: projectId,
      client_id: orgId,
      template_id: templateId,
      submitted_by: submittedBy,
      assigned_consultant_id: assignedConsultantId,
      status: "draft",
    },
    { onConflict: "id", ignoreDuplicates: true }
  );
}

export async function touchProject(supabase: Supa, projectId: string): Promise<void> {
  await supabase.from("projects").update({ updated_at: new Date().toISOString() }).eq("id", projectId);
}

// ─── Events ────────────────────────────────────────────────────────────────

export type UploadPipelineEvent =
  // PDF bytes in hand, about to parse + verify.
  | { type: "reading" }
  // Running the deterministic + AI-judge document-type checks.
  | { type: "verifying" }
  // Row persisted — the browser now has an id for confirm/remove/retry.
  | { type: "file_created"; fileId: string; mismatchReasons: string[] | null }
  // Verification flagged a possible wrong-document; pipeline stops here and
  // extraction is deferred until the stakeholder confirms.
  | { type: "flagged"; fileId: string; reasons: string[] }
  // Clean — extraction is starting; `fields` are the human labels being read.
  | { type: "extracting"; fields: string[]; total: number }
  | { type: "extract_progress"; found: number; total: number }
  | { type: "extracted"; found: number; total: number }
  // Terminal success. extractionStatus is "completed", "failed", or
  // "not_applicable"; mismatchReasons echoes file_created for a flagged file
  // that still reached a terminal state.
  | {
      type: "settled";
      fileId: string;
      extractionStatus: ExtractionStatus;
      mismatchReasons: string[] | null;
      extractionError: string | null;
    }
  | { type: "error"; message: string; fileId?: string };

export interface UploadPipelineParams {
  actor: PipelineActor;
  projectId: string;
  templateId: string;
  adminOrgId: string | null;
  adminClientId: string | null;
  requirementId: string;
  slug: string;
  name: string;
  /** Storage path the browser already uploaded the bytes to. */
  path: string;
}

/**
 * Drives one uploaded file through verify → (extract) and yields a live
 * event per stage. Never throws for an expected failure — it yields
 * `{ type: "error" }` and returns — so a consumer piping to SSE can just
 * forward every event.
 */
export async function* runUploadPipeline(
  params: UploadPipelineParams
): AsyncGenerator<UploadPipelineEvent> {
  const { actor, projectId, templateId, adminOrgId, adminClientId, requirementId, slug, name, path } = params;
  const supabase = createAdminClient();

  const { orgId, submittedBy, assignedConsultantId } = deriveActorContext(actor, adminOrgId, adminClientId);
  if (!orgId) {
    yield { type: "error", message: "Client is required." };
    return;
  }

  await ensureDraftProject(supabase, projectId, templateId, orgId, submittedBy, assignedConsultantId);

  const fileReqs = await loadFileRequirements(supabase, templateId);
  const requirement = fileReqs.find((r) => r.id === requirementId);
  if (!requirement) {
    yield { type: "error", message: "Unknown file requirement." };
    return;
  }

  const { data: downloaded, error: downloadError } = await supabase.storage.from("submissions").download(path);
  if (downloadError || !downloaded) {
    yield { type: "error", message: `Failed to read "${name}".` };
    return;
  }
  const buffer = Buffer.from(await downloaded.arrayBuffer());

  yield { type: "reading" };

  const isPdf = name.toLowerCase().endsWith(".pdf");
  yield { type: "verifying" };
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
    console.error(`[upload-pipeline] verification failed for "${name}", failing open:`, err);
  }

  const clean = reasons.length === 0;
  const initialStatus: ExtractionStatus = !requirement.extraction ? "not_applicable" : clean ? "running" : "pending";

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
      extraction_status: initialStatus,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    yield { type: "error", message: "Failed to save the uploaded file. Please try again." };
    return;
  }
  const fileId = inserted.id as string;
  await touchProject(supabase, projectId);

  yield { type: "file_created", fileId, mismatchReasons: clean ? null : reasons };

  if (!clean) {
    yield { type: "flagged", fileId, reasons };
    yield { type: "settled", fileId, extractionStatus: "pending", mismatchReasons: reasons, extractionError: null };
    return;
  }

  if (!requirement.extraction) {
    yield { type: "settled", fileId, extractionStatus: "not_applicable", mismatchReasons: null, extractionError: null };
    return;
  }

  // ── Extraction ──────────────────────────────────────────────────────────
  const { extractTokens } = await loadExtractTokens(supabase, orgId, templateId);
  const total = extractionFieldTotal(extractTokens);

  const { allowed, limit } = await claimExtractionSlot(supabase, actor.id);
  if (!allowed) {
    const message = `Daily extraction limit reached (${limit}/24h). Try again later or contact an admin.`;
    await supabase
      .from("project_files")
      .update({ extraction_status: "failed" as ExtractionStatus, extraction_error: message })
      .eq("id", fileId);
    yield { type: "settled", fileId, extractionStatus: "failed", mismatchReasons: null, extractionError: message };
    return;
  }

  yield { type: "extracting", fields: extractTokens.map((t) => t.label), total };

  try {
    // The extractor reports progress through a synchronous callback fired
    // from inside its own `await`. Bridge that into the generator with a
    // tiny queue + wake promise so `extract_progress` events flush to the
    // consumer *while* the Sonnet call is still streaming, not batched after.
    const queue: UploadPipelineEvent[] = [];
    let wake: (() => void) | null = null;
    const ping = () => {
      wake?.();
      wake = null;
    };

    let finished = false;
    let single: SingleDocExtraction | null = null;
    let extractionErr: unknown = null;
    const runner = extractSingleDocumentStreaming(
      { label: requirement.name, buffer },
      extractTokens,
      (found) => {
        queue.push({ type: "extract_progress", found: Math.min(found, total), total });
        ping();
      }
    )
      .then((r) => {
        single = r;
      })
      .catch((e) => {
        extractionErr = e;
      })
      .finally(() => {
        finished = true;
        ping();
      });

    while (!finished || queue.length > 0) {
      if (queue.length > 0) {
        yield queue.shift()!;
        continue;
      }
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }
    await runner;
    if (extractionErr || !single) throw extractionErr ?? new Error("Extraction failed.");

    await supabase
      .from("project_files")
      .update({
        extraction_status: "completed" as ExtractionStatus,
        extraction_result: single,
        extraction_error: null,
      })
      .eq("id", fileId);
    await touchProject(supabase, projectId);

    const found = countExtracted(single, total);
    yield { type: "extracted", found, total };
    yield { type: "settled", fileId, extractionStatus: "completed", mismatchReasons: null, extractionError: null };
  } catch (err) {
    console.error(`[upload-pipeline] extraction failed for file ${fileId}:`, err);
    const message = err instanceof Error ? err.message : "Extraction failed.";
    await supabase
      .from("project_files")
      .update({ extraction_status: "failed" as ExtractionStatus, extraction_error: message })
      .eq("id", fileId);
    yield { type: "settled", fileId, extractionStatus: "failed", mismatchReasons: null, extractionError: message };
  }
}

// How many fields the extraction actually produced a non-empty value for —
// the honest "found N of M" the UI settles on, independent of the streamed
// progress ticks.
function countExtracted(single: SingleDocExtraction, total: number): number {
  let n = single.result.po_number.value.trim() ? 1 : 0;
  for (const list of Object.values(single.result.fields)) {
    if (list.some((f) => f.value.trim())) n += 1;
  }
  return Math.min(n, total);
}
