import { createHash } from "crypto";
import { auditLog } from "./log";

/**
 * Records a SHA-256 of an audit-trail export's exact bytes as its own audit
 * entry, so a later dispute over a downloaded CSV/PDF can be checked against
 * what the system actually generated at that time.
 */
export async function logAuditExport(params: {
  actorId: string;
  actorEmail: string;
  projectId?: string;
  format: "csv" | "pdf";
  content: Buffer | string;
  entryCount: number;
}): Promise<string> {
  const buffer =
    typeof params.content === "string" ? Buffer.from(params.content, "utf-8") : params.content;
  const sha256 = createHash("sha256").update(buffer).digest("hex");

  await auditLog("audit.export_downloaded", params.actorId, params.actorEmail, {
    projectId: params.projectId,
    metadata: {
      format: params.format,
      sha256,
      entry_count: params.entryCount,
      scope: params.projectId ? "project" : "admin",
    },
  });

  return sha256;
}
