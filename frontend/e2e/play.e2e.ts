import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { nextWeek } from "../lib/play";
import { offline, resetBackend, sorare } from "./helpers";

// The Play page draws the Sorare gameweek the job publishes (e2e/fixtures/sorare-response.json, served by
// the mock API). Nothing here recomputes a number: the tests check that what the payload says reaches the page.

test.beforeEach(async ({ page, request }) => {
  await resetBackend(request);
  await offline(page);
});

const planned = nextWeek(sorare);
const plan1 = planned.plans[0]!;
const laliga = plan1.lineups[0]!;

test("the gameweek opens on its best plan: the ring, both rewards and every lineup", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); // the ring fills and the numbers count up
  await page.goto("/play");
  await expect(page.getByRole("heading", { level: 1, name: "Gameweek 17" })).toBeVisible();
  await expect(page.locator(".pl-head .pl-sub")).toContainText("locks");

  const plans = page.getByRole("navigation", { name: "Plan" });
  await expect(plans.getByRole("link")).toHaveCount(planned.plans.length);
  await expect(plans.getByRole("link").first()).toHaveAttribute("aria-current", "page");
  await expect(plans.getByRole("link").first()).toContainText("best");

  const hero = page.locator(".pl-hero");
  await expect(hero.getByRole("heading", { level: 2, name: "3 lineups" })).toBeVisible();
  await expect(hero.getByRole("img", { name: "85% any reward" })).toBeVisible();
  await expect(hero.locator(".pl-pair b").first()).toHaveText("≈571");
  await expect(hero.locator(".pl-pair b").last()).toHaveText("≈$1.31");
  await expect(hero.locator(".pl-side")).toContainText("19 of 38 cards used");
  await expect(hero.locator(".pl-alloc-key li")).toHaveText([
    "LALIGA EA SPORTS7 cards",
    "All Star7 cards",
    "Room of 105 cards",
    "Not used19 cards",
  ]);

  // One card per lineup, each with its own xScore and chance.
  const lineups = page.locator(".pl-lu");
  await expect(lineups).toHaveCount(plan1.lineups.length);
  await expect(lineups.first()).toContainText("LALIGA EA SPORTS");
  await expect(lineups.first()).toContainText("5 + 2 subs · 4 in-season");
  await expect(lineups.first()).toContainText("Top 1,500 of ≈4,487 pays");
  await expect(lineups.first().locator(".pl-kv b").first()).toHaveText(String(laliga.x));
  await expect(lineups.first().locator(".pl-kv b").nth(1)).toHaveText("48%");
  await expect(lineups.nth(2)).toContainText("Room of 10 · cap 260");
  await expect(lineups.nth(2)).toContainText("Top 3 of 10 · 300 to enter");

  await expect(page.getByRole("group", { name: "Show" })).toHaveCount(0); // nothing has been played yet
  const scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(scan.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 4).map((n) => n.target.join(" ")).join("; ")}`)).toEqual([]);
});

test("another plan is one click away, and spreads the cards differently", async ({ page }) => {
  await page.goto("/play");
  const plans = page.getByRole("navigation", { name: "Plan" });
  await plans.getByRole("link", { name: /^Plan 2/ }).click();
  await expect(page).toHaveURL(/\/play\?plan=2$/);
  await expect(plans.getByRole("link", { name: /^Plan 2/ })).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".pl-hero").getByRole("heading", { level: 2, name: "2 lineups" })).toBeVisible();
  await expect(page.locator(".pl-lu")).toHaveCount(2);
  await expect(page.locator(".pl-hero .pl-alloc-key li")).toHaveText([
    "LALIGA EA SPORTS7 cards",
    "All Star7 cards",
    "Not used24 cards",
  ]);
});

test("a lineup opens a sheet with its cards, its subs and the rules it keeps", async ({ page }) => {
  await page.goto("/play");
  await page.locator(".pl-lu").first().click();
  const sheet = page.getByRole("dialog", { name: "LALIGA EA SPORTS lineup" });
  await expect(sheet).toBeVisible();

  await expect(sheet.locator(".pl-pc")).toHaveCount(laliga.starters.length);
  await expect(sheet.locator(".pl-pc").first()).toContainText("Unai Simón");
  await expect(sheet.locator(".pl-pc").first().locator(".pl-fx")).toContainText("v Getafe CF");
  await expect(sheet.locator(".pl-pc .pl-cap")).toHaveCount(1); // one captain
  await expect(sheet.locator(".pl-bench .pl-sub")).toHaveCount(laliga.subs.length);
  await expect(sheet.locator(".pl-bench")).toContainText("Álex Remiro");
  await expect(sheet.locator(".pl-bench")).toContainText("goalkeeper · IN-SEASON · plays 81%");
  await expect(sheet.locator(".pl-checks")).toContainText("5 of 5 in-season (4 needed)");
  await expect(sheet.locator(".pl-checks")).toContainText("Max 2 per club · +2%");
  await expect(sheet.locator(".pl-checks")).toContainText("Average total 244 ≤ 260 · +4%");
  await expect(sheet.locator(".pl-checks")).toContainText("Captain +50%");

  await sheet.getByRole("group").filter({ hasText: "Rewards" }).click(); // the reward ladder is folded away
  await expect(sheet.locator(".pl-ladder tbody tr")).toHaveCount(3);
  await expect(sheet.locator(".pl-ladder tbody tr").last()).toContainText("#301–1,500");

  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toBeHidden();
});

test("a lineup with no bench says why, and a room shows its entry fee", async ({ page }) => {
  await page.goto("/play");
  await page.locator(".pl-lu").nth(1).click();
  const classic = page.getByRole("dialog", { name: "All Star lineup" });
  await expect(classic.locator(".pl-checks").first()).toContainText("No substitutes: every other card was worth more");
  await expect(classic.locator(".pl-checks").last()).toContainText("Max 2 per club"); // three from one club: no +2%
  await expect(classic.locator(".pl-checks").last()).not.toContainText("Max 2 per club · +2%");
  await classic.getByRole("button", { name: "Close" }).click();

  await page.locator(".pl-lu").nth(2).click();
  const room = page.getByRole("dialog", { name: "Room of 10 lineup" });
  await expect(room.locator(".pl-checks").first()).toContainText("This competition has no substitutes");
  await expect(room.locator(".pl-checks").last()).toContainText("Captain +20%"); // a room pays the captain less
  await expect(room.locator(".pl-ladder tbody tr")).toHaveCount(4); // three places paid, then the entry fee
  await expect(room.locator(".pl-ladder tbody tr").last()).toContainText("Entry");
  await expect(room.locator(".pl-ladder tbody tr").last()).toContainText("−300");
});

test("the competitions that can't be entered, and the ones not worth entering, are folded away", async ({ page }) => {
  await page.goto("/play");
  const open = page.locator(".pl-fold").filter({ hasText: "Also open" });
  await expect(open).toContainText("· 1");
  await open.locator("summary").click();
  await expect(open.locator("li")).toContainText("−212 essence expected · 800 to enter");

  const blocked = page.locator(".pl-fold").filter({ hasText: "Not playable" });
  await expect(blocked).toContainText("· 2");
  await blocked.locator("summary").click();
  await expect(blocked.locator("li").first()).toContainText("no Rare goalkeeper: 1 needed");
});

test("the gameweek that was played shows what each lineup really scored and won", async ({ page }) => {
  await page.goto("/play");
  await page.getByRole("group", { name: "Gameweek" }).getByRole("link", { name: /^GW15/ }).click();
  await expect(page).toHaveURL(/\/play\?gw=15$/);
  await expect(page.getByRole("heading", { level: 1, name: "Gameweek 15" })).toBeVisible();
  await expect(page.locator(".pl-eyebrow").first()).toContainText("Sorare · played");

  await page.getByRole("group", { name: "Show" }).getByRole("link", { name: "After the games" }).click();
  await expect(page).toHaveURL(/\/play\?gw=15&after=1$/);
  const hero = page.locator(".pl-hero");
  await expect(hero.getByRole("img", { name: "50% lineups paid" })).toBeVisible();
  await expect(hero.locator(".pl-side")).toContainText("1 of 2 lineups paid");
  await expect(hero.locator(".pl-side")).toContainText("1 of 2 inside the range");
  await expect(hero.locator(".pl-pair b").first()).toHaveText("250");
  await expect(hero.locator(".pl-pair small").first()).toHaveText("expected ≈409");

  const first = page.locator(".pl-lu").first();
  await expect(first.locator(".pl-kv b").first()).toHaveText("313");
  await expect(first).toContainText("scored · xScore 300");
  await expect(first).toContainText("250"); // the essence it won
  await expect(page.locator(".pl-lu").nth(1)).toContainText("No reward");
});

test("after the games, a sub that came in is shown with what it cost", async ({ page }) => {
  await page.goto("/play?gw=15&after=1");
  await page.locator(".pl-lu").first().click();
  const sheet = page.getByRole("dialog", { name: "LALIGA EA SPORTS lineup" });
  await expect(sheet.locator(".pl-big")).toContainText("313");
  await expect(sheet.locator(".pl-big")).toContainText("xScore was 300 (220–380) · 307 was needed");
  await expect(sheet.locator(".pl-pc.out")).toHaveCount(1); // the goalkeeper never played
  await expect(sheet.locator(".pl-pc.out")).toContainText("DNP");
  await expect(sheet.locator(".pl-pc.out")).toContainText("↺ Álex Remiro");
  await expect(sheet.locator(".pl-sub.in")).toContainText("came in for Unai Simón");
  await expect(sheet.locator(".pl-sub").last()).toContainText("stayed out");
  await expect(sheet.locator(".pl-checks")).toContainText("A sub came in: the lineup bonuses dropped");
  await expect(sheet.locator(".pl-ladder tr.hit")).toContainText("250"); // the row that paid
});

test("a link to a gameweek the page no longer holds falls back to the one being planned", async ({ page }) => {
  await page.goto("/play?gw=99");
  await expect(page).toHaveURL(/\/play$/);
  await expect(page.getByRole("heading", { level: 1, name: "Gameweek 17" })).toBeVisible();
});

test("without a Sorare sync the page says so instead of guessing", async ({ page, request }) => {
  await resetBackend(request, "no-sorare");
  await page.goto("/play");
  await expect(page.getByRole("heading", { level: 1, name: "Play" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Your Sorare gameweek appears after the next refresh.");
});

test("the home's Sorare row carries the plan, the gameweek just played and the cards", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const play = page.getByRole("region", { name: "Play" });
  await expect(play.getByRole("img", { name: "85% any reward" })).toBeVisible();
  await expect(play.locator(".hm-play-side")).toContainText("3 lineups");
  await expect(play.locator(".hm-play-side")).toContainText("19 of 38 cards");
  await expect(play.locator(".hm-lurows > li")).toHaveCount(plan1.lineups.length);
  await expect(play.locator(".hm-lurows > li").first()).toContainText("LALIGA EA SPORTS");

  const last = page.getByRole("region", { name: "Last gameweek" });
  await expect(last.locator(".hm-hero .who b")).toHaveText("1 of 2 inside the range");
  await expect(last.locator(".hm-hero .num b")).toHaveText("250");
  await expect(last.locator(".hm-pva-row")).toHaveCount(2);
  await expect(last.locator(".hm-pva-row").first().getByRole("img")).toHaveAttribute(
    "aria-label",
    "LALIGA EA SPORTS: predicted 300 (220 to 380), scored 313, 307 needed",
  );

  const cards = page.getByRole("region", { name: "My cards" });
  await expect(cards.locator(".hm-kv")).toContainText("38of 42");
  await expect(cards.locator(".hm-warn")).toContainText("No Rare goalkeeper");
  await expect(cards).toContainText("3 sealed · 1 for sale or in an offer · left out");

  // The Play tile opens the page it summarises.
  await play.getByRole("link", { name: "Play", exact: true }).click();
  await expect(page).toHaveURL(/\/play$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Gameweek 17" })).toBeVisible();
});

test("the head says how current the gameweek is, and the Control Center shows the same state", async ({ page }) => {
  await page.goto("/play");
  // The recorded gameweek was built in the cloud from Sorare's own projections.
  await expect(page.locator(".pl-chip")).toHaveClass(/fresh/);
  await expect(page.locator(".pl-chip")).toContainText("synced");
  await expect(page.locator(".pl-alert")).toHaveCount(0);
  await expect(page.locator(".pl-lus.behind")).toHaveCount(0);

  await page.goto("/control");
  const panel = page.locator(".sr-panel");
  await expect(panel).toHaveClass(/ok/);
  await expect(panel.getByText("Fresh", { exact: true })).toBeVisible();
  await expect(panel.locator(".sr-clock")).toHaveCount(5);
  await expect(panel.locator(".sr-clock").first()).toContainText(`${sorare.cards.usable}of ${sorare.cards.total}`);
  await expect(panel.locator(".sr-stats")).toContainText("41");
  await expect(panel.locator(".sr-stats")).toContainText("3 moved since the run before");
  await expect(panel.getByRole("img")).toHaveAttribute("aria-label", /scheduled runs before the gameweek locks/);
});
