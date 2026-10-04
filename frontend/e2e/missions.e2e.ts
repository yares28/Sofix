import { expect, test } from "@playwright/test";

test.describe("the daily missions page", () => {
  test("lists the open missions with their rule and reward and the cards that fit, each card once", async ({ page }) => {
    await page.goto("/missions");
    const root = page.getByTestId("missions-page");
    await expect(root).toBeVisible();
    await expect(root.getByRole("heading", { name: /Daily missions/ })).toBeVisible();
    for (const name of ["Decisive Picker", "Interception - All Matches", "Assist - All Matches"]) {
      await expect(root.getByRole("region", { name })).toBeVisible();
    }
    await expect(root.getByRole("region", { name: "Decisive Picker" })).toContainText("200 XP");
    await expect(root.getByRole("region", { name: "Interception - All Matches" })).toContainText("2+ interceptions");
    const names = await root.locator(".ms-pick .who b").allInnerTexts();
    expect(names.length).toBeGreaterThan(0);
    expect(new Set(names).size).toBe(names.length); // a card is in one mission only
    await expect(root.locator(".ms-pick .chance b").first()).toHaveText(/^\d+%$/);
    await expect(root.locator(".ms-pick .avg").first()).toContainText("last 5");
  });

  test("fits a phone without a sideways scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/missions");
    await expect(page.getByTestId("missions-page")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});
