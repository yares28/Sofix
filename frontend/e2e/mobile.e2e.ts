import { expect, test } from "@playwright/test";
import { offline, resetBackend, smallText } from "./helpers";

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

test("Play fits a phone: the plans, a lineup's sheet and the cards inside it", async ({ page }) => {
  await page.goto("/play");
  await expect(page.getByRole("heading", { level: 1, name: /Sorare GW17$/ })).toBeVisible();
  await expect(page.locator(".pl-lu")).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // The sheet fills the screen from the bottom, and nothing inside it spills sideways.
  await page.locator(".pl-lu").first().click();
  const sheet = page.getByRole("dialog", { name: "LALIGA EA SPORTS lineup" });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator(".pl-pc")).toHaveCount(5);
  const width = await page.evaluate(() => window.innerWidth);
  const box = (await sheet.locator(".pl-sheet").boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(width + 1);
  const overflow = await sheet.locator(".pl-pc .pl-fx").evaluateAll((nodes) =>
    nodes.filter((node) => node.scrollWidth > node.clientWidth + 1).length,
  );
  expect(overflow).toBe(0); // a long opponent name is cut with an ellipsis, it never widens the card

  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toBeHidden();
});

test("the phone's Sorare tiles and the gameweek just played fit without sideways scrolling", async ({ page }) => {
  for (const [path, ready] of [
    ["/", ".hm-play .hm-lurows > li"],
    ["/play?plan=2", ".pl-lu"],
    ["/play?gw=15&after=1", ".pl-lu .pl-kv b"],
  ] as const) {
    await page.goto(path);
    await expect(page.locator(ready).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), path).toBe(true);
  }
});

test("Lineups on a phone shows one team at a time and does not scroll sideways", async ({ page }) => {
  await page.goto("/lineups?m=22502");
  const home = page.getByRole("region", { name: "Real Sociedad lineup" });
  const away = page.getByRole("region", { name: "Deportivo lineup" });

  await expect(home).toBeVisible();
  await expect(away).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.locator('label[for="lu-side-away"]').click();
  await expect(away).toBeVisible();
  await expect(home).toBeHidden();
  await expect(away.locator(".lu-card")).toHaveCount(11);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("Lineups on a phone: the tap targets of the reading and the link are at least 44 px", async ({ page }) => {
  await page.goto("/lineups?m=22502");

  for (const target of [page.getByText(/^Read /).first(), page.getByRole("link", { name: "Open this match on Futbol Fantasy" })]) {
    const box = (await target.boundingBox())!;
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
  }
});

test("the home's team news fits a phone: one column, no sideways scrolling", async ({ page }) => {
  await page.goto("/");
  const news = page.getByRole("region", { name: "Team news" });

  await expect(news).toBeVisible();
  const columns = await news.locator(".hm-nw-col").evaluateAll((cols) => cols.map((col) => Math.round(col.getBoundingClientRect().left)));
  expect(new Set(columns).size).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("on a phone every text on Lineups, Cards and Players is 10 px or more", async ({ page }) => {
  for (const route of ["/lineups?m=22502", "/cards", "/players"]) {
    await page.goto(route);
    await page.waitForTimeout(600);
    expect(await smallText(page, 10), route).toEqual([]);
  }
});
