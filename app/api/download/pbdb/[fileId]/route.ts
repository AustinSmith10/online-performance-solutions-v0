import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { auditLog } from "@/lib/audit/log";
import {
  startDownloadProgress,
  updateDownloadProgress,
  completeDownloadProgress,
} from "@/lib/downloads/download-progress";
import { getRoundStatus } from "@/lib/stakeholders/review-round";
import { getCurrentRevNumber } from "@/lib/documents/revision-history";
import { appendRevisionHistoryRow, setCoverRevisionNumber } from "@/lib/documents/revision-table";
import { getBusinessTimezone } from "@/lib/settings/timezone";
import { formatDateAU } from "@/lib/time";

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
    .select("id, project_id, storage_path, original_filename, version, review_cycle")
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

  // #194: once the round this file was dispatched for has closed rejected,
  // the DB already shows the new revision (row + cover number) — patch the
  // served copy to match instead of leaving the consultant to download a
  // document that still shows the stale "Rev {n-1}" until they re-upload.
  // Buffered (not streamed) only on this path, since PizZip needs the whole
  // .docx; the common case below is unaffected and stays fully streamed
  // (#125).
  let patchedBuffer: Buffer | null = null;
  let patchWarning: string | null = null;

  const roundStatus = await getRoundStatus(supabase, file.project_id as string, file.review_cycle as number);
  if (roundStatus === "closed_rejected") {
    const expectedRev = await getCurrentRevNumber(supabase, file.project_id as string, "pbdb");
    const { data: revHistoryRow } = await supabase
      .from("revision_history")
      .select("prepared_by, created_at")
      .eq("project_id", file.project_id as string)
      .eq("doc_type", "pbdb")
      .eq("rev_number", expectedRev)
      .maybeSingle();

    const preparedById = (revHistoryRow?.prepared_by as string | null | undefined) ?? null;
    let preparedByName = "";
    if (preparedById) {
      const { data: preparedByUser } = await supabase
        .from("users")
        .select("first_name, last_name")
        .eq("id", preparedById)
        .maybeSingle();
      preparedByName = [preparedByUser?.first_name as string | null, preparedByUser?.last_name as string | null]
        .filter(Boolean)
        .join(" ");
    }

    const timeZone = await getBusinessTimezone(supabase);
    const rowDate = revHistoryRow?.created_at ? new Date(revHistoryRow.created_at as string) : new Date();

    const upstreamBuffer = Buffer.from(await upstream.arrayBuffer());
    const appendResult = appendRevisionHistoryRow(upstreamBuffer, {
      docType: "PBDB",
      revNumber: String(expectedRev),
      date: formatDateAU(rowDate, timeZone),
      purpose: "Stakeholder Review",
      preparedBy: preparedByName,
    });
    const coverResult = setCoverRevisionNumber(appendResult.buffer, String(expectedRev));
    patchedBuffer = coverResult.buffer;
    patchWarning = appendResult.warning ?? coverResult.warning ?? null;

    if (patchWarning) {
      await auditLog("project.revision_table_patch_failed", user.id as string, user.email as string, {
        projectId: file.project_id as string,
        metadata: { warning: patchWarning, revNumber: expectedRev, atDownload: true },
      });
    }
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

  // ?dl=<id> is set client-side (DownloadCard) on the same anchor being
  // clicked, right before the browser's default navigation fires — see
  // components/DownloadCard.tsx. Its presence is what a separate poll
  // request (app/api/download/pbdb/status/[dl]/route.ts) reads bytes-served
  // progress from; absent for any other caller of this route. It also
  // carries the #194 patch-failure warning back to DownloadCard, since this
  // response IS the file — there's no other channel to a plain browser
  // navigation.
  const dl = new URL(req.url).searchParams.get("dl");

  if (patchedBuffer) {
    const totalBytes = patchedBuffer.length;
    if (dl) {
      startDownloadProgress(dl, totalBytes);
      updateDownloadProgress(dl, totalBytes);
      completeDownloadProgress(dl, patchWarning);
    }
    const headers: Record<string, string> = {
      "Content-Type":
        upstream.headers.get("content-type") ||
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
      "Content-Length": String(totalBytes),
    };
    return new NextResponse(new Uint8Array(patchedBuffer), { headers });
  }

  const contentLengthHeader = upstream.headers.get("content-length");
  const totalBytes = contentLengthHeader ? Number(contentLengthHeader) : null;

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

  return new NextResponse(upstream.body!.pipeThrough(counting), { headers });
}
