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

test("Stats ranks LaLiga players by their mean per start: the first five on a staircase, 1st on the left, the next five as big cards, then a wall", async ({ page }) => {
  await page.goto("/stats");
  await expect(page.getByRole("link", { name: "Stats", exact: true })).toBeVisible();
  const podium = page.locator(".sx-podium li");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Most Goals per start");
  await expect(podium).toHaveCount(5);
  await expect(podium.first()).toHaveAttribute("data-rank", "1");
  await expect(podium.first().locator(".sx-name")).toHaveText("Raphinha");
  await expect(podium.first().locator(".sx-value")).toHaveText("0.92");
  // 1st stands left of 2nd, on the taller step
  const [one, two] = [await podium.nth(0).locator(".sx-plinth").boundingBox(), await podium.nth(1).locator(".sx-plinth").boundingBox()];
  expect(one!.x).toBeLessThan(two!.x);
  expect(one!.height).toBeGreaterThan(two!.height);
  await expect(page.locator(".sx-close li")).toHaveCount(5);
  await expect(page.locator(".sx-close li").first().locator(".sx-rank")).toHaveText("6");
  await expect(page.locator(".sx-list li").first().locator(".sx-rank")).toHaveText("11");
  expect(await page.locator(".sx-tile").count()).toBeLessThanOrEqual(45);
  await expect(page.locator(".sx-field")).toContainText(/^\d+ players, average \d+\.\d+/);

  // the stat word opens a palette of every stat; typing narrows it
  await page.getByRole("button", { name: "Goals", exact: true }).click();
  const palette = page.getByRole("dialog", { name: "Choose a stat" });
  await palette.getByRole("searchbox", { name: "Find a stat" }).fill("accurate p");
  await palette.getByRole("button", { name: "Accurate passes", exact: true }).click();
  await expect(palette).toBeHidden();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Most Accurate passes per start");
  await expect(podium.first().locator(".sx-name")).toHaveText("Pau Cubarsí");
  await page.getByRole("button", { name: "Next stat" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Most Accurate long balls per start");

  const leader = podium.first().locator(".sx-value");
  await expect(leader).toHaveText(/^\d/);
  await expect(async () => {
    // the leader's number counts up, so wait for it to settle before reading the order
    const values = (await page.locator(".sx-podium .sx-value, .sx-tile .sx-value").allInnerTexts()).map(Number);
    expect(values).toEqual([...values].sort((a, b) => b - a));
  }).toPass();
  const fewer = await page.locator(".sx-tile").count();
  await page.getByLabel("Fewest starts").selectOption("3");
  expect(await page.locator(".sx-tile").count()).toBeGreaterThanOrEqual(fewer);

  // the sentence's "among" word narrows the ranking to one position
  await page.goto("/stats?stat=goals");
  await page.getByLabel("Who is ranked").selectOption("DEF");
  await expect(page).toHaveURL(/pos=DEF/);
  await expect(podium.first().locator(".sx-name")).not.toHaveText("Raphinha");

  await podium.first().getByRole("link").first().click();
  await expect(page).toHaveURL(/\/players\/[a-z0-9-]+$/);
});

test("Stats keeps the text floor and fits a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/stats");
  await expect(page.locator(".sx-podium li")).toHaveCount(5);
  expect(await smallText(page, 10)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("Stats keeps the chosen stat and starts in the address", async ({ page }) => {
  await page.goto("/stats?stat=accurate_pass&min=20");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Most Accurate passes per start");
  await expect(page.getByLabel("Fewest starts")).toHaveValue("20");
  await page.getByRole("button", { name: "Previous stat" }).click();
  await expect(page).toHaveURL(/stat=assist_penalty_won&min=20$/);
});

test("Prices says how far the gallery is up or down, stands each bought card on what it cost, and keeps the cards not bought apart", async ({ page }) => {
  // the mock API prices the recorded collection: every fifth card not bought (e2e/mock-api.mjs)
  const notBought = cards.filter((_, i) => i % 5 === 4).length;
  await page.goto("/prices");
  await expect(page.getByRole("link", { name: "Prices", exact: true })).toHaveAttribute("aria-current", "page");
  // the headline counts up to the whole gallery's gain or loss on what was paid
  const signed = (texts: string[]) => texts.map((t) => Number(t.replace(/\s|up|down/g, "").replace(/^−/, "-").replace(/[+€]/g, "")));
  const total = signed(await page.locator(".px-wall").first().locator(".px-badge").allInnerTexts()).reduce((a, b) => a + b, 0);
  await expect(async () => {
    expect(Math.abs(signed([await page.locator(".px-total").innerText()])[0]! - total)).toBeLessThan(0.1);
  }).toPass();
  await expect(page.locator(".px-total")).toHaveText(total > 0 ? /^up \+€\d+\.\d\d$/ : /^down −€\d+\.\d\d$/);
  await expect(page.locator(".px-tide li")).toHaveCount(cards.length - notBought);
  // a gain stands above the line, a loss hangs below it
  const up = page.locator(".px-tide li.up").first();
  const down = page.locator(".px-tide li.down").first();
  const line = (await page.locator(".px-tide ol").boundingBox())!;
  expect((await up.locator(".px-bar").boundingBox())!.y).toBeLessThan(line.y + line.height / 2);
  expect((await down.locator(".px-bar").boundingBox())!.y).toBeGreaterThanOrEqual(line.y + line.height / 2 - 2);
  // the wall follows the chosen order
  const badges = () => page.locator(".px-wall").first().locator(".px-badge").allInnerTexts();
  const euros = (texts: string[]) => texts.map((t) => Number(t.replace("\u2212", "-").replace(/[+€]/g, "")));
  expect(euros(await badges())).toEqual([...euros(await badges())].sort((a, b) => b - a));
  await page.getByLabel("Order").selectOption("loss");
  expect(euros(await badges())[0]).toBeLessThan(0);
  await expect(page.getByRole("heading", { name: /Not bought/ })).toBeVisible();
  await expect(page.locator(".px-wall").nth(1).locator(".px-tile")).toHaveCount(notBought);
  await page.waitForTimeout(900);
  expect(await smallText(page, 11)).toEqual([]);
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/prices-1440.png`, fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/prices");
  await page.waitForTimeout(900);
  expect(await smallText(page, 10)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/prices-390.png`, fullPage: true });
});
