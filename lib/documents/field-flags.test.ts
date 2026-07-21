import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./extractor", async () => {
  const actual = await vi.importActual<typeof import("./extractor")>("./extractor");
  return { ...actual, runTextCompletion: vi.fn() };
});

import { buildFieldFlagPlan } from "./field-flags";
import type { ExtractedCandidate } from "./extractor";

function candidate(value: string, overrides: Partial<ExtractedCandidate> = {}): ExtractedCandidate {
  return { value, confidence: "high", source_document: "doc", ...overrides };
}

describe("buildFieldFlagPlan", () => {
  it("never flags a single high-confidence candidate", async () => {
    const plan = await buildFieldFlagPlan([candidate("123 Main St")], "exact");
    expect(plan.needsFlag).toBe(false);
    expect(plan.finalValue).toBe("123 Main St");
  });

  it("flags a single medium-confidence candidate as 'confidence'", async () => {
    const plan = await buildFieldFlagPlan([candidate("123 Main St", { confidence: "medium" })], "exact");
    expect(plan.needsFlag).toBe(true);
    expect(plan.flagType).toBe("confidence");
  });

  it("flags a single low-confidence candidate as 'confidence'", async () => {
    const plan = await buildFieldFlagPlan([candidate("", { confidence: "low", value: "" })], "exact");
    expect(plan.needsFlag).toBe(true);
    expect(plan.flagType).toBe("confidence");
  });

  it("flags 2+ distinct candidates as 'inconsistency', picking the highest-confidence as final", async () => {
    const plan = await buildFieldFlagPlan(
      [candidate("123 Main St", { confidence: "medium" }), candidate("456 Other Ave", { confidence: "high" })],
      "exact"
    );
    expect(plan.needsFlag).toBe(true);
    expect(plan.flagType).toBe("inconsistency");
    expect(plan.finalValue).toBe("456 Other Ave");
  });

  it("flags as 'both' when candidates disagree and the best is still not high confidence", async () => {
    const plan = await buildFieldFlagPlan(
      [candidate("123 Main St", { confidence: "medium" }), candidate("456 Other Ave", { confidence: "low" })],
      "exact"
    );
    expect(plan.needsFlag).toBe(true);
    expect(plan.flagType).toBe("both");
  });

  it("never flags when duplicate high-confidence candidates agree", async () => {
    const plan = await buildFieldFlagPlan([candidate("123 Main St"), candidate("123 Main St")], "exact");
    expect(plan.needsFlag).toBe(false);
  });

  it("always retains every raw candidate for reviewer visibility, never deduped away", async () => {
    const candidates = [
      candidate("123 Main St", { confidence: "medium", source_document: "PO" }),
      candidate("456 Other Ave", { confidence: "high", source_document: "Drawing" }),
    ];
    const plan = await buildFieldFlagPlan(candidates, "exact");
    expect(plan.candidateRecords).toEqual(candidates);
  });

  it("flags an empty candidate list (field absent from every document) instead of silently passing (#7)", async () => {
    const plan = await buildFieldFlagPlan([], "exact");
    expect(plan.needsFlag).toBe(true);
    expect(plan.flagType).toBe("confidence");
    expect(plan.finalValue).toBe("");
    expect(plan.candidateRecords).toHaveLength(1);
    expect(plan.candidateRecords[0].confidence).toBe("low");
    expect(plan.candidateRecords[0].reason).toBeTruthy();
  });
});
