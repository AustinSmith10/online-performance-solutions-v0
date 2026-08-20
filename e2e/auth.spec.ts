import { test, expect } from "playwright/test";
import { ACCOUNTS } from "./support/accounts";
import { loginAs } from "./support/login";

test.describe("Login", () => {
  test("consultant logs in and lands on the ops dashboard", async ({ page }) => {
    await loginAs(page, "consultant");
    await expect(page).toHaveURL(/\/ops/);
  });

  test("stakeholder logs in and lands on the client portal", async ({ page }) => {
    await loginAs(page, "stakeholder");
    await expect(page).toHaveURL(/\/portal/);
  });

  test("invalid credentials show an error and stay on /login", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(ACCOUNTS.stakeholder.email);
    await page.getByLabel("Password").fill("definitely-not-the-password");
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page.getByText(/invalid email or password/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});
