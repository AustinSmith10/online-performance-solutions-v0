import { expect, type Page } from "playwright/test";
import type { AccountKey } from "./accounts";
import { ACCOUNTS } from "./accounts";

/**
 * Drives the real /login form (app/(auth)/login) and waits for the
 * role-based redirect (see roleHomePath() in app/actions/auth.ts) — no
 * storageState shortcuts, since exercising the actual login journey is
 * part of what issue #155 asks this suite to cover.
 */
export async function loginAs(page: Page, account: AccountKey): Promise<void> {
  const { email, password, homePath } = ACCOUNTS[account];

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();

  await page.waitForURL(`**${homePath}**`, { timeout: 30_000 });
  await expect(page).toHaveURL(new RegExp(homePath.replace(/\//g, "\\/")));
}
