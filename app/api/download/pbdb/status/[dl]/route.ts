import { downloadStatusResponse } from "@/lib/downloads/status-response";

/**
 * Polled by DownloadCard while its "wash" phase is showing, for the
 * PBDB streamed-download route (#125). `dl` is the id the client generated
 * and attached to that same download request via `?dl=`. No entry (yet, or
 * this process instance never streamed it) reads the same as "no progress
 * data available" — the client falls back to its fixed-timer wash.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ dl: string }> }
) {
  const { dl } = await params;
  return downloadStatusResponse(dl, ["consultant", "super_admin", "admin"]);
}
