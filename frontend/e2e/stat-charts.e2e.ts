import { expect, test } from "@playwright/test";
import { offline, resetBackend, smallText } from "./helpers";

// The Stats page's charts read /api/stat-charts, which the mock API builds from the recorded sheets and market
// (e2e/mock-api.mjs statCharts): every recorded player with five starts, all in LaLiga.

test.beforeEach(async ({ page, request }) => {
  await resetBackend(request);
  await offline(page);
});

test("Stats charts: a scatter that opens a player's card on hover, one league menu with All, and the four time windows", async ({ page }) => {
  await page.goto("/stats");
  const section = page.locator(".sc");
  await section.scrollIntoViewIfNeeded();
  await expect(section.getByRole("heading", { level: 2 })).toHaveText("Who sticks out");
  await expect(section.getByRole("group", { name: "Time" }).getByRole("button")).toHaveText(["Season", "L5", "L10", "L40"]);
  const svg = section.locator(".sc-canvas svg").first();
  await expect(svg).toBeVisible({ timeout: 30_000 });

  // one league button opens the list, All leagues first
  await section.getByRole("button", { name: /^LaLiga/ }).click();
  const items = section.getByRole("menuitemradio");
  await expect(items.first()).toContainText("All leagues");
  await expect(items).toHaveCount(6);
  await items.first().click();
  await expect(section.getByRole("button", { name: /^All leagues/ })).toBeVisible();

  // hovering a dot shows his card, his two numbers and his place
  const box = (await svg.boundingBox())!;
  let shown = false;
  for (let i = 0; i < 12 && !shown; i++) {
    await page.mouse.move(box.x + box.width * (0.15 + 0.06 * i), box.y + box.height * 0.6);
    shown = await section.locator(".sc-pop").isVisible();
  }
  expect(shown).toBe(true);
  await expect(section.locator(".sc-pop .sc-pop-line")).toHaveCount(2);
  await expect(section.locator(".sc-pop")).toContainText(/(st|nd|rd|th) of \d+ players/);

  // an action stat and a window: the chart redraws, never a 0 for a player off the stat's sheet
  await section.getByLabel("Along the bottom").selectOption("poss_won");
  await section.getByRole("button", { name: "FWD" }).click();
  await expect(section.locator(".sc-empty")).toHaveText("Possession won is not on a FWD's stat sheet");
  await section.getByRole("button", { name: "L10" }).click();
  await expect(section.getByRole("button", { name: "L10" })).toHaveAttribute("aria-pressed", "true");
});

test("Stats charts: clubs, face-off and look-alikes", async ({ page }) => {
  await page.goto("/stats");
  const section = page.locator(".sc");
  await section.scrollIntoViewIfNeeded();
  await expect(section.locator(".sc-canvas svg").first()).toBeVisible({ timeout: 30_000 });

  await section.getByRole("tab", { name: "Clubs" }).click();
  await expect(section.getByRole("heading", { level: 2 })).toHaveText("Who carries the club");
  await expect(section.locator(".sc-canvas svg circle").first()).toBeVisible({ timeout: 30_000 });

  await section.getByRole("tab", { name: "Face-off" }).click();
  await expect(section.locator(".sc-picked li")).toHaveCount(3, { timeout: 30_000 });
  await section.locator(".sc-picked li").first().getByRole("button", { name: /^Remove/ }).click();
  await expect(section.locator(".sc-picked li")).toHaveCount(2);
  await section.getByRole("searchbox").fill("a");
  await section.locator(".sc-hit:not([disabled])").first().click();
  await expect(section.locator(".sc-picked li")).toHaveCount(3);
  await expect(section.locator(".sc-picked li").first()).toContainText(/Top \d+%/);

  await section.getByRole("tab", { name: "Look-alikes" }).click();
  await expect(section.getByRole("heading", { level: 2 })).toHaveText("Plays like him");
  const hub = section.locator(".sc-hub-name");
  const first = (await hub.textContent())!;
  const node = section.locator(".sc-node:not(.hub)").first();
  await expect(node).toBeVisible({ timeout: 30_000 });
  await node.click();
  await expect(hub).not.toHaveText(first);
  await section.locator(".sc-back").click();
  await expect(hub).toHaveText(first);
});

test("Stats charts keep the text floor and fit a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/stats");
  const section = page.locator(".sc");
  await section.scrollIntoViewIfNeeded();
  await expect(section.locator(".sc-canvas svg").first()).toBeVisible({ timeout: 30_000 });
  for (const tab of ["Clubs", "Face-off", "Look-alikes"]) {
    await section.getByRole("tab", { name: tab }).click();
    await page.waitForTimeout(500);
    expect(await smallText(page, 10)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
