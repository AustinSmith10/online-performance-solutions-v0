import path from "path";
import { test, expect } from "playwright/test";
import { loginAs } from "./support/login";
import { findActiveTemplate, requireSeedFixtures } from "./support/seed";
import { hasAnthropicKey } from "./support/optional-deps";

const SAMPLE_PDF = path.join(__dirname, "fixtures", "sample.pdf");

test.describe("Client submission", () => {
  test.beforeEach(async () => {
    const { client } = await requireSeedFixtures();
    const template = await findActiveTemplate(client.id);

    test.skip(
      !template,
      "No active template found for the seed client — run scripts/seed-templates.ts " +
        "against your local Supabase instance first."
    );
    test.skip(
      !!template?.requiresExtraction && !hasAnthropicKey(),
      "The active template has file requirements needing AI extraction, but ANTHROPIC_API_KEY " +
        "isn't set for the dev server — skipping rather than failing on an unconfigured dependency."
    );
  });

  test("stakeholder submits a new project request end to end", async ({ page }) => {
    await loginAs(page, "stakeholder");

    await page.goto("/portal/submit");

    // Report type — only rendered when the client has more than one active
    // template; pick whichever is first when present.
    const templateSelect = page.getByLabel("Report type");
    if (await templateSelect.isVisible().catch(() => false)) {
      await templateSelect.selectOption({ index: 1 });
    }

    // Every FileSlot renders a visually-hidden <input type="file">; fill them
    // all with the same fixture PDF so every required slot has ≥1 file.
    const fileInputs = page.locator('input[type="file"]');
    const inputCount = await fileInputs.count();
    expect(inputCount).toBeGreaterThan(0);
    for (let i = 0; i < inputCount; i++) {
      await fileInputs.nth(i).setInputFiles(SAMPLE_PDF);
    }

    // The per-file verify/extract pipeline is async (real Supabase Storage
    // round-trip + extraction) — give it a generous timeout and assert on
    // the Continue button's own gate (continueGate.ts) rather than polling
    // individual status badges.
    const continueButton = page.getByRole("button", { name: /^continue$/i });
    await expect(continueButton).toBeEnabled({ timeout: 120_000 });
    await continueButton.click();

    // Review step — fill in any required field the extraction pipeline
    // didn't already populate from the (synthetic) fixture PDF.
    const reviewForm = page.locator("form").filter({
      has: page.getByRole("button", { name: /submit report request/i }),
    });
    await expect(reviewForm).toBeVisible({ timeout: 30_000 });

    const requiredInputs = reviewForm.locator(
      'input[required]:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])'
    );
    const requiredCount = await requiredInputs.count();
    for (let i = 0; i < requiredCount; i++) {
      const input = requiredInputs.nth(i);
      if ((await input.inputValue()) === "") {
        await input.fill("E2E Test Value");
      }
    }

    const requiredSelects = reviewForm.locator("select[required]");
    const selectCount = await requiredSelects.count();
    for (let i = 0; i < selectCount; i++) {
      const select = requiredSelects.nth(i);
      if ((await select.inputValue()) === "") {
        await select.selectOption({ index: 1 });
      }
    }

    await reviewForm.locator('input[name="reviewed_confirmed"]').check();

    const submitButton = reviewForm.getByRole("button", { name: /submit report request/i });
    await expect(submitButton).toBeEnabled();
    await submitButton.click();

    // submitProject() redirects a stakeholder actor to
    // /portal/projects/[id]?submitted=1 (app/actions/submission.ts).
    await page.waitForURL(/\/portal\/projects\/[^/?]+\?submitted=1/, { timeout: 30_000 });
    await expect(page.getByText(/submitted/i).first()).toBeVisible();
  });
});
