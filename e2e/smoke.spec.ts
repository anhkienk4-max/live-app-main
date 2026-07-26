import { test, expect } from "@playwright/test";

test("app opens in browser", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/127\.0\.0\.1:3101/);
  await expect(page.locator("body")).toBeVisible();
});
