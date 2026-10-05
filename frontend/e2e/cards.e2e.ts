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
  for (const [path, card] of [["/", ".rc-best .rc-art"], ["/cards", ".s5-pc .art"], ["/players", ".s5-res .art"], ["/play", ".pl-mc .art"], ["/lineups?m=22502", ".lu-face"]] as const) {
    await page.goto(path);
    const art = page.locator(card).first();
    await art.scrollIntoViewIfNeeded();
    await art.hover({ force: path.startsWith("/lineups") }); // on Lineups a link covers the card: hovering it is hovering the card
    await expect.poll(() => art.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a), { message: path }).toBeGreaterThan(1.1);
  }
});
