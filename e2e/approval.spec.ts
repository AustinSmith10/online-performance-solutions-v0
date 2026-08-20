import { test, expect } from "playwright/test";
import { deleteProjects, requireSeedFixtures, seedProject, seedStakeholderReview } from "./support/seed";
import { adminClient } from "./support/supabase";

// These specs seed a `stakeholder_reviews` row directly (with a known
// plaintext token, same shape dispatchPbdb() writes) instead of running the
// real dispatch pipeline — that keeps this stage independent of Gotenberg
// (needed to render the dispatch PDF; see consultant-review-and-dispatch.spec.ts),
// while still exercising the real /approve/[token] page + submitApproval action.

test.describe("Stakeholder approval via token link", () => {
  const createdProjectIds: string[] = [];

  test.afterEach(async () => {
    await deleteProjects(createdProjectIds.splice(0));
  });

  test("external stakeholder can approve without comments", async ({ page }) => {
    const { client, stakeholder } = await requireSeedFixtures();
    const project = await seedProject({
      clientId: client.id,
      submittedBy: stakeholder.id,
      status: "dispatched",
    });
    createdProjectIds.push(project.id);

    const review = await seedStakeholderReview({
      projectId: project.id,
      stakeholderEmail: "external-reviewer+e2e@example.com",
      stakeholderName: "External Reviewer",
    });

    await page.goto(`/approve/${review.token}`);
    await expect(page.getByRole("radio", { name: "Approved" })).toBeChecked();
    await page.getByRole("button", { name: /^approve$/i }).click();

    await expect(page.getByText(/response recorded/i)).toBeVisible({ timeout: 15_000 });

    const sb = adminClient();
    const { data: updated } = await sb
      .from("stakeholder_reviews")
      .select("status")
      .eq("id", review.id)
      .single();
    expect(updated?.status).toBe("approved_without_comments");
  });

  test("rejection requires a comment and records the rejection", async ({ page }) => {
    const { client, stakeholder } = await requireSeedFixtures();
    const project = await seedProject({
      clientId: client.id,
      submittedBy: stakeholder.id,
      status: "dispatched",
    });
    createdProjectIds.push(project.id);

    const review = await seedStakeholderReview({
      projectId: project.id,
      stakeholderEmail: "external-reviewer+e2e-reject@example.com",
      stakeholderName: "External Reviewer",
    });

    await page.goto(`/approve/${review.token}`);
    await page.getByRole("radio", { name: "Rejected" }).check();

    // Submitting with no comment should be blocked client-side (the
    // textarea is `required` for a rejection) — the form should not advance.
    await page.getByRole("button", { name: /submit rejection/i }).click();
    await expect(page.getByText(/response recorded/i)).not.toBeVisible();

    await page.getByLabel(/reason for rejection/i).fill("Page 4 — the setback dimension looks wrong. Please revise.");
    await page.getByRole("button", { name: /submit rejection/i }).click();

    await expect(page.getByText(/response recorded/i)).toBeVisible({ timeout: 15_000 });

    const sb = adminClient();
    const { data: updated } = await sb
      .from("stakeholder_reviews")
      .select("status, comments")
      .eq("id", review.id)
      .single();
    expect(updated?.status).toBe("rejected_with_comments");
    expect(updated?.comments).toContain("setback dimension");
  });

  test("an expired approval link shows the expired state", async ({ page }) => {
    const { client, stakeholder } = await requireSeedFixtures();
    const project = await seedProject({
      clientId: client.id,
      submittedBy: stakeholder.id,
      status: "dispatched",
    });
    createdProjectIds.push(project.id);

    const review = await seedStakeholderReview({
      projectId: project.id,
      stakeholderEmail: "external-reviewer+e2e-expired@example.com",
      stakeholderName: "External Reviewer",
      expiresInDays: -1,
    });

    await page.goto(`/approve/${review.token}`);
    await expect(page.getByRole("heading", { name: /link expired/i })).toBeVisible({ timeout: 15_000 });
  });
});
