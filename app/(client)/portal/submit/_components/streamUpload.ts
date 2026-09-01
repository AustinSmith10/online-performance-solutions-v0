import { SSEBuffer } from "@/lib/sse";
import type { UploadPipelineEvent } from "@/lib/documents/upload-pipeline";
import type { ClientPipelineFile } from "./pipelineTypes";

// Client half of the SSE upload pipeline: POST the file's params to the
// stream route and invoke `onEvent` for each pipeline event as it arrives.
// Resolves when the stream closes. A network/HTTP failure is surfaced as a
// synthetic `error` event rather than a throw, so the caller has one code
// path — and the reconnect poll in SubmissionForm still reconciles from the
// DB rows the pipeline wrote regardless.

export interface StreamUploadParams {
  projectId: string;
  templateId: string;
  adminOrgId: string | null;
  adminClientId: string | null;
  requirementId: string;
  slug: string;
  name: string;
  path: string;
}

export async function streamUploadedFile(
  params: StreamUploadParams,
  onEvent: (event: UploadPipelineEvent) => void
): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/portal/submit/process-stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
  } catch {
    onEvent({ type: "error", message: "Lost connection while processing. Please retry." });
    return;
  }

  if (!res.ok || !res.body) {
    onEvent({
      type: "error",
      message: res.status === 401 ? "Your session expired. Please sign in again." : "Processing failed. Please retry.",
    });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const buffer = new SSEBuffer();

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const payload of buffer.push(decoder.decode(value, { stream: true }))) {
        let event: UploadPipelineEvent;
        try {
          event = JSON.parse(payload) as UploadPipelineEvent;
        } catch {
          continue;
        }
        onEvent(event);
      }
    }
  } catch {
    onEvent({ type: "error", message: "Lost connection while processing. Please retry." });
  }
}

/**
 * Pure: fold one pipeline event into a file's client state. Kept out of the
 * component and unit-tested — the narration a stakeholder reads while their
 * upload settles is a real correctness surface, same rationale as
 * continueGate.canContinue.
 */
export function reducePipelineFile(
  file: ClientPipelineFile,
  event: UploadPipelineEvent
): ClientPipelineFile {
  switch (event.type) {
    case "reading":
      return { ...file, uploading: false, stage: "reading", stageDetail: null };
    case "verifying":
      return { ...file, uploading: false, stage: "verifying", stageDetail: null };
    case "file_created":
      return {
        ...file,
        uploading: false,
        fileId: event.fileId,
        verificationCompleted: true,
        mismatchReasons: event.mismatchReasons,
      };
    case "flagged":
      return {
        ...file,
        fileId: event.fileId,
        verificationCompleted: true,
        mismatchReasons: event.reasons,
        extractionStatus: "pending",
        stage: null,
        stageDetail: null,
      };
    case "extracting":
      return {
        ...file,
        verificationCompleted: true,
        extractionStatus: "running",
        stage: "extracting",
        stageDetail: `Reading ${event.total} values…`,
        extractProgress: { found: 0, total: event.total },
      };
    case "extract_progress":
      return {
        ...file,
        stage: "extracting",
        stageDetail: `Read ${event.found} of ${event.total} values`,
        extractProgress: { found: event.found, total: event.total },
      };
    case "extracted":
      return {
        ...file,
        stageDetail: `Found ${event.found} of ${event.total} values`,
        extractProgress: { found: event.found, total: event.total },
      };
    case "settled":
      return {
        ...file,
        fileId: event.fileId,
        verificationCompleted: true,
        extractionStatus: event.extractionStatus,
        extractionError: event.extractionError,
        mismatchReasons: event.mismatchReasons,
        stage: null,
        stageDetail: event.extractionStatus === "failed" ? null : file.stageDetail,
        extractProgress: null,
      };
    case "error":
      return {
        ...file,
        uploading: false,
        fileId: event.fileId ?? file.fileId,
        error: event.message,
        stage: null,
        stageDetail: null,
      };
    default:
      return file;
  }
}
