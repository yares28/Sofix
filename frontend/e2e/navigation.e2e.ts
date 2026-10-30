import { expect, test } from "@playwright/test";
import { offline, resetBackend } from "./helpers";
import { holdNavigation, navigationSweep } from "./navigationChecks";

test.beforeEach(async ({ page, request }) => {
  await resetBackend(request);
  await offline(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("every page has immediate destination feedback and matching desktop page bounds", async ({ page }) => {
  test.setTimeout(240_000);
  await navigationSweep(page, 1440);
});

test("a cold page switch shows the destination skeleton before its response, keeping navigation usable", async ({ page }) => {
  await page.goto("/");
  const release = await holdNavigation(page, "/cards");
  try {
    await page.locator(".nav-links").getByRole("link", { name: "Gallery", exact: true }).click();
    const loading = page.getByRole("main", { name: "Loading Gallery" });
    await expect(loading).toBeVisible();
    await expect(loading).toHaveAttribute("aria-busy", "true");
    await expect(loading.locator(".gl-hero")).toBeVisible();
    await expect(page.getByRole("status", { name: "Page loading" })).toHaveText("Loading Gallery…");
    await expect(page.locator(".lens").getByRole("link", { name: "Players", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Gameweek/ })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
  } finally { release(); }
  await expect(page).toHaveURL(/\/cards/);
  await expect(page.locator("main[aria-busy=true]")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Your gallery", exact: true })).toBeVisible();
});

test("revisiting a page preserves measured card and text geometry during loading", async ({ page }) => {
  await page.goto("/cards");
  await expect(page.locator(".s5-pc .art").first()).toBeVisible();
  const card = await page.locator(".s5-pc .art").first().boundingBox();
  await page.locator(".lens").getByRole("link", { name: "Players", exact: true }).click();
  await expect(page).toHaveURL(/\/players/);
  const release = await holdNavigation(page, "/cards");
  try {
    await page.locator(".lens").getByRole("link", { name: "Cards", exact: true }).click();
    const loading = page.getByRole("main", { name: "Loading Gallery" });
    await expect(loading).toHaveAttribute("data-layout", "measured");
    const rects = await loading.locator("[data-shape=surface]").evaluateAll((els) => els.map(el => {
      const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height };
    }));
    expect(rects.some(r => card && Math.abs(r.x - card.x) < 1 && Math.abs(r.y - card.y) < 1 && Math.abs(r.width - card.width) < 1 && Math.abs(r.height - card.height) < 1)).toBe(true);
  } finally { release(); }
  await expect(page.locator("main[aria-busy=true]")).toHaveCount(0);
});

test("old geometry expires instead of assuming the page still has the same content", async ({ page }) => {
  await page.goto("/cards");
  await page.locator(".lens").getByRole("link", { name: "Players", exact: true }).click();
  await expect(page).toHaveURL(/\/players/);
  await page.clock.setSystemTime(Date.now() + 6 * 60_000);
  const release = await holdNavigation(page, "/cards");
  try {
    await page.locator(".lens").getByRole("link", { name: "Cards", exact: true }).click();
    await expect(page.getByRole("main", { name: "Loading Gallery" })).toHaveAttribute("data-layout", "cards");
  } finally { release(); }
  await expect(page.locator(".ns-page")).toHaveCount(0);
});

test("a week change uses loading feedback and keeps the selected GW in the address", async ({ page }) => {
  await page.goto("/play");
  const release = await holdNavigation(page, "/play");
  try {
    await page.getByRole("button", { name: "Next gameweek", exact: true }).click();
    await expect(page.getByRole("main", { name: "Loading Play" })).toBeVisible();
  } finally { release(); }
  await expect(page).toHaveURL(/[?&]w=/);
  await expect(page.locator("main[aria-busy=true]")).toHaveCount(0);
});

test("modified clicks and in-page board controls do not leave a page skeleton behind", async ({ page }) => {
  await page.goto("/difficulty");
  await page.locator(".nav-links a").first().dispatchEvent("click", { ctrlKey: true });
  await expect(page.locator("main[aria-busy=true]")).toHaveCount(0);
  await page.getByRole("button", { name: "Attack", exact: true }).first().click();
  await expect(page.locator("main[aria-busy=true]")).toHaveCount(0);
});

test("returning home from the board completes after its response", async ({ page }) => {
  await page.goto("/table");
  const release = await holdNavigation(page, "/");
  try {
    await page.locator(".nav-links").getByRole("link", { name: "This week", exact: true }).click();
    await expect(page.getByRole("main", { name: "Loading Recap" })).toBeVisible();
  } finally { release(); }
  await expect(page).toHaveURL(url => url.pathname === "/");
  await expect(page.locator(".ns-page")).toHaveCount(0);
});

test("cached home navigation completes without a minimum skeleton delay", async ({ page }) => {
  await page.goto("/");
  await page.locator(".nav-links").getByRole("link", { name: "Season", exact: true }).click();
  await expect(page).toHaveURL(/\/season/);
  await page.locator(".lens").getByRole("link", { name: "Table", exact: true }).click();
  await expect(page).toHaveURL(/\/table/);
  await page.locator(".nav-links").getByRole("link", { name: "This week", exact: true }).click();
  await expect(page).toHaveURL(url => url.pathname === "/");
  await expect(page.locator(".ns-page")).toHaveCount(0);
});

test("player and team card links show their own detail layouts and preserve history", async ({ page }) => {
  for (const [start, family, label] of [["/cards", "players", "Player"], ["/table", "team", "Team"]]) {
    await page.goto(start!);
    const link = page.getByRole("main").locator(`a[href^="/${family}/"]`).first();
    const href = await link.getAttribute("href");
    const target = new URL(href!, page.url());
    const release = await holdNavigation(page, target.pathname);
    try {
      await link.click();
      await expect(page.getByRole("main", { name: `Loading ${label}`, exact: true })).toBeVisible();
    } finally { release(); }
    await expect(page).toHaveURL(url => url.pathname === target.pathname);
    await expect(page.locator(".ns-page")).toHaveCount(0);
    await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(url => url.pathname === start);
    await expect(page.locator(".ns-page")).toHaveCount(0);
    await page.goForward();
    await expect(page).toHaveURL(url => url.pathname === target.pathname);
    await expect(page.locator(".ns-page")).toHaveCount(0);
  }
});

test("a league change has feedback, and an offline event does not trap the old page", async ({ page }) => {
  await page.goto("/table");
  const release = await holdNavigation(page, "/table");
  try {
    await page.getByLabel("Competition", { exact: true }).selectOption("PL");
    await expect(page.getByRole("main", { name: "Loading Table" })).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await expect(page.locator(".ns-page")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "The season, played out", exact: true })).toBeVisible();
  } finally { release(); }
  await expect(page).toHaveURL(/league=PL/);
  await expect(page.locator(".ns-page")).toHaveCount(0);
});

for (const width of [1440, 390]) {
  test(`confirmed mission departures keep navigation feedback at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/missions");
    await page.getByRole("region", { name: "History", exact: true }).locator(".ms-history-day > summary").first().click();
    await page.getByRole("button", { name: "Edit my picks" }).first().click();
    const note = page.getByRole("group", { name: /Edit picks/ }).getByRole("textbox", { name: "Note (optional)" });
    await note.fill("Keep until I discard");
    const rare = page.getByRole("navigation", { name: "Rarity" }).getByRole("link", { name: "Rare", exact: true });
    await rare.click();
    const guard = page.getByRole("alertdialog", { name: "Unsaved correction" });
    await expect(guard).toBeVisible();
    await expect(page.locator(".ns-page")).toHaveCount(0);
    await guard.getByRole("button", { name: "Keep editing" }).click();
    await expect(note).toHaveValue("Keep until I discard");
    await rare.click();
    const release = await holdNavigation(page, "/missions");
    try {
      await guard.getByRole("button", { name: "Discard changes" }).click();
      await expect(page.getByRole("main", { name: "Loading Missions", exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.screenshot({ path: `output/playwright/navigation/${width}-mission-discard-loading.png` });
    } finally { release(); }
    await expect(page).toHaveURL(/rarity=rare/);
    await expect(page.locator(".ns-page")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Rarity" }).getByRole("link", { name: "Rare", exact: true })).toHaveAttribute("aria-current", "page");
  });
}

for (const width of [1440, 390]) test(`Strategies query subviews and individual plans have destination feedback at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/audit/strategies");
  for (const [nav, name, label, kind] of [
    ["Strategies view", "Plans", "Plan alternatives", "play"],
    ["Plan", "", "Plan alternatives", "play"],
    ["Strategies view", "Results", "Strategies", "strategies"],
  ] as const) {
    const release = await holdNavigation(page, "/audit/strategies");
    try {
      const links = page.getByRole("navigation", { name: nav, exact: true });
      await (name ? links.getByRole("link", { name, exact: true }) : links.getByRole("link").last()).click();
      const loading = page.getByRole("main", { name: `Loading ${label}`, exact: true });
      await expect(loading).toBeVisible();
      await expect(loading).toHaveAttribute("data-layout", kind);
    } finally { release(); }
    await expect(page.locator(".ns-page")).toHaveCount(0);
  }
});
