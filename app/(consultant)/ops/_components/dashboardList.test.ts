import { describe, expect, it } from "vitest";
import { daysOverdue, matchesQuery, paginate, parsePage, parseSection, sortByAttention } from "./dashboardList";

describe("daysOverdue", () => {
  it("counts whole calendar days past the date", () => {
    expect(daysOverdue("2026-09-11", "2026-09-24")).toBe(13);
    expect(daysOverdue("2026-09-23T00:00:00Z", "2026-09-24")).toBe(1);
  });
  it("is 0 for today, the future, or no date", () => {
    expect(daysOverdue("2026-09-24", "2026-09-24")).toBe(0);
    expect(daysOverdue("2026-10-01", "2026-09-24")).toBe(0);
    expect(daysOverdue(null, "2026-09-24")).toBe(0);
  });
});

describe("sortByAttention", () => {
  const p = (id: string, isRevision: boolean, d: number) => ({ id, isRevision, isOverdue: d > 0, daysOverdue: d });
  it("orders revisions, then most-overdue, then the rest, stably", () => {
    const out = sortByAttention([p("a", false, 0), p("b", false, 3), p("c", true, 0), p("d", false, 9), p("e", false, 0)]);
    expect(out.map((x) => x.id)).toEqual(["c", "d", "b", "a", "e"]);
  });
  it("does not mutate the input", () => {
    const input = [p("a", false, 0), p("b", true, 0)];
    sortByAttention(input);
    expect(input.map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("matchesQuery", () => {
  it("matches any part case-insensitively and ignores blank queries", () => {
    expect(matchesQuery("yandina", ["1 Site, Yandina QLD", null])).toBe(true);
    expect(matchesQuery("  ", ["x"])).toBe(true);
    expect(matchesQuery("zzz", ["abc", null])).toBe(false);
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 45 }, (_, i) => i);
  it("slices and reports counts", () => {
    const r = paginate(items, 2, 20);
    expect(r.items[0]).toBe(20);
    expect(r).toMatchObject({ page: 2, pageCount: 3, total: 45 });
  });
  it("clamps out-of-range pages and handles empty lists", () => {
    expect(paginate(items, 99, 20).page).toBe(3);
    expect(paginate(items, 0, 20).page).toBe(1);
    expect(paginate([], 1, 20)).toMatchObject({ items: [], page: 1, pageCount: 1, total: 0 });
  });
});

describe("param parsing", () => {
  it("falls back safely", () => {
    expect(parseSection("archive")).toBe("archive");
    expect(parseSection("nope")).toBe("active");
    expect(parseSection(undefined)).toBe("active");
    expect(parsePage("3")).toBe(3);
    expect(parsePage("-1")).toBe(1);
    expect(parsePage("abc")).toBe(1);
  });
});
