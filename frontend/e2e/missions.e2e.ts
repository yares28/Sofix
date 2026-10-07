import { expect, test } from "@playwright/test";
import { resetBackend, smallText } from "./helpers";

test.describe("the daily missions page", () => {
  test.beforeEach(async ({ request }) => {
    await resetBackend(request);
  });

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
    // ...and never names another day (the heading names today, so the check is for tomorrow, whatever day this runs).
    const tomorrow = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "Europe/Madrid" }).format(new Date(Date.now() + 86_400_000));
    await expect(root).not.toContainText(tomorrow);
  });

  test("fits a phone without a sideways scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/missions");
    await expect(page.getByTestId("missions-page")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });

  test("never shows an older list as today's: it shows no mission, says when the last list was loaded, and keeps the Load button to retry without the extension", async ({ page, request }) => {
    await resetBackend(request, "missions-stale");
    await page.goto("/missions");
    const root = page.getByTestId("missions-page");
    await expect(root.getByRole("status").filter({ hasText: "aren’t loaded yet" })).toContainText("Last loaded");
    await expect(root.locator(".ms-mission")).toHaveCount(0);
    // This browser has no Sofix extension: it says so and keeps Load, so a sleeping extension can be asked again.
    await expect(root.getByText("Couldn’t reach the Sofix extension in this browser. Press Load to try again.")).toBeVisible();
    await expect(root.getByRole("button", { name: /Load today/ })).toBeVisible();
    expect(await smallText(page, 11)).toEqual([]);
  });
});
