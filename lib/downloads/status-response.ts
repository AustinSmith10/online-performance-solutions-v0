import "server-only";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getDownloadProgress } from "@/lib/downloads/download-progress";

/**
 * Shared handler behind both /api/download/pbdb/status/[dl] and
 * /api/download/pbdr/status/[dl] — same in-memory progress store
 * (lib/downloads/download-progress.ts), just kept as two routes for URL
 * symmetry with their two respective download routes. `allowedRoles`
 * mirrors whichever download route is polling this status endpoint, rather
 * than being pooled across both.
 */
export async function downloadStatusResponse(
  dl: string,
  allowedRoles: readonly string[]
): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user || !allowedRoles.includes(user.role as string)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const progress = getDownloadProgress(dl);
  if (!progress) {
    return NextResponse.json({ bytesServed: 0, totalBytes: null, done: false }, { status: 404 });
  }

  return NextResponse.json(progress);
}
