import { describe, it, expect } from "vitest";
import { TAG_SWATCHES, tagColors, contrastRatio } from "./color";

describe("tag colours", () => {
  it.each(TAG_SWATCHES.map((s) => [s.name, s.hex]))("%s chip text meets WCAG AA on its tint", (_n, hex) => {
    const { bg, fg } = tagColors(hex);
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("stays legible for an arbitrary stored colour", () => {
    for (const hex of ["#ffff00", "#00ffff", "#000000", "#ffffff"]) {
      const { bg, fg } = tagColors(hex);
      expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("falls back to neutral zinc for a malformed value", () => {
    expect(tagColors("nope")).toEqual({ bg: "#f4f4f5", fg: "#3f3f46" });
  });
});
