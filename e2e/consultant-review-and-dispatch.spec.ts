import path from "path";
import { test, expect } from "playwright/test";
import { loginAs } from "./support/login";
import {
  deleteProjects,
  ensureE2eTemplate,
  requireSeedFixtures,
  seedProject,
} from "./support/seed";
import { adminClient } from "./support/supabase";
import { isGotenbergReachable } from "./support/optional-deps";

const SAMPLE_DOCX = path.join(__dirname, "fixtures", "sample-pbdb.docx");

test.describe("Consultant assign & review", () => {
  const createdProjectIds: string[] = [];

  test.afterEach(async () => {
    await deleteProjects(createdProjectIds.splice(0));
  });

  test("consultant can pick up an available job from the pool", async ({ page }) => {
    const { client, stakeholder } = await requireSeedFixtures();
    const project = await seedProject({
      clientId: client.id,
      submittedBy: stakeholder.id,
      status: "submitted",
    });
    createdProjectIds.push(project.id);

    await loginAs(page, "consultant");
    await page.goto("/ops");

    await page.getByRole("button", { name: /available jobs/i }).click();
    const card = page.getByText(project.projectNumber).or(page.getByText(`PO-${project.projectNumber.slice(4)}`));
    await expect(card.first()).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: /pick up/i }).first().click();
    await page.getByRole("button", { name: /yes, pick up job/i }).click();

    await page.waitForURL(new RegExp(`/ops/projects/${project.id}\\?picked_up=1`), { timeout: 15_000 });

    const sb = adminClient();
    const { data: updated } = await sb
      .from("projects")
      .select("status, assigned_consultant_id")
      .eq("id", project.id)
      .single();
    expect(updated?.status).toBe("assigned");
  });

  test("consultant generates, QA-uploads, and dispatches a PBDB to stakeholders", async ({ page }) => {
    test.skip(
      !(await isGotenbergReachable()),
      "Gotenberg (docx->pdf conversion, GOTENBERG_URL) isn't reachable — dispatch needs it to render " +
        "the stakeholder-facing PDF. Start Gotenberg locally to exercise this stage."
    );

    const { client, consultant, stakeholder } = await requireSeedFixtures();
    const template = await ensureE2eTemplate(client.id);

    const project = await seedProject({
      clientId: client.id,
      submittedBy: stakeholder.id,
      status: "assigned",
      templateId: template.id,
      assignedConsultantId: consultant.id,
    });
    createdProjectIds.push(project.id);

    await loginAs(page, "consultant");
    await page.goto(`/ops/projects/${project.id}`);

    // 1. Generate the PBDB draft (local docxtemplater render, no Gotenberg needed).
    await page.getByRole("button", { name: /^generate pbdb$/i }).click();
    const downloadLink = page.getByRole("link", { name: /^download$/i });
    await expect(downloadLink).toBeVisible({ timeout: 20_000 });

    const downloadPromise = page.waitForEvent("download");
    await downloadLink.click();
    await downloadPromise;

    // 2. Upload the QA'd (corrected) copy — this is the version >= 2 that
    // unlocks "Mark QA complete".
    const uploadInput = page.locator('input[name="file"][type="file"]');
    await expect(uploadInput).toBeVisible({ timeout: 20_000 });
    await uploadInput.setInputFiles(SAMPLE_DOCX);
    await page.getByRole("button", { name: /upload completed pbdb/i }).click();

    // 3. Mark QA complete.
    const markQaButton = page.getByRole("button", { name: /mark qa complete/i });
    await expect(markQaButton).toBeVisible({ timeout: 20_000 });
    await markQaButton.click();

    // 4. If the upload triggered structure-scan findings, acknowledge them
    // before Dispatch unlocks (PbdbSendPreview.tsx) — otherwise it's already
    // visible.
    const ackCheckbox = page.getByRole("checkbox", { name: /reviewed these and confirm/i });
    if (await ackCheckbox.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await ackCheckbox.check();
      await page.getByRole("button", { name: /acknowledge & continue/i }).click();
    }

    // 5. Dispatch.
    const dispatchButton = page.getByRole("button", { name: /dispatch to stakeholders/i });
    await expect(dispatchButton).toBeVisible({ timeout: 20_000 });
    await dispatchButton.click();
    await page.getByRole("button", { name: /^confirm$/i }).click();

    await expect(page.getByText(/dispatched to|dispatch scheduled/i)).toBeVisible({ timeout: 30_000 });

    const sb = adminClient();
    const { data: updatedProject } = await sb
      .from("projects")
      .select("status")
      .eq("id", project.id)
      .single();
    expect(["dispatched"]).toContain(updatedProject?.status);

    const { data: reviews } = await sb
      .from("stakeholder_reviews")
      .select("id, token, status")
      .eq("project_id", project.id);
    expect(reviews?.length ?? 0).toBeGreaterThan(0);
    expect(reviews?.every((r) => !!r.token && r.status === "pending")).toBe(true);
  });
});
