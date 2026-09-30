import { describe, it, expect } from "vitest";
import { canAssignTag, canSeeTags, normaliseTagInput } from "./permissions";

const u = (role: string, id = role) => ({ id, role });

describe("canAssignTag (#213)", () => {
  it("super admin can tag any account", () => {
    for (const r of ["super_admin", "admin", "consultant", "stakeholder"]) {
      expect(canAssignTag(u("super_admin", "me"), u(r, "x"))).toBe(true);
    }
  });

  it("admin can tag stakeholders and consultants, not admins or super admins", () => {
    expect(canAssignTag(u("admin"), u("stakeholder"))).toBe(true);
    expect(canAssignTag(u("admin"), u("consultant"))).toBe(true);
    expect(canAssignTag(u("admin"), u("admin", "other"))).toBe(false);
    expect(canAssignTag(u("admin"), u("super_admin"))).toBe(false);
  });

  it("consultant can tag themselves and any stakeholder, never another consultant", () => {
    expect(canAssignTag(u("consultant", "c1"), u("consultant", "c1"))).toBe(true);
    expect(canAssignTag(u("consultant", "c1"), u("stakeholder", "s1"))).toBe(true);
    expect(canAssignTag(u("consultant", "c1"), u("consultant", "c2"))).toBe(false);
    expect(canAssignTag(u("consultant", "c1"), u("admin"))).toBe(false);
    expect(canAssignTag(u("consultant", "c1"), u("super_admin"))).toBe(false);
  });

  it("stakeholders can tag nobody", () => {
    for (const r of ["super_admin", "admin", "consultant", "stakeholder"]) {
      expect(canAssignTag(u("stakeholder", "s1"), u(r, "s1"))).toBe(false);
    }
  });
});

describe("canSeeTags", () => {
  it("is internal roles only", () => {
    expect(canSeeTags("super_admin")).toBe(true);
    expect(canSeeTags("admin")).toBe(true);
    expect(canSeeTags("consultant")).toBe(true);
    expect(canSeeTags("stakeholder")).toBe(false);
    expect(canSeeTags(undefined)).toBe(false);
  });
});

describe("normaliseTagInput", () => {
  it("trims the name and lowercases the colour", () => {
    expect(normaliseTagInput("  VIP ", "#AABBCC")).toEqual({ name: "VIP", color: "#aabbcc" });
  });
  it("rejects blank names, over-long names and non-hex colours", () => {
    expect(normaliseTagInput("  ", "#aabbcc")).toHaveProperty("error");
    expect(normaliseTagInput("x".repeat(41), "#aabbcc")).toHaveProperty("error");
    expect(normaliseTagInput("VIP", "red")).toHaveProperty("error");
    expect(normaliseTagInput("VIP", "url(x)")).toHaveProperty("error");
  });
});
