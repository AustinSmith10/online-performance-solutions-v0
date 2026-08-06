import { describe, it, expect } from "vitest";
import { canContinue, type PipelineFileForGate, type RequirementForGate } from "./continueGate";

const REQUIREMENTS: RequirementForGate[] = [
  { slug: "po", required: true },
  { slug: "building_plans", required: false },
];

function file(overrides: Partial<PipelineFileForGate> = {}): PipelineFileForGate {
  return {
    slug: "po",
    verificationCompleted: true,
    mismatchReasons: null,
    confirmed: false,
    extractionStatus: "not_applicable",
    ...overrides,
  };
}

describe("canContinue — Continue-button gate (#115)", () => {
  it("blocks when a required slot has no file at all", () => {
    expect(canContinue([], REQUIREMENTS)).toBe(false);
  });

  it("allows when the only required slot is filled and settled, even with the optional slot empty", () => {
    expect(canContinue([file()], REQUIREMENTS)).toBe(true);
  });

  it("blocks while a file's verification is still pending", () => {
    expect(canContinue([file({ verificationCompleted: false })], REQUIREMENTS)).toBe(false);
  });

  it("blocks while a clean file's extraction is still running, even though nothing is flagged", () => {
    expect(canContinue([file({ extractionStatus: "running" })], REQUIREMENTS)).toBe(false);
  });

  it("blocks while a clean file's extraction is still pending", () => {
    expect(canContinue([file({ extractionStatus: "pending" })], REQUIREMENTS)).toBe(false);
  });

  it("allows once extraction has completed", () => {
    expect(canContinue([file({ extractionStatus: "completed" })], REQUIREMENTS)).toBe(true);
  });

  it("blocks a flagged file until it's confirmed", () => {
    expect(canContinue([file({ mismatchReasons: ["Doesn't look like a PO"], confirmed: false })], REQUIREMENTS)).toBe(
      false
    );
  });

  it("allows a flagged file once confirmed", () => {
    expect(canContinue([file({ mismatchReasons: ["Doesn't look like a PO"], confirmed: true })], REQUIREMENTS)).toBe(
      true
    );
  });

  it("blocks when extraction failed", () => {
    expect(canContinue([file({ extractionStatus: "failed" })], REQUIREMENTS)).toBe(false);
  });

  it("requires every file in a multi-file slot to settle independently, not just one", () => {
    const files = [
      file({ slug: "building_plans", extractionStatus: "completed" }),
      file({ slug: "building_plans", extractionStatus: "running" }),
    ];
    expect(canContinue([file(), ...files], REQUIREMENTS)).toBe(false);
  });

  it("allows once every file in a multi-file slot has settled", () => {
    const files = [
      file({ slug: "building_plans", extractionStatus: "completed" }),
      file({ slug: "building_plans", extractionStatus: "completed" }),
    ];
    expect(canContinue([file(), ...files], REQUIREMENTS)).toBe(true);
  });
});
