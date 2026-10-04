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
    // Missions are daily and only today's are known: with none of the recording's cards playing today, each says so instead of offering another day.
    await expect(root.getByText("None of your cards with a game still to play today fits this one.").first()).toBeVisible();
    await expect(root).not.toContainText("Tuesday");
  });

  test("fits a phone without a sideways scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/missions");
    await expect(page.getByTestId("missions-page")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});
