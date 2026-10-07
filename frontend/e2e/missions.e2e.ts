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

  test("keeps a history of mission days, newest first: Sofix's picks and yours as soon as they are written, the score once the games are checked", async ({ page }) => {
    await page.goto("/missions");
    const history = page.getByRole("region", { name: "History" });
    const days = history.getByRole("listitem").filter({ has: page.locator(".au-ms-head") });
    await expect(days).toHaveCount(2);
    // 6 Oct: not checked yet, but both sides are there, and your picks carry Sorare's verdict already.
    await expect(days.first()).toContainText("Tue 6 Oct");
    await expect(days.first()).toContainText("Checked a day after the games");
    await expect(days.first().getByRole("list", { name: "Sofix's picks" })).toContainText("Pedri, waiting for his game");
    await expect(days.first().getByRole("list", { name: "Your picks" })).toContainText("Jan Oblak, did not");
    // 5 Oct: checked, Sofix caught one of the three that did it.
    await expect(days.nth(1)).toContainText("Sofix 1 of 3");
    await expect(days.nth(1).getByRole("list", { name: "Sofix's picks" })).toContainText("Arda Güler, did it, not picked");
    await expect(history.getByRole("link", { name: "How often Sofix was right" })).toHaveAttribute("href", "/audit/missions");
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
