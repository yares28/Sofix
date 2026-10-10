import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { MOCK, resetBackend, smallText } from "./helpers";

test.describe("the daily missions page", () => {
  test.beforeEach(async ({ request }) => {
    await resetBackend(request);
  });

  test("recovers after the owner reloads an old extension without hiding the action", async ({ page }) => {
    await page.addInitScript(() => {
      let version = "0.3.8";
      window.addEventListener("test-extension-updated", () => { version = "0.3.10"; });
      const browser = window as unknown as { chrome: { runtime?: unknown } };
      browser.chrome ??= {};
      browser.chrome.runtime = { sendMessage: (_id: string, message: { type: string }, reply: (r: unknown) => void) => reply(message.type === "ping" ? { ok: true, version, sorareUser: null } : { ok: true, state: "ok", loaded: { limited: 3 } }) };
    });
    await page.goto("/missions");
    await expect(page.getByText(/Extension 0.3.8/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Check extension and load/ })).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event("test-extension-updated")));
    await page.getByRole("button", { name: /Check extension and load/ }).click();
    await expect(page.getByRole("status").filter({ hasText: "Loaded: 3 Limited missions" })).toBeVisible();
  });

  test("protects a correction when closing the editor or changing its date", async ({ page }) => {
    await page.goto("/missions");
    await page.getByRole("button", { name: "Edit my picks" }).first().click();
    const editor = page.getByRole("group", { name: /Edit picks/ });
    await editor.getByRole("textbox", { name: "Note (optional)" }).fill("Keep this correction");
    await page.getByRole("button", { name: "Close editor" }).click();
    const guard = page.getByRole("alertdialog", { name: "Unsaved correction" });
    await expect(guard).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await guard.getByRole("button", { name: "Keep editing" }).click();
    await expect(editor.getByRole("textbox", { name: "Note (optional)" })).toHaveValue("Keep this correction");
    await page.getByRole("navigation", { name: "Rarity" }).getByRole("link", { name: "Rare", exact: true }).click();
    await expect(guard).toBeVisible();
    await guard.getByRole("button", { name: "Keep editing" }).click();
    await page.getByRole("combobox", { name: "Mission date" }).selectOption("2026-10-05");
    await expect(guard).toBeVisible();
    await guard.getByRole("button", { name: "Discard changes" }).click();
    await expect(editor).toHaveCount(0);
  });

  test("shows card copies and previews a pasted sold-card link in the phone editor", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/missions");
    await page.getByRole("button", { name: "Edit my picks" }).first().click();
    const editor = page.getByRole("group", { name: /Edit picks/ });
    await editor.getByRole("button", { name: "I made no picks" }).click();
    await editor.getByRole("textbox", { name: "Missing or sold card? Paste its Sorare link" }).fill("https://sorare.com/football/cards/jan-oblak-2026-limited-42");
    await editor.getByRole("button", { name: "Add from Sorare link" }).click();
    await expect(editor.getByText("2026 · Copy #42")).toBeVisible();
    await editor.getByRole("button", { name: "Preview changes" }).click();
    await expect(editor.getByText(/Preview: jan-oblak/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("missions-editor-mobile.png"), fullPage: true });
  });

  test("waits for a current target before presenting scouting estimates", async ({ page, request }) => {
    await resetBackend(request, "missions-stale");
    await page.goto("/missions");
    const scout = page.getByRole("region", { name: "Choose your own picks" });
    await expect(scout.getByText(/Load today’s missions to compare/)).toBeVisible();
    await expect(scout.getByRole("searchbox")).toHaveCount(0);
    await expect(scout).not.toContainText("Target not modeled");
    await page.getByText("Mission window", { exact: true }).click();
    await expect(page.getByText(/Fallback game window/)).toBeVisible();
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
    const benchmark = page.locator(".ms-current-grid > div:last-child .ms-pick .who b");
    const before = await benchmark.allTextContents();
    expect(before.length).toBeGreaterThan(0);
    await scout.getByRole("checkbox").first().check();
    await expect(scout.getByLabel("Player comparison")).toBeVisible();
    await scout.getByRole("button", { name: "Shortlist", exact: true }).first().click();
    await expect(scout.getByRole("button", { name: "Remove from shortlist" })).toHaveCount(1);
    expect(await benchmark.allTextContents()).toEqual(before);
    await page.reload();
    await expect(scout.getByRole("button", { name: "Remove from shortlist" })).toHaveCount(1);
    expect(await benchmark.allTextContents()).toEqual(before);
    await scout.getByRole("searchbox", { name: "Search players" }).fill("No such player");
    await expect(scout.getByText(/No cards found/)).toBeVisible();
  });

  test("switches independent best cards and the mission plan, shows dated stats and links card art", async ({ page }) => {
    await page.goto("/missions");
    const selection = page.getByRole("group", { name: "Sofix selection", exact: true });
    await selection.getByRole("button", { name: "Best cards", exact: true }).click();
    await expect(selection.getByRole("button", { name: "Best cards", exact: true })).toHaveAttribute("aria-pressed", "true");
    const scout = page.getByRole("region", { name: "Choose your own picks" });
    const first = scout.locator(".ms-scout-list > li").first();
    await expect(first).toContainText("Last 10");
    await expect(first).toContainText("Subs");
    await expect(first).toContainText("2 DNP");
    await first.getByText("All recorded stats", { exact: true }).click();
    await expect(first.getByRole("row", { name: /Accurate passes/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await expect(first.locator("a.art")).toHaveAttribute("href", /^\/players\//);
    const history = page.getByRole("region", { name: "History" });
    await history.getByRole("group", { name: "History benchmark" }).getByRole("button", { name: "Best cards", exact: true }).click();
    await expect(history).toContainText("Forecast not recorded");
    await selection.getByRole("button", { name: "Mission plan", exact: true }).click();
    const names = await page.locator(".ms-current-grid > div:last-child .ms-pick .who > b").allTextContents();
    expect(new Set(names).size).toBe(names.length);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
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
    await expect(fifth).toHaveCount(1);
    await expect(fifth.locator(".ms-history-mission")).toHaveCount(2);
    await expect(fifth.locator(".ms-history-date")).toHaveCount(1);
    // 6 Oct: not checked yet, but both sides are there, and your picks carry Sorare's verdict already.
    await expect(sixth).toContainText("Results pending");
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
