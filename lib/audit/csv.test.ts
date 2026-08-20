import { describe, it, expect } from "vitest";
import { auditEntriesToCsv } from "./csv";
import type { AuditRow } from "./query";

function row(overrides: Partial<AuditRow>): AuditRow {
  return {
    id: "id-1",
    event_type: "auth.login",
    actor_id: "user-1",
    actor_email: "user@example.com",
    project_id: null,
    client_id: null,
    metadata: null,
    created_at: "2026-01-01T00:00:00.000Z",
    project: null,
    org: null,
    ...overrides,
  };
}

describe("auditEntriesToCsv — formula injection protection (#141)", () => {
  it("prefixes a formula-injection payload with a leading quote", () => {
    const csv = auditEntriesToCsv([
      row({ actor_email: '=HYPERLINK("http://evil.com")' }),
    ]);
    expect(csv).toContain(`"'=HYPERLINK(""http://evil.com"")"`);
    expect(csv).not.toMatch(/,=HYPERLINK/);
  });

  it.each(["=cmd", "+cmd", "-cmd", "@cmd", "\tcmd", "\rcmd"])(
    "neutralizes a cell starting with %j",
    (dangerous) => {
      const csv = auditEntriesToCsv([row({ actor_email: dangerous })]);
      const actorCell = csv.split("\r\n")[1]?.split(",")[3] ?? "";
      expect(actorCell.startsWith("'") || actorCell.startsWith(`"'`)).toBe(true);
    }
  );

  it("leaves normal actor emails untouched", () => {
    const csv = auditEntriesToCsv([row({ actor_email: "user@example.com" })]);
    expect(csv).toContain("user@example.com");
    expect(csv).not.toContain("'user@example.com");
  });

  it("does not double-prefix a value already starting with a quote", () => {
    const csv = auditEntriesToCsv([row({ actor_email: "'already-quoted" })]);
    const actorCell = csv.split("\r\n")[1]?.split(",")[3] ?? "";
    expect(actorCell).toBe("'already-quoted");
  });

  it("still produces a valid CSV for normal, non-malicious data", () => {
    const csv = auditEntriesToCsv([
      row({ event_type: "auth.login", metadata: { role: "admin" } }),
    ]);
    expect(csv.split("\r\n").length).toBeGreaterThan(1);
    expect(csv).toContain("User logged in");
  });
});

describe("auditEntriesToCsv", () => {
  it("uses human-readable labels and category names instead of raw codes", () => {
    const csv = auditEntriesToCsv([
      row({ event_type: "auth.login", metadata: { role: "admin" } }),
    ]);

    expect(csv).toContain("User logged in");
    expect(csv).toContain("Authentication");
    expect(csv).not.toContain("auth.login");
  });

  it("includes the same formatted details shown in the on-screen table", () => {
    const csv = auditEntriesToCsv([
      row({
        event_type: "auth.password_reset_generated",
        metadata: { target_email: "someone@example.com" },
      }),
    ]);

    expect(csv).toContain("someone@example.com");
  });

  it("quotes fields containing commas or quotes", () => {
    const csv = auditEntriesToCsv([
      row({
        event_type: "stakeholder.waived",
        metadata: { reason: 'Contains, a comma and "quotes"' },
      }),
    ]);

    expect(csv).toContain('"Contains, a comma and ""quotes"""');
  });

  it("falls back to client/project ids when no joined name is present", () => {
    const csv = auditEntriesToCsv([
      row({ client_id: "org-123", project_id: "proj-456" }),
    ]);

    expect(csv).toContain("proj-456");
  });

  it("emits a header row followed by one row per entry", () => {
    const csv = auditEntriesToCsv([row({ id: "1" }), row({ id: "2" })]);
    const lines = csv.trim().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("Timestamp,Event,Category,Actor,Client,Project,Details");
  });
});
