import { getSessionUser } from "@/lib/auth/session";
import { runUploadPipeline, type UploadPipelineEvent } from "@/lib/documents/upload-pipeline";

// Live per-file upload pipeline (#115) as Server-Sent Events. The browser
// POSTs the same params the processUploadedFile server action took; this
// streams one event per stage (reading → verifying → extracting →
// per-field progress → settled) so the upload card can narrate what's
// happening instead of spinning through one opaque await. processUploadedFile
// still exists as the non-streaming fallback the reconnect poll relies on.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES = new Set(["stakeholder", "consultant", "admin", "super_admin"]);

interface Body {
  projectId?: string;
  templateId?: string;
  adminOrgId?: string | null;
  adminClientId?: string | null;
  requirementId?: string;
  slug?: string;
  name?: string;
  path?: string;
}

export async function POST(req: Request): Promise<Response> {
  const actor = await getSessionUser();
  if (!actor || !ROLES.has(actor.role as string)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const { projectId, templateId, requirementId, slug, name, path } = body;
  if (!projectId || !templateId || !requirementId || !slug || !name || !path) {
    return new Response("Missing required fields", { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let open = true;
      // The client may navigate away mid-pipeline. Keep draining the
      // generator to completion regardless (its DB writes are what the
      // reconnect poll reconciles from) but stop trying to write.
      const send = (event: UploadPipelineEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          open = false;
        }
      };

      try {
        for await (const event of runUploadPipeline({
          actor: { id: actor.id as string, role: actor.role as string, client_id: actor.client_id as string | null },
          projectId,
          templateId,
          adminOrgId: body.adminOrgId ?? null,
          adminClientId: body.adminClientId ?? null,
          requirementId,
          slug,
          name,
          path,
        })) {
          send(event);
        }
      } catch (err) {
        console.error("[process-stream] pipeline crashed:", err);
        send({ type: "error", message: err instanceof Error ? err.message : "Processing failed." });
      } finally {
        if (open) {
          try {
            controller.close();
          } catch {
            // Already closed by a client disconnect — nothing to do.
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
