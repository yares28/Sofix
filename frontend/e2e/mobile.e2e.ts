import { expect, test } from "@playwright/test";
import { offline, resetBackend } from "./helpers";

test.beforeEach(async ({ page, request }) => {
  await resetBackend(request);
  await offline(page);
});

test("phone layout shows five gameweeks without scrolling the page sideways", async ({ page }) => {
  await page.goto("/difficulty");
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

test("the Control Center fits a phone, with the map drawn as a column", async ({ page }) => {
  await page.goto("/control");
  await expect(page.getByRole("heading", { level: 1, name: "Control Center" })).toBeVisible();
  await expect(page.getByRole("list", { name: "How it runs" })).toBeVisible();
  await expect(page.getByRole("img", { name: /^GitHub runs the jobs on a clock/ })).toBeHidden();
  await expect(page.locator(".cc-qrrow")).toBeHidden(); // a phone can't scan its own screen
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("the home fits a phone, and the tab bar moves between pages", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".hm-mosaic .m-row").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const tabs = page.getByRole("navigation", { name: "Sections" });
  await expect(tabs.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
  await tabs.getByRole("link", { name: "Table" }).click();
  await expect(page).toHaveURL(/\/table$/, { timeout: 30_000 });
  await expect(tabs.getByRole("link", { name: "Table" })).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".board-tabs")).toBeHidden(); // the tab bar replaces the page's own tabs on phones
});

test("Overview, Fixtures and Table fit a phone without sideways page scrolling", async ({ page }) => {
  for (const [path, ready] of [
    ["/difficulty", ".ladder-card .list-rows > li"],
    ["/difficulty?h=8", ".ladder-card .list-rows > li"],
    ["/difficulty?h=next&lens=odds", ".ladder-card .list-rows .next-line"],
    ["/difficulty?h=3", ".ladder-card .list-rows .tile"],
    ["/fixtures", ".fixture-row"],
    ["/table?t=predicted", "table.standings tbody tr"],
  ] as const) {
    await page.goto(path);
    await expect(page.locator(ready).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), path).toBe(true);
  }
});
