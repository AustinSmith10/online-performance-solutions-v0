import path from "path";
import { test, expect } from "playwright/test";
import { loginAs } from "./support/login";
import { deleteProjects, ensureE2eTemplate, requireSeedFixtures, seedProject } from "./support/seed";
import { adminClient } from "./support/supabase";
import { isGotenbergReachable } from "./support/optional-deps";

const SAMPLE_DOCX = path.join(__dirname, "fixtures", "sample-pbdb.docx");

// The core "drop everything" journey end to end: assign -> generate/QA/
// dispatch the PBDB -> stakeholder approves -> convert & deliver the PBDR
// -> the client can download it.
//
// Client *submission* itself is covered separately (submission.spec.ts) —
// this test starts from an already-submitted project (seeded directly) so
// it isn't also gated on AI extraction being configured; it only needs a
// local Supabase instance + a reachable Gotenberg (docx -> pdf, used both
// at dispatch and at delivery).
test.describe("Full drop-everything journey", () => {
  const createdProjectIds: string[] = [];

  test.afterEach(async () => {
    await deleteProjects(createdProjectIds.splice(0));
  });

  test("assign -> dispatch -> approve -> convert & deliver -> client downloads the PBDR", async ({
    page,
  }) => {
    test.skip(
      !(await isGotenbergReachable()),
      "Gotenberg (docx->pdf conversion, GOTENBERG_URL) isn't reachable — both dispatch and delivery " +
        "need it. Start Gotenberg locally to exercise the full journey."
    );

    const { client, consultant, stakeholder } = await requireSeedFixtures();
    const template = await ensureE2eTemplate(client.id);
    const sb = adminClient();

    const project = await seedProject({
      clientId: client.id,
      submittedBy: stakeholder.id,
      status: "assigned",
      templateId: template.id,
      assignedConsultantId: consultant.id,
      creditDeducted: true, // upfront/credit already settled — isolates this test from the payment gate
    });
    createdProjectIds.push(project.id);

    // ── Consultant: generate, QA, dispatch ────────────────────────────────
    await loginAs(page, "consultant");
    await page.goto(`/ops/projects/${project.id}`);

    await page.getByRole("button", { name: /^generate pbdb$/i }).click();
    const downloadLink = page.getByRole("link", { name: /^download$/i });
    await expect(downloadLink).toBeVisible({ timeout: 20_000 });
    const downloadPromise = page.waitForEvent("download");
    await downloadLink.click();
    await downloadPromise;

    const uploadInput = page.locator('input[name="file"][type="file"]');
    await expect(uploadInput).toBeVisible({ timeout: 20_000 });
    await uploadInput.setInputFiles(SAMPLE_DOCX);
    await page.getByRole("button", { name: /upload completed pbdb/i }).click();

    const markQaButton = page.getByRole("button", { name: /mark qa complete/i });
    await expect(markQaButton).toBeVisible({ timeout: 20_000 });
    await markQaButton.click();

    const ackCheckbox = page.getByRole("checkbox", { name: /reviewed these and confirm/i });
    if (await ackCheckbox.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await ackCheckbox.check();
      await page.getByRole("button", { name: /acknowledge & continue/i }).click();
    }

    const dispatchButton = page.getByRole("button", { name: /dispatch to stakeholders/i });
    await expect(dispatchButton).toBeVisible({ timeout: 20_000 });
    await dispatchButton.click();
    await page.getByRole("button", { name: /^confirm$/i }).click();
    await expect(page.getByText(/dispatched to|dispatch scheduled/i)).toBeVisible({ timeout: 30_000 });

    // ── Stakeholder: approve via the dispatched token ─────────────────────
    const { data: review } = await sb
      .from("stakeholder_reviews")
      .select("token")
      .eq("project_id", project.id)
      .eq("status", "pending")
      .limit(1)
      .single();
    expect(review?.token).toBeTruthy();

    const approvalPage = await page.context().newPage();
    await approvalPage.goto(`/approve/${review!.token as string}`);
    await approvalPage.getByRole("button", { name: /^approve$/i }).click();
    await expect(approvalPage.getByText(/response recorded/i)).toBeVisible({ timeout: 15_000 });
    await approvalPage.close();

    // ── Consultant: convert & deliver the PBDR ────────────────────────────
    await page.goto(`/ops/projects/${project.id}`);
    const convertButton = page.getByRole("button", { name: /convert.*deliver pbdr/i });
    await expect(convertButton).toBeVisible({ timeout: 20_000 });
    await convertButton.click();
    await page.getByRole("button", { name: /^confirm$/i }).click();
    await expect(page.getByText(/delivered|converted/i).first()).toBeVisible({ timeout: 60_000 });

    const { data: deliveredProject } = await sb
      .from("projects")
      .select("status")
      .eq("id", project.id)
      .single();
    expect(deliveredProject?.status).toBe("delivered");

    const { data: pbdrFile } = await sb
      .from("project_files")
      .select("id")
      .eq("project_id", project.id)
      .eq("file_type", "pbdr")
      .maybeSingle();
    expect(pbdrFile).toBeTruthy();

    // ── Client: can see and download the delivered PBDR ───────────────────
    const clientPage = await page.context().newPage();
    await loginAs(clientPage, "stakeholder");
    await clientPage.goto(`/portal/projects/${project.id}`);
    await expect(clientPage.getByRole("link", { name: /download report/i })).toBeVisible({
      timeout: 20_000,
    });
    await clientPage.close();
  });
});
