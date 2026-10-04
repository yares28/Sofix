import { expect, test } from "@playwright/test";

// The first planned player of the recording carries the picture of his game, and his slug has a stat sheet in lib/data/stat_sheets.json.
const SLUG = "juan-marcos-foyth";

test.describe("one player's page", () => {
  test("shows the picture of his game, the stat sheet with its picker, how he compares and his last starts", async ({ page }) => {
    await page.goto(`/players/${SLUG}`);
    const root = page.getByTestId("player-page");
    await expect(root).toBeVisible();
    await expect(root.locator(".pd-x")).toHaveText("52");
    await expect(root.locator(".pd-bars i")).toHaveCount(40);
    await expect(root.locator(".pd-range")).toContainText("Lands between 41 and 80, 8 times in 10");

    // The stat sheet opens on the next game when the game is priced, and one press moves it: one window at a time, never three side by side.
    const picker = root.getByRole("group", { name: "Which games" });
    await expect(picker.getByRole("button", { name: "Last 10" })).toBeVisible();
    await expect(picker.getByRole("button", { name: "Two seasons" })).toBeVisible();
    await picker.getByRole("button", { name: "Last 10" }).click();
    await expect(picker.getByRole("button", { name: "Last 10" })).toHaveAttribute("aria-pressed", "true");
    await expect(root.locator(".pd-row").first()).toBeVisible();
    await expect(root.locator(".pd-tot")).toContainText("All-around points");

    await expect(root.getByRole("heading", { name: /Compared with other/ })).toBeVisible();
    await expect(root.locator(".pd-rail")).not.toHaveCount(0);
    await expect(root.getByRole("heading", { name: /His last \d+ starts/ })).toBeVisible();
    await expect(root.locator(".pd-l10 > div")).toHaveCount(10);
  });

  test("says so for a player nobody knows, and links from the search", async ({ page }) => {
    const missing = await page.goto("/players/nobody-at-all");
    expect(missing?.status()).toBe(404);
    await page.goto("/players");
    const link = page.locator(".s5-who-link").first();
    if (await link.count()) {
      await link.click();
      await expect(page).toHaveURL(/\/players\/[a-z0-9-]+$/);
    }
  });

  test("fits a phone without a sideways scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/players/${SLUG}`);
    await expect(page.getByTestId("player-page")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
