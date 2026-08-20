import { downloadStatusResponse } from "@/lib/downloads/status-response";

/**
 * Polled while the PBDR streamed-download route (#129, mirroring #125) is
 * in flight — driven by DownloadCard for a single row's own click, and by
 * HeroActionMenu's "Download all" sequencer for the currently-active row.
 * `dl` is the id attached to that same download request via `?dl=`.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ dl: string }> }
) {
  const { dl } = await params;
  return downloadStatusResponse(dl, ["stakeholder", "consultant", "admin", "super_admin"]);
}
