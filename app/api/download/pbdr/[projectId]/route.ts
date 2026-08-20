import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { auditLog } from "@/lib/audit/log";
import { getStakeholderReviewedProjectIds, stakeholderAccessFilter } from "@/lib/portal/access";
import {
  startDownloadProgress,
  updateDownloadProgress,
  completeDownloadProgress,
} from "@/lib/downloads/download-progress";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const user = await getSessionUser();
  const allowedRoles = ["stakeholder", "consultant", "admin", "super_admin"];
  if (!user || !allowedRoles.includes(user.role as string)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const supabase = createAdminClient();

  // Verify the requester is allowed to see this project: an internal stakeholder
  // scoped to their org on a delivered/complete project, the consultant assigned
  // to it (any status, once a PBDR exists — they may want to sanity check their
  // own QA work before it's officially delivered), or an admin/super_admin who
  // can see any project.
  let project: { id: string; client_id?: string } | null = null;
  if (user.role === "consultant") {
    const { data } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("assigned_consultant_id", user.id as string)
      .maybeSingle();
    project = data;
  } else if (user.role === "stakeholder") {
    const reviewedProjectIds = await getStakeholderReviewedProjectIds(supabase, user.email as string);
    const { data } = await supabase
      .from("projects")
      .select("id, client_id")
      .eq("id", projectId)
      .eq("client_id", user.client_id as string)
      .in("status", ["delivered", "complete"])
      .or(stakeholderAccessFilter(user.id as string, reviewedProjectIds))
      .maybeSingle();
    project = data;
  } else {
    const { data } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .maybeSingle();
    project = data;
  }

  if (!project) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { data: pbdrFile } = await supabase
    .from("project_files")
    .select("storage_path, original_filename")
    .eq("project_id", projectId)
    .eq("file_type", "pbdr")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pbdrFile) {
    return new NextResponse("File not found", { status: 404 });
  }

  // Streamed from storage rather than a redirect to a signed URL (#129,
  // mirroring #125's pbdb download route) — a redirect hands the browser
  // straight to Supabase's storage CDN, bypassing this server entirely and
  // leaving nowhere to count bytes served for the status endpoint below.
  const { data: signed, error: signError } = await supabase.storage
    .from("documents")
    .createSignedUrl(pbdrFile.storage_path as string, 60);

  if (signError || !signed) {
    return new NextResponse("Could not generate download link", { status: 500 });
  }

  const upstream = await fetch(signed.signedUrl);
  if (!upstream.ok || !upstream.body) {
    return new NextResponse("Could not retrieve file", { status: 500 });
  }

  await auditLog("project.pbdr_downloaded", user.id as string, user.email as string, {
    projectId,
    orgId: (user.client_id as string | null) ?? undefined,
    metadata: { filename: pbdrFile.original_filename, role: user.role },
  });

  const filename = (pbdrFile.original_filename as string) || "pbdr.pdf";
  const contentLengthHeader = upstream.headers.get("content-length");
  const totalBytes = contentLengthHeader ? Number(contentLengthHeader) : null;

  // ?dl=<id> is set client-side (DownloadCard, or HeroActionMenu's
  // "Download all" sequencer) on the same request being issued, right
  // before the browser follows it — see components/DownloadCard.tsx and
  // app/(client)/portal/_components/HeroActionMenu.tsx.
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
