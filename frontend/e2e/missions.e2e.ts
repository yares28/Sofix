import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { MOCK, resetBackend, smallText } from "./helpers";

test.describe("the daily missions page", () => {
  test.beforeEach(async ({ request }) => {
    await resetBackend(request);
  });

  test("offers scouting and a previewable correction for historical picks", async ({ page }) => {
    await page.goto("/missions");
    await expect(page.getByRole("region", { name: "Choose your own picks" })).toBeVisible();
    await expect(page.getByRole("searchbox", { name: "Search players" })).toBeVisible();
    await page.getByRole("button", { name: "Edit my picks" }).first().click();
    const editor = page.getByRole("group", { name: /Edit picks/ }).first();
    await expect(editor.getByText(/Changes only your Sofix history/)).toBeVisible();
    await editor.getByRole("button", { name: "I made no picks" }).click();
    await editor.getByRole("button", { name: "Preview changes" }).click();
    await expect(editor.getByText("Preview: no picks" )).toBeVisible();
    await expect(editor.getByRole("button", { name: "Save correction" })).toBeVisible();
  });

  test("scouts players, compares evidence and persists a local shortlist", async ({ page }) => {
    await page.goto("/missions");
    const scout = page.getByRole("region", { name: "Choose your own picks" });
    await scout.getByRole("checkbox").first().check();
    await expect(scout.getByLabel("Player comparison")).toBeVisible();
    await scout.getByRole("button", { name: "Shortlist", exact: true }).first().click();
    await expect(scout.getByRole("button", { name: "Remove from shortlist" })).toHaveCount(1);
    await page.reload();
    await expect(scout.getByRole("button", { name: "Remove from shortlist" })).toHaveCount(1);
    await scout.getByRole("searchbox", { name: "Search players" }).fill("No such player");
    await expect(scout.getByText(/No cards found/)).toBeVisible();
  });

  test("saves an explicit no-picks correction, shows it after reload and on Audit, then restores the import", async ({ page, request }) => {
    await page.route("**/api/missions/history", async (route) => {
      const input = route.request().postDataJSON() as { picks: unknown[]; restore: boolean };
      expect(route.request().headers()["x-fdr-refresh"]).toBe("1");
      if (!input.restore) expect(input.picks).toEqual([]);
      await request.post(`${MOCK}/__test/mode?correction=${input.restore ? "" : "empty"}`);
      await route.fulfill({ json: { ok: true, data: { revision: input.restore ? 2 : 1 } } });
    });
    await page.goto("/missions");
    const sixth = page.getByRole("region", { name: "History" }).locator(".au-ms-days > li").filter({ hasText: "Tue 6 Oct" });
    await sixth.getByRole("button", { name: "Edit my picks" }).click();
    await sixth.getByRole("button", { name: "I made no picks" }).click();
    await sixth.getByRole("button", { name: "Preview changes" }).click();
    await sixth.getByRole("button", { name: "Save correction" }).click();
    await expect(sixth).toContainText("Corrected by you");
    await page.reload();
    await expect(sixth).toContainText("You recorded no picks.");
    await page.goto("/audit/missions");
    await expect(page.getByRole("region", { name: "Limited history" })).toContainText("Corrected by you");
    const missing = page.getByRole("region", { name: "Limited history" }).locator(".au-ms-days > li").filter({ hasText: "Wed 7 Oct" });
    await expect(missing).toContainText("Assumed Decisive Picker");
    await page.goto("/missions");
    await sixth.getByRole("button", { name: "Edit my picks" }).click();
    await sixth.getByRole("button", { name: "Restore imported picks" }).click();
    await expect(sixth).not.toContainText("Corrected by you");
    await expect(sixth.getByRole("list", { name: "Your picks" })).toContainText("Jan Oblak");
  });

  test("lists the open missions with their rule and reward and the cards that fit, each card once", async ({ page }, testInfo) => {
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
    await expect(root.getByRole("region", { name: "Choose your own picks" })).toContainText("Spain v France");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("missions-populated-desktop.png"), fullPage: true });
    // ...and never names another day (the heading names today, so the check is for tomorrow, whatever day this runs).
    const tomorrow = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "Europe/Madrid" }).format(new Date(Date.now() + 86_400_000));
    await expect(root).not.toContainText(tomorrow);
  });

  test("keeps a history of mission days, newest first: Sofix's picks and yours as soon as they are written, the score once the games are checked", async ({ page }) => {
    await page.goto("/missions");
    const history = page.getByRole("region", { name: "History" });
    const days = history.getByRole("listitem").filter({ has: page.locator(".au-ms-head") });
    expect(await days.count()).toBeGreaterThanOrEqual(2);
    const sixth = days.filter({ hasText: "Tue 6 Oct" });
    const fifth = days.filter({ hasText: "Mon 5 Oct" });
    // 6 Oct: not checked yet, but both sides are there, and your picks carry Sorare's verdict already.
    await expect(sixth).toContainText("Incomplete / pending evidence");
    await expect(sixth.getByRole("list", { name: "Sofix's picks" })).toContainText("Pedri, waiting for his game");
    await expect(sixth.getByRole("list", { name: "Your picks" })).toContainText("Jan Oblak, did not");
    // 5 Oct: checked, Sofix caught one of the three that did it.
    await expect(fifth).toContainText("Sofix 1 of 3");
    await expect(fifth.getByRole("list", { name: "Missed achievers" })).toContainText("Arda Güler, did it, not picked");
    await expect(history.getByRole("link", { name: "How often Sofix was right" })).toHaveAttribute("href", "/audit/missions");
  });

  test("fits a phone without a sideways scroll", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/missions");
    await expect(page.getByTestId("missions-page")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: testInfo.outputPath("missions-populated-mobile.png"), fullPage: true });
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
