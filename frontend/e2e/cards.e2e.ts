import { expect, test } from "@playwright/test";
import { offline, resetBackend, smallText, sorare } from "./helpers";

// The Cards and Players pages draw what the Sorare job publishes (e2e/fixtures/sorare-response.json, served by the mock API, which makes
// three of the planned week's players cards of the collection and gives them a chance to start from one, two and three sources).

test.beforeEach(async ({ page, request }) => {
  await resetBackend(request);
  await offline(page);
});

const cards = sorare.collection!;
const tile = (index: number) => `#p-${cards[index]!.player}`;

test("each card says his next game and his chance to start it, from every source that has one", async ({ page }) => {
  await page.goto("/cards");

  const all = page.locator(tile(0));
  await expect(all.locator(".s5-next-game")).toContainText("v Getafe CF");
  const three = all.getByRole("group", { name: "Chance to start" });
  await expect(three).toHaveText("FF80SO70SF54");
  await expect(three.locator("[data-used]")).toHaveText("FF80"); // the one Sofix uses

  await expect(page.locator(tile(1)).getByRole("group", { name: "Chance to start" })).toHaveText("SO70SF60");
  await expect(page.locator(tile(1)).locator("[data-used]")).toHaveText("SO70");
  await expect(page.locator(tile(2)).getByRole("group", { name: "Chance to start" })).toHaveText("SF60");

  // a card whose player has no game in the weeks Sorare has opened says so, in words
  await expect(page.locator(tile(10)).locator(".s5-next")).toHaveText("No game yet");
});

test("a dash under Projected says why, once on the page and on each card", async ({ page }) => {
  await page.goto("/players");

  const note = /^A dash: Sorare has not published its projection for his next game yet \(due \w{3} \d{2}:\d{2}, Madrid time\)\.$/;
  await expect(page.locator(".s5-dash")).toHaveText(note);
  const dash = page.locator(".s5-stat", { hasText: "Projected" }).filter({ hasText: "—" }).first();
  await expect(dash).toHaveAttribute("title", note);
});

test("Cards and Players keep every text at 11 px or more", async ({ page }) => {
  for (const route of ["/cards", "/players"]) {
    await page.goto(route);
    await page.waitForTimeout(600); // past the tiles' entrance
    expect(await smallText(page, 11), route).toEqual([]);
  }
});

test("with reduced motion the cards and search results still show (their rise is only a fade in, never the resting state)", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [path, item] of [["/cards", ".s5-pc"], ["/players", ".s5-res"]] as const) {
    await page.goto(path);
    await expect(page.locator(item).first()).toBeVisible();
    expect(await page.locator(item).first().evaluate((el) => getComputedStyle(el).opacity), path).toBe("1");
  }
});

test("every player card grows on hover: the Recap, the Gallery, Players, Play and Lineups", async ({ page }) => {
  for (const [path, card] of [["/", ".rc-best .rc-art"], ["/cards", ".s5-pc .art"], ["/players", ".s5-res .art"], ["/play", ".pl-lu .rc-art"], ["/lineups?m=22502", ".lu-face"]] as const) {
    await page.goto(path);
    const art = page.locator(card).first();
    await art.scrollIntoViewIfNeeded();
    await art.hover({ force: path.startsWith("/lineups") }); // on Lineups a link covers the card: hovering it is hovering the card
    await expect.poll(() => art.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a), { message: path }).toBeGreaterThan(1.1);
  }
});

test("a Gallery card opens the player's page", async ({ page }) => {
  await page.goto("/cards");
  const first = page.locator(".s5-pc a.art").first();
  const href = (await first.getAttribute("href"))!;
  expect(href).toMatch(/^\/players\/[a-z0-9-]+$/);
  await first.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`), { timeout: 30_000 });
});

test("Players switches between the best and the best value for the money", async ({ page }) => {
  await page.goto("/players");
  const order = page.getByRole("group", { name: "Order" });
  await expect(order.getByRole("button", { name: "Best", exact: true })).toHaveAttribute("aria-pressed", "true");
  await order.getByRole("button", { name: "Best value" }).click();
  await expect(order.getByRole("button", { name: "Best value" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".s5-res .s5-gain").first()).toContainText(/a €10$/);
});

test("every LaLiga player has a start chance and an xScore, not only yours, priced or not", async ({ page }) => {
  await page.goto("/players");
  const search = page.getByRole("searchbox").or(page.getByRole("textbox")).first();

  await search.fill("Raphinha");
  const raphinha = page.locator(".s5-res", { hasText: "Raphinha" });
  await expect(raphinha.locator(".s5-stat", { hasText: "Starts" })).toContainText("85%");
  await expect(raphinha.locator(".s5-stat", { hasText: "xScore" }).locator("b")).toHaveText("67");

  await search.fill("Unpriced");
  const kid = page.locator(".s5-res", { hasText: "Unpriced Kid" });
  await expect(kid.locator(".s5-stat", { hasText: "Starts" })).toContainText("4%");
  await expect(kid.locator(".s5-stat", { hasText: "Limited price" }).locator("b")).toHaveText("—");

  await page.goto("/players/unpriced-kid");
  const hero = page.locator(".pd-hero");
  await expect(hero).toContainText("v Sevilla");
  await expect(hero).toContainText("xScore if he plays"); // no conditional starting score was published for this player
  await expect(hero.locator(".pd-s")).toHaveText("4%");
});

test("Stats ranks LaLiga players by their mean per start: the first five on a podium, the next ones under it, and a new stat or starts filter reranks", async ({ page }) => {
  await page.goto("/stats");
  await expect(page.getByRole("link", { name: "Stats", exact: true })).toBeVisible();
  const podium = page.locator(".st-podium li");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Goals per start");
  await expect(podium).toHaveCount(5);
  await expect(podium.first().locator(".st-name")).toHaveText("Raphinha");
  await expect(podium.first().locator(".st-value")).toHaveText("0.92");
  await expect(page.locator(".st-list li").first().locator(".st-rank")).toHaveText("6");
  expect(await page.locator(".st-list li").count()).toBeLessThanOrEqual(45);

  await page.getByRole("group", { name: "Stat group" }).getByRole("button", { name: "Passing", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Accurate passes per start");
  await expect(podium.first().locator(".st-name")).toHaveText("Pau Cubarsí");
  await page.getByRole("group", { name: "Stat", exact: true }).getByRole("button", { name: "Missed passes", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Missed passes per start");

  // every podium value is at least the next one, and so is the list's first against the podium's last
  const values = (await page.locator(".st-podium .st-value, .st-list .st-value").allInnerTexts()).map(Number);
  expect(values).toEqual([...values].sort((a, b) => b - a));
  const fewer = await page.locator(".st-list li").count();
  await page.getByRole("button", { name: "3+", exact: true }).click();
  expect(await page.locator(".st-list li").count()).toBeGreaterThanOrEqual(fewer);

  await podium.first().getByRole("link").first().click();
  await expect(page).toHaveURL(/\/players\/[a-z0-9-]+$/);
});

test("Stats keeps the text floor and fits a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/stats");
  await expect(page.locator(".st-podium li")).toHaveCount(5);
  expect(await smallText(page, 10)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("Stats keeps the chosen stat and starts in the address", async ({ page }) => {
  await page.goto("/stats?stat=accurate_pass&min=20");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Accurate passes per start");
  await expect(page.getByRole("button", { name: "20+", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("group", { name: "Stat group" }).getByRole("button", { name: "Defending", exact: true }).click();
  await expect(page).toHaveURL(/stat=won_tackle&min=20$/);
});
