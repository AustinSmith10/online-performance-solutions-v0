import { SSEBuffer } from "@/lib/sse";
import type { PreviewProgressEvent } from "@/lib/documents/project-file-preview";

export type { PreviewProgressEvent };

/**
 * Client half of the SSE file previewer: opens the stream route and invokes
 * `onEvent` for each `step` / `ready` / `error` event as it arrives. Resolves
 * when the stream closes. Network/HTTP failures are surfaced as a synthetic
 * `error` event so the caller has one code path — same shape as
 * streamUploadedFile.
 */
export async function streamFilePreview(
  projectId: string,
  fileId: string,
  onEvent: (event: PreviewProgressEvent) => void
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(fileId)}/preview-stream`,
      { headers: { Accept: "text/event-stream" } }
    );
  } catch {
    onEvent({ type: "error", message: "Lost connection while rendering the preview." });
    return;
  }

  if (!res.ok || !res.body) {
    onEvent({
      type: "error",
      message: res.status === 401 ? "Your session expired. Please sign in again." : "Preview failed.",
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
        try {
          onEvent(JSON.parse(payload) as PreviewProgressEvent);
        } catch {
          // Ignore a malformed frame — the stream keeps going.
        }
      }
    }
  } catch {
    onEvent({ type: "error", message: "Lost connection while rendering the preview." });
  }
}
