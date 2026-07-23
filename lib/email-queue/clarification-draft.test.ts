import { describe, it, expect } from "vitest";
import { buildDefaultClarificationDraft } from "./clarification-draft";

describe("buildDefaultClarificationDraft", () => {
  it("lists open reviews by address only — not our internal 'Cycle N' numbering — with a trailing 'Others' option", () => {
    const draft = buildDefaultClarificationDraft([
      { projectLabel: "42 Example St" },
      { projectLabel: "7 Sample Ave" },
    ]);

    expect(draft).toContain("1. 42 Example St");
    expect(draft).toContain("2. 7 Sample Ave");
    expect(draft).toContain("3. Others:");
    expect(draft).toContain("which project your review response is about");
    expect(draft).not.toContain("Cycle");
  });

  it("asks for the project address or reviewed filename — not PO/cycle jargon — when the sender has no open reviews", () => {
    const draft = buildDefaultClarificationDraft([]);
    expect(draft).toContain("project address");
    expect(draft).toContain("filename");
    expect(draft).not.toContain("PO number");
    expect(draft).not.toContain("1.");
  });
});
