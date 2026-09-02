import { getSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  resolveProjectFilePreview,
  type PreviewProgressEvent,
} from "@/lib/documents/project-file-preview";

// Live progress for the Documents-tab previewer as Server-Sent Events. GET so
// it can be opened straight from a click; streams one `step` event per
// conversion boundary (only the PBDB .docx path has any) then a terminal
// `ready` / `error`. The shared resolver lives in
// lib/documents/project-file-preview.ts.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES = new Set(["consultant", "admin", "super_admin"]);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> }
): Promise<Response> {
  const actor = await getSessionUser();
  if (!actor || !ROLES.has(actor.role as string)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id: projectId, fileId } = await params;
  const supabase = createAdminClient();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let open = true;
      const send = (event: PreviewProgressEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          open = false;
        }
      };

      try {
        await resolveProjectFilePreview(
          supabase,
          {
            projectId,
            fileId,
            actor: { id: actor.id as string, role: actor.role as string, email: (actor.email as string) ?? null },
          },
          send
        );
      } catch (err) {
        console.error("[preview-stream] resolve crashed:", err);
        send({ type: "error", message: err instanceof Error ? err.message : "Preview failed." });
      } finally {
        if (open) {
          try {
            controller.close();
          } catch {
            // Already closed by a client disconnect.
          }
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
