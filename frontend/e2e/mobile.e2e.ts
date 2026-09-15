import { expect, test } from "@playwright/test";
import { offline, resetBackend } from "./helpers";

test.beforeEach(async ({ page, request }) => {
  await resetBackend(request);
  await offline(page);
});

test("phone layout shows five gameweeks without scrolling the page sideways", async ({ page }) => {
  await page.goto("/");
  const scroll = page.locator(".scroll");
  await expect(scroll).toBeVisible();
  const box = (await scroll.boundingBox())!;
  const headers = await page.locator("thead th").evaluateAll((cells) =>
    cells.map((cell) => {
      const rect = cell.getBoundingClientRect();
      return { text: cell.textContent ?? "", left: rect.left, right: rect.right };
    }),
  );
  const visibleMatchdays = headers.filter((h) => h.text.startsWith("GW") && h.left >= box.x - 1 && h.right <= box.x + box.width + 1);
  expect(visibleMatchdays.length).toBeGreaterThanOrEqual(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const toolbarRows = await page.locator(".toolbar-nav, .toolbar .search, .toolbar-controls").evaluateAll((els) =>
    new Set(els.map((el) => Math.round(el.getBoundingClientRect().top / 10))).size,
  );
  expect(toolbarRows).toBeLessThanOrEqual(2);
});

test("Overview, Fixtures and Table fit a phone without sideways page scrolling", async ({ page }) => {
  for (const [path, ready] of [
    ["/", ".ladder-card .list-rows > li"],
    ["/?h=8", ".ladder-card .list-rows > li"],
    ["/?h=next&lens=odds", ".ladder-card .list-rows .next-line"],
    ["/?h=3", ".ladder-card .list-rows .tile"],
    ["/?view=plain", ".fixture-row"],
    ["/?view=table&t=predicted", "table.standings tbody tr"],
  ] as const) {
    await page.goto(path);
    await expect(page.locator(ready).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), path).toBe(true);
  }
});
