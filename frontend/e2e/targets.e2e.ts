import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import fixture from "./fixtures/reward-bars-response.json";
import { offline, resetBackend, smallText } from "./helpers";

// Targets draws the block the refresh publishes (e2e/fixtures/reward-bars-response.json: the real cut-offs of 14 finished weeks,
// built by backend/app/sorare/reward_bars.py). Nothing here recomputes a bar: it checks the numbers reach the page, and pin/hide.

const comps = fixture.data.competitions;
const laliga = comps.find((c) => c.key === "LALIGA EA SPORTS | Limited")!;

test.beforeEach(async ({ page, request }) => {
  await resetBackend(request);
  await offline(page);
});

test("every competition sits on one scale, LaLiga is pinned first, and every bar reaches its group's list", async ({ page }) => {
  await page.goto("/targets");
  await expect(page.getByRole("heading", { level: 1, name: "What wins something" })).toBeVisible();
  await expect(page.getByText(`Average over ${fixture.data.weeks.length} finished gameweeks, latest ${fixture.data.latest}`)).toBeVisible();
  await expect(page.getByRole("link", { name: "Targets" })).toHaveAttribute("aria-current", "page");

  const measured = comps.filter((c) => c.bar !== null);
  await expect(page.locator(".tg-dot")).toHaveCount(measured.length);
  const tile = page.getByRole("region", { name: "Pinned" }).getByRole("article", { name: "LaLiga" });
  await expect(tile).toContainText(String(Math.round(laliga.bar!)));
  await expect(tile).toContainText("Top 1,500 · 250 essence");

  const groups = { "In-season": "In-season", Classic: "Classic", Room: "Rooms" } as const;
  for (const [group, label] of Object.entries(groups)) {
    await page.getByRole("group", { name: "Kind of competition" }).getByRole("button", { name: label, exact: true }).click();
    const inGroup = comps.filter((c) => c.group === group);
    const list = page.locator(".tg-list");
    for (let i = 0; i < inGroup.length; i += 10) {
      for (const c of inGroup.slice(i, i + 10)) {
        const row = list.locator(".tg-row").filter({ hasText: c.name }).filter({ has: page.getByRole("button", { name: `Hide ${c.name}${c.rarity ? ` ${c.rarity}` : ""}`, exact: true }) });
        await expect(row.first().locator(".tg-row-num")).toHaveText(c.bar === null ? /read yet/ : String(Math.round(c.bar)));
      }
      if (i + 10 < inGroup.length) await page.getByRole("button", { name: "Next page" }).click();
    }
  }
  await page.getByRole("button", { name: "Not read", exact: true }).click();
  // Competitions whose reward table was never read come first, then the leagues you have no cards in.
  await expect(page.locator(".tg-list")).toContainText("Reward table not read yet");
  const next = page.getByRole("button", { name: "Next page" });
  while (await next.isVisible() && await next.isEnabled()) await next.click();
  await expect(page.locator(".tg-list")).toContainText("No cards in this league");
});

test("pins and hidden competitions follow your clicks and stay after a reload", async ({ page }) => {
  await page.goto("/targets");
  await page.getByRole("button", { name: "Classic", exact: true }).click();
  await page.getByRole("button", { name: "Pin Champion limited", exact: true }).click();
  const pinned = page.getByRole("region", { name: "Pinned" });
  await expect(pinned.getByRole("article")).toHaveCount(2);
  await expect(page.locator(".tg-flag")).toHaveCount(2);

  await page.getByRole("button", { name: "Hide All Star rare", exact: true }).click();
  await expect(page.getByRole("button", { name: "Hide All Star rare", exact: true })).toHaveCount(0);
  await page.reload();
  await expect(pinned.getByRole("article")).toHaveCount(2);
  await page.getByText("Hidden (1)").click();
  await page.getByRole("button", { name: "Show All Star rare" }).click();
  await expect(page.getByText("Hidden (1)")).toHaveCount(0);

  // A dot on the ruler pins too, and unpins.
  const dot = page.getByRole("button", { name: /^LaLiga limited: \d+ points\. Unpin$/ });
  await dot.click();
  await expect(pinned.getByRole("article", { name: "LaLiga" })).toHaveCount(0);
});

test("reads at 1440 and 390 px with no small text, no overflow and no accessibility violations", async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/targets");
    await expect(page.locator(".tg-tile")).toHaveCount(1);
    expect(await smallText(page, width === 390 ? 10 : 11)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    expect((await new AxeBuilder({ page }).include(".tg").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  }
});

test("before the first refresh writes it, the page says so", async ({ page, request }) => {
  await resetBackend(request, "no-sorare");
  await page.goto("/targets");
  await expect(page.getByText("Waiting for the first refresh to record the cut-offs")).toBeVisible();
});
