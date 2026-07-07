import { describe, it, expect } from "vitest";
import { EVENT_LABELS, EVENT_CATEGORY, formatDetails } from "./taxonomy";

describe("project.review_confirmed", () => {
  it("has a human-readable label", () => {
    expect(EVENT_LABELS["project.review_confirmed"]).toMatch(/client confirmed/i);
  });

  it("is categorised under Projects, so it shows up in project-scoped audit trails", () => {
    expect(EVENT_CATEGORY["project.review_confirmed"]).toBe("project");
  });
});

describe("formatDetails — project.pbdb_dispatched", () => {
  it("lists every recipient's name and email", () => {
    const details = formatDetails("project.pbdb_dispatched", {
      review_cycle: 1,
      stakeholder_count: 2,
      stakeholders: [
        { name: "Planner", email: "planner@council.gov" },
        { name: "John Doe", email: "client@acme.com" },
      ],
    });
    expect(details).toContain("Planner <planner@council.gov>");
    expect(details).toContain("John Doe <client@acme.com>");
  });

  it("falls back to a bare stakeholder count for older entries with no recipient list", () => {
    const details = formatDetails("project.pbdb_dispatched", {
      review_cycle: 1,
      stakeholder_count: 3,
    });
    expect(details).toMatch(/sent to 3 stakeholders/i);
  });

  it("still labels and formats pre-rename rows logged under the old 'project.dispatched' name", () => {
    expect(EVENT_LABELS["project.dispatched"]).toBe(EVENT_LABELS["project.pbdb_dispatched"]);
    expect(EVENT_CATEGORY["project.dispatched"]).toBe("project");
    const details = formatDetails("project.dispatched", {
      stakeholders: [{ name: "Planner", email: "planner@council.gov" }],
    });
    expect(details).toContain("Planner <planner@council.gov>");
  });
});
