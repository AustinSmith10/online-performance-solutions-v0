import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { auditLog } from "@/lib/audit/log";
import {
  startDownloadProgress,
  updateDownloadProgress,
  completeDownloadProgress,
} from "@/lib/downloads/download-progress";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const { fileId } = await params;

  const user = await getSessionUser();
  if (!user || (user.role !== "consultant" && user.role !== "super_admin" && user.role !== "admin")) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: file } = await supabase
    .from("project_files")
    .select("id, project_id, storage_path, original_filename, version")
    .eq("id", fileId)
    .eq("file_type", "pbdb")
    .maybeSingle();

  if (!file) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Consultants must be assigned to the project
  if (user.role === "consultant") {
    const { data: project } = await supabase
      .from("projects")
      .select("assigned_consultant_id, client_id")
      .eq("id", file.project_id as string)
      .maybeSingle();

    if (!project || project.assigned_consultant_id !== user.id) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  const { data: project } = await supabase
    .from("projects")
    .select("client_id")
    .eq("id", file.project_id as string)
    .maybeSingle();

  // Streamed from storage rather than buffered fully into memory (#125):
  // sign a short-lived URL and fetch it directly, piping the upstream
  // response body straight through to the client. The Supabase JS client's
  // own storage.download() fully buffers the file into a Blob before
  // returning it — that's the buffering this issue removes.
  const { data: signed, error: signError } = await supabase.storage
    .from("documents")
    .createSignedUrl(file.storage_path as string, 60);

  if (signError || !signed) {
    return new NextResponse("Could not retrieve file", { status: 500 });
  }

  const upstream = await fetch(signed.signedUrl);
  if (!upstream.ok || !upstream.body) {
    return new NextResponse("Could not retrieve file", { status: 500 });
  }

  await auditLog("project.pbdb_downloaded", user.id as string, user.email as string, {
    projectId: file.project_id as string,
    orgId: project?.client_id as string | undefined,
    metadata: {
      file_id: file.id,
      version: file.version,
      filename: file.original_filename,
      role: user.role,
    },
  });

  const { error: downloadedAtError } = await supabase
    .from("projects")
    .update({ pbdb_downloaded_at: new Date().toISOString() })
    .eq("id", file.project_id as string)
    .is("pbdb_downloaded_at", null);

  if (downloadedAtError) {
    console.error(
      `[pbdb-download] Failed to set pbdb_downloaded_at for project ${file.project_id as string}:`,
      downloadedAtError
    );
  }

  const filename = (file.original_filename as string) || "pbdb.pdf";
  const contentLengthHeader = upstream.headers.get("content-length");
  const totalBytes = contentLengthHeader ? Number(contentLengthHeader) : null;

  // ?dl=<id> is set client-side (DownloadCard) on the same anchor being
  // clicked, right before the browser's default navigation fires — see
  // components/DownloadCard.tsx. Its presence is what a separate poll
  // request (app/api/download/pbdb/status/[dl]/route.ts) reads bytes-served
  // progress from; absent for any other caller of this route.
  const dl = new URL(req.url).searchParams.get("dl");
  if (dl) startDownloadProgress(dl, totalBytes);

  let bytesServed = 0;
  const counting = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytesServed += chunk.byteLength;
      if (dl) updateDownloadProgress(dl, bytesServed);
      controller.enqueue(chunk);
    },
    flush() {
      if (dl) completeDownloadProgress(dl);
    },
  });

  const headers: Record<string, string> = {
    "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
    "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
  };
  if (totalBytes !== null) headers["Content-Length"] = String(totalBytes);

  return new NextResponse(upstream.body.pipeThrough(counting), { headers });
}
