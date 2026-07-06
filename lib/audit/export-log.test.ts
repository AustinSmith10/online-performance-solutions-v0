import { describe, it, expect, vi } from "vitest";
import { createHash } from "crypto";

const auditLog = vi.fn(async (..._args: unknown[]) => {});
vi.mock("./log", () => ({ auditLog: (...args: unknown[]) => auditLog(...args) }));

import { logAuditExport } from "./export-log";

describe("logAuditExport", () => {
  it("returns the sha256 of the exact exported bytes", async () => {
    const content = "a,b,c\r\n1,2,3\r\n";
    const sha256 = await logAuditExport({
      actorId: "user-1",
      actorEmail: "admin@example.com",
      format: "csv",
      content,
      entryCount: 1,
    });

    expect(sha256).toBe(createHash("sha256").update(Buffer.from(content, "utf-8")).digest("hex"));
  });

  it("records an audit.export_downloaded entry carrying the hash, format, and entry count", async () => {
    await logAuditExport({
      actorId: "user-1",
      actorEmail: "admin@example.com",
      format: "pdf",
      content: Buffer.from("pdf-bytes"),
      entryCount: 42,
    });

    expect(auditLog).toHaveBeenCalledWith(
      "audit.export_downloaded",
      "user-1",
      "admin@example.com",
      expect.objectContaining({
        metadata: expect.objectContaining({ format: "pdf", entry_count: 42, scope: "admin" }),
      })
    );
  });

  it("scopes the entry to a project and marks scope 'project' when a projectId is given", async () => {
    await logAuditExport({
      actorId: "user-1",
      actorEmail: "consultant@example.com",
      projectId: "proj-1",
      format: "csv",
      content: "x",
      entryCount: 1,
    });

    expect(auditLog).toHaveBeenCalledWith(
      "audit.export_downloaded",
      "user-1",
      "consultant@example.com",
      expect.objectContaining({
        projectId: "proj-1",
        metadata: expect.objectContaining({ scope: "project" }),
      })
    );
  });
});
