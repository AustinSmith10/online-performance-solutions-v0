import { describe, it, expect } from "vitest";
import { notificationToEntry } from "./tray";
import type { Notification } from "./types";

const base = {
  id: "n1",
  recipient_id: "u1",
  project_id: null,
  type: "system_error",
  title: "T",
  message: "M",
  is_read: false,
  created_at: "2026-09-30T00:00:00Z",
} as unknown as Notification;

describe("notificationToEntry href", () => {
  it("links a project notification to its project", () => {
    expect(notificationToEntry({ ...base, project_id: "p1" }, "/admin/projects").href).toBe("/admin/projects/p1");
  });

  it("links an unanswered-clarification notification to the queue in the viewer's own area", () => {
    const n = { ...base, type: "email_queue_clarification_unanswered" } as Notification;
    expect(notificationToEntry(n, "/admin/projects").href).toBe("/admin/email-queue");
    expect(notificationToEntry(n, "/ops/projects").href).toBe("/ops/email-queue");
  });

  it("prefers the project link when a queue notification has one", () => {
    const n = { ...base, type: "email_queue_unrecognised_reply", project_id: "p9" } as Notification;
    expect(notificationToEntry(n, "/admin/projects").href).toBe("/admin/projects/p9");
  });

  it("leaves other project-less notifications without a link", () => {
    expect(notificationToEntry(base, "/admin/projects").href).toBeNull();
  });
});
