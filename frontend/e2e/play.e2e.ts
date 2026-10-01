import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { nextWeek, type Sorare } from "../lib/play";
import type { ApiResponse } from "../lib/types";
import { byMonth, pageWeeks, seasonWeeks, type Week } from "../lib/weeks";
import { grid, MOCK, offline, resetBackend, sorare } from "./helpers";

// The Play page draws the Sorare gameweek the job publishes (e2e/fixtures/sorare-response.json, served by
// the mock API). Nothing here recomputes a number: the tests check that what the payload says reaches the page.

test.beforeEach(async ({ page, request }) => {
  await resetBackend(request);
  await offline(page);
});

const planned = nextWeek(sorare);
const plan1 = planned.plans[0]!;
const laliga = plan1.lineups[0]!;

/**
 * A gameweek of the timeline that the page holds no plan for and that no LaLiga round starts on, as the mock serves it.
 * The mock moves the Sorare dates with the clock and not the grid's, so which week that is changes through the day: it is
 * read from what is served, never from the recording.
 */
async function timelineOnlyWeek(request: APIRequestContext) {
  const served = ((await (await request.get(`${MOCK}/api/sorare`)).json()) as ApiResponse<Sorare>).data!;
  return served.timeline.find(
    (item) =>
      !served.weeks.some((week) => week.gameweek.id === item.id) &&
      !grid.matchdays.some((matchday) => matchday.date_from?.slice(0, 10) === item.start.slice(0, 10)),
  )!;
}

/** The weeks Play offers, worked out the way the app does from what the mock serves (its dates move every day). */
async function playWeeks(request: APIRequestContext): Promise<Week[]> {
  const served = ((await (await request.get(`${MOCK}/api/sorare`)).json()) as ApiResponse<Sorare>).data!;
  return pageWeeks(seasonWeeks(grid, served, new Date()), "play");
}

/**
 * The week panel shows one month at a time and opens on the week you are on. The mock moves the recorded
 * gameweek to two days after today, so near a month's end the week a test wants sits in the other month.
 */
async function showMonthOf(page: Page, week: Week) {
  await page.locator(".wk-months").getByRole("button", { name: byMonth([week])[0]!.label, exact: true }).click();
}

const gameweek = async (request: APIRequestContext, id: string) => (await playWeeks(request)).find((week) => week.gw === id)!;

/** Where Play lands once this week is picked: its own address, whatever the day the mock's clock puts it on. */
const addressOf = (week: Week) => new RegExp(`/play\\?w=${week.id}$`);

/**
 * The Sofix extension as Sorare answers through it: one entered lineup, with what it scored, where it ranked and
 * what it was paid, for exactly these gameweeks. Any other gameweek has no lineups. `unscored` is the same lineup before any game: score 0
 * everywhere and no rank yet.
 */
async function fakeExtension(page: Page, fixtureSlugs: string[], unscored = false) {
  const cards = sorare.collection!.slice(0, 7);
  await page.addInitScript(
    ({ fixtureSlugs, cards, unscored }) => {
      const root = globalThis as typeof globalThis & {
        chrome?: { runtime?: { sendMessage?: (id: string, message: Record<string, unknown>, reply: (value: unknown) => void) => void } };
      };
      root.chrome ??= {};
      root.chrome.runtime ??= {};
      root.chrome.runtime.sendMessage = (_id, message, reply) => {
        if (message.type === "ping") {
          reply({ ok: true, version: "0.2.2", sorareUser: "e2e-manager", appReachable: true });
          return;
        }
        const entered = message.step === "week-entered" && fixtureSlugs.includes(String(message.slug));
        reply({
          state: "ok",
          data: {
            so5: {
              so5Fixture: entered
                ? {
                    mySo5Lineups: [
                      {
                        id: "mine-1",
                        name: "Friday team",
                        draft: false,
                        confirmable: false,
                        so5Leaderboard: { slug: "laliga-limited", displayName: "LALIGA EA SPORTS" },
                        so5Rankings: [
                          {
                            id: "rank-1",
                            ranking: unscored ? null : 1204,
                            score: unscored ? 0 : 313.4,
                            so5Leaderboard: { slug: "laliga-limited" },
                            so5Rewards: unscored
                              ? []
                              : [
                              {
                                rewardConfigs: [
                                  { __typename: "MonetaryRewardConfig", amount: { usdCents: 250 } },
                                  { __typename: "CardShardRewardConfig", rarity: "limited", quantity: 250 },
                                ],
                              },
                            ],
                          },
                        ],
                        so5Appearances: cards.map((card, index) => ({
                          anyCard: { slug: card.slug },
                          pictureUrl: card.pic,
                          player: { displayName: card.name },
                          rarity: card.rarity,
                          score: unscored ? 0 : 40 + index,
                          captain: index === 0,
                        })),
                      },
                    ],
                  }
                : null,
            },
          },
        });
      };
    },
    { fixtureSlugs, cards, unscored },
  );
}

test("entered Sorare lineups sit at the top of the gameweek they belong to", async ({ page, request }) => {
  const timelineOnly = await timelineOnlyWeek(request);
  await fakeExtension(page, [planned.gameweek.slug, timelineOnly.slug]);

  await page.goto("/play");
  const mine = page.getByRole("region", { name: "Your Sorare lineups" });
  await expect(mine).toContainText("Friday team");
  await expect(mine).toContainText("LALIGA EA SPORTS");
  await expect(mine.getByLabel("7 cards")).toBeVisible();
  await expect(mine.getByRole("img")).toHaveCount(7);
  // What Sorare says it made: the score, where it ranked, what it was paid, and each card's score with the captain marked.
  const lineup = mine.locator(".pl-entered-lineup");
  await expect(lineup.locator(".pl-entered-result b")).toHaveText("313");
  await expect(lineup.locator(".pl-entered-result small")).toHaveText("Rank 1,204 · $2.50 · 250 essence");
  await expect(lineup.locator(".pl-entered-card .cap")).toHaveCount(1);
  await expect(lineup.locator(".pl-entered-card .sc").first()).toHaveText("40");

  const children = await page.locator(".pl-main > *").evaluateAll((nodes) => nodes.map((node) => node.className));
  expect(children.indexOf("pl-entered")).toBeLessThan(children.indexOf("pl-plans"));

  await page.goto(`/?w=${timelineOnly.start.slice(0, 10)}`);
  const home = page.getByRole("region", { name: "Your Sorare lineups" });
  await expect(home).toContainText("Friday team");
  await expect(home).toContainText("LALIGA EA SPORTS");
  await expect(home).toContainText(`GW${timelineOnly.number}`);
  const sorareOrder = await page.locator(".hm-bento > *").evaluateAll((nodes) => nodes.map((node) => node.className));
  expect(sorareOrder.indexOf("pl-entered")).toBeLessThan(sorareOrder.findIndex((name) => String(name).includes("hm-play")));

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(home).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const cardBox = await home.locator(".pl-entered-card").first().boundingBox();
  expect(cardBox?.width).toBeLessThanOrEqual(36);
  expect(cardBox?.height).toBeGreaterThan(cardBox?.width ?? 0);
});

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

test("a lineup card says his chance of starting with whose number it is, as a mark and not a sentence", async ({ page }) => {
  await page.goto("/play");
  await page.locator(".pl-lu").first().click();
  const cards = page.getByRole("dialog", { name: "LALIGA EA SPORTS lineup" }).locator(".pl-pc");

  const first = cards.nth(0).locator(".pl-start");
  await expect(first).toContainText("50% starts");
  await expect(first.getByRole("img", { name: "FF" })).toBeVisible();
  await expect(first.getByRole("img", { name: "Doubt" })).toBeVisible();
  await expect(first).toHaveAttribute("title", /50% to start · FF: Futbol Fantasy's expected lineup · doubt/);
  await expect(cards.nth(1).locator(".pl-start").getByRole("img", { name: "SO" })).toBeVisible();
  await expect(cards.nth(2).locator(".pl-start").getByRole("img", { name: "SF" })).toBeVisible();
  await expect(cards.nth(3)).toContainText("plays"); // a card the payload says nothing about keeps what it had
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

test("the gameweek that was played shows what each lineup really scored and won", async ({ page, request }) => {
  // The week picker in the top bar is the only gameweek control there is.
  await page.goto("/play");
  await page.locator(".wk-trigger").click();
  // Which LaLiga round sits inside Sorare GW15, and which month holds it, depends on the shift the mock applies
  // at start-up, so naming either would make this true only on the day it was written. Play counts in Sorare
  // game weeks and the panel lists each of them once (lib/weeks.ts, pageWeeks), so the number addresses it.
  const week15 = await gameweek(request, "15");
  await showMonthOf(page, week15);
  await page.locator(".wk-panel").getByRole("radio", { name: /GW15\b/ }).click();
  await expect(page).toHaveURL(addressOf(week15)); // the week's own address, which carries a suffix when a day is claimed twice
  await expect(page.getByRole("heading", { level: 1, name: "Gameweek 15" })).toBeVisible();
  await expect(page.locator(".pl-eyebrow").first()).toContainText("Sorare · played");

  await page.getByRole("group", { name: "Show" }).getByRole("link", { name: "After the games" }).click();
  await expect(page).toHaveURL(/after=1$/);
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

test("Play lists the weeks Sorare hasn't opened yet, and their page says so", async ({ page, request }) => {
  // A LaLiga round far ahead: no Sorare game week covers it yet, and it was missing from Play's picker.
  const later = (await playWeeks(request)).filter((week) => !week.gw && week.md !== null).at(-1)!;
  await page.goto("/play");
  await page.locator(".wk-trigger").click();
  await showMonthOf(page, later);
  const row = page.locator(".wk-panel").getByRole("radio", { name: new RegExp(`^LaLiga GW${later.md}\\b`) });
  await expect(row).toContainText("Sorare opens later");
  await row.click();
  await expect(page).toHaveURL(new RegExp(`/play\\?w=${later.id}$`));
  await expect(page.getByRole("heading", { level: 1, name: `LaLiga GW${later.md}` })).toBeVisible();
  await expect(page.locator(".empty-state")).toContainText("Sorare hasn't opened this week.");
});

test("every gameweek of the season is in Play's picker, and one Sofix didn't keep says so", async ({ page, request }) => {
  // GW13, GW14 and GW16 finished before the job started keeping weeks: the payload lists them and holds nothing for them.
  const weeks = await playWeeks(request);
  const notKept = weeks.filter((week) => week.gw && week.state === "done" && !week.kept);
  expect(notKept.length).toBeGreaterThan(0);
  const old = notKept[0]!;

  await page.goto("/play");
  await page.locator(".wk-trigger").click();
  await showMonthOf(page, old);
  const row = page.locator(".wk-panel").getByRole("radio", { name: new RegExp(`^GW${old.number}\\b`) });
  await expect(row).toContainText("not recorded");
  await row.click();
  await expect(page).toHaveURL(new RegExp(`/play\\?w=${old.id}$`));
  await expect(page.getByRole("heading", { level: 1, name: `Gameweek ${old.number}` })).toBeVisible();
  await expect(page.locator(".empty-state")).toContainText("Sofix didn't keep the plans for this gameweek");
});

test("a gameweek Sofix didn't keep still shows what you entered in it and what it won, read from Sorare", async ({ page, request }) => {
  const old = (await playWeeks(request)).find((week) => week.gw && week.state === "done" && !week.kept)!;
  const slug = sorare.timeline.find((item) => item.id === old.gw)!.slug;
  await fakeExtension(page, [slug]);

  await page.goto(`/play?w=${old.id}`);
  await expect(page.getByRole("heading", { level: 1, name: `Gameweek ${old.number}` })).toBeVisible();
  const mine = page.getByRole("region", { name: "Your Sorare lineups" });
  await expect(mine).toContainText(`GW${old.number}`);
  await expect(mine).toContainText("Friday team");
  await expect(mine.locator(".pl-entered-result b")).toHaveText("313");
  await expect(mine.locator(".pl-entered-result small")).toHaveText("Rank 1,204 · $2.50 · 250 essence");

  // Nothing overflows on a phone.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(mine).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("a week the job kept apart opens as the week that was played, with the best lineups in hindsight", async ({ page, request }) => {
  const weeks = await playWeeks(request);
  const kept = weeks.find((week) => week.kept && week.gw !== sorare.lastId && week.state === "done")!; // GW14: kept, not on the page
  await page.goto("/play");
  await page.locator(".wk-trigger").click();
  await showMonthOf(page, kept);
  const row = page.locator(".wk-panel").getByRole("radio", { name: new RegExp(`^GW${kept.number}\\b`) });
  await expect(row).toContainText("our plan's replay"); // its headline comes from the timeline, not "not recorded"
  await row.click();

  await expect(page.getByRole("heading", { level: 1, name: `Gameweek ${kept.number}` })).toBeVisible();
  await expect(page.locator(".pl-eyebrow").first()).toContainText("Sorare · played");
  await page.getByRole("group", { name: "Show" }).getByRole("link", { name: "After the games" }).click();
  await expect(page).toHaveURL(/after=1/);

  // The plans, then the best lineups in hindsight as the last tab: what it could have won, and no guess of what it expected.
  const tabs = page.getByRole("navigation", { name: "Plan" }).getByRole("link");
  await expect(tabs).toHaveCount(3);
  await tabs.last().click();
  await expect(page).toHaveURL(/plan=3/);
  const hero = page.locator(".pl-hero");
  await expect(hero.locator(".pl-eyebrow").first()).toHaveText("The best lineups in hindsight");
  await expect(hero.locator(".pl-side")).toContainText("2 of 2 lineups paid");
  await expect(hero.locator(".pl-side")).toContainText("knowing every score, with your cards today");
  await expect(hero.locator(".pl-pair b").first()).toHaveText("500");
  await expect(hero.locator(".pl-pair small").first()).toHaveText("the most Sofix found it could have won");
  const first = page.locator(".pl-lu").first();
  await expect(first).toContainText("scored");
  await expect(first).not.toContainText("xScore");

  // Before the lock there is no hindsight: it is not what the plan was.
  await page.goto(`/play?w=${kept.id}`);
  await expect(page.getByRole("navigation", { name: "Plan" }).getByRole("link")).toHaveCount(2);
});

test("the week just played on the page has the same best lineups in hindsight", async ({ page, request }) => {
  await page.goto("/play");
  await page.locator(".wk-trigger").click();
  await showMonthOf(page, await gameweek(request, "15"));
  await page.locator(".wk-panel").getByRole("radio", { name: /GW15\b/ }).click();
  await page.getByRole("group", { name: "Show" }).getByRole("link", { name: "After the games" }).click();
  await page.getByRole("navigation", { name: "Plan" }).getByRole("link", { name: /In hindsight/ }).click();
  await expect(page.locator(".pl-hero .pl-pair b").first()).toHaveText("500");
});

test("a LaLiga round Sorare has not opened opens as an early plan that says so and cannot be entered", async ({ page, request }) => {
  const early = (await playWeeks(request)).find((week) => week.early)!; // MD8: the job made it an early plan
  await page.goto("/play");
  await page.locator(".wk-trigger").click();
  await showMonthOf(page, early);
  const row = page.locator(".wk-panel").getByRole("radio", { name: new RegExp(`^LaLiga GW${early.md}\\b`) });
  await expect(row).toContainText("early plan");
  await row.click();

  await expect(page.getByRole("heading", { level: 1, name: `LaLiga GW${early.md}` })).toBeVisible();
  await expect(page.locator(".pl-eyebrow").first()).toContainText("Sorare · not open yet");
  const note = page.getByRole("status").filter({ hasText: "An early plan" });
  await expect(note).toContainText("Sorare hasn't opened this week");
  await expect(note).toContainText("GW17"); // the competitions it borrows

  // One plan, and nothing here reaches Sorare: no Apply, and no lineups of yours to read for a gameweek that does not exist.
  await expect(page.getByRole("button", { name: "Apply plan" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Your Sorare lineups" })).toHaveCount(0);
  await expect(page.locator(".pl-hero")).toBeVisible();
  const tabs = page.getByRole("navigation", { name: "Plan" }).getByRole("link");
  await expect(tabs).toHaveCount(1);

  // The plan's own link keeps the week you are on rather than jumping to another.
  await tabs.click();
  await expect(page).toHaveURL(new RegExp(`w=${early.id}`));
  await expect(page.getByRole("heading", { level: 1, name: `LaLiga GW${early.md}` })).toBeVisible();

  // A round with no early plan (the far end of the season here) still says Sorare has not opened it.
  const bare = (await playWeeks(request)).filter((week) => week.md !== null && !week.gw && !week.early).at(-1)!;
  await page.goto(`/play?w=${bare.id}`);
  await expect(page.locator(".empty-state")).toContainText("Sorare hasn't opened this week");
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

test("the week in the bar moves the whole app, a month at a time", async ({ page, request }) => {
  await page.goto("/play");
  const trigger = page.locator(".wk-trigger");
  await expect(trigger).toContainText("GW17"); // the gameweek being planned

  await trigger.click();
  const panel = page.locator(".wk-panel");
  // It opens on the month of the week you are on, with that week checked.
  await expect(panel.getByRole("radio", { name: /^GW17\b/ })).toHaveAttribute("aria-checked", "true");
  // A month at a time, so a whole season stays one screen.
  await expect(panel.locator(".wk-months button").first()).toBeVisible();
  await expect(panel.locator(".wk-foot")).toContainText("open on Sorare");

  // Which LaLiga round sits inside Sorare GW15, and which month holds it, depends on the shift the mock applies
  // at start-up, so naming either would make this true only on the day it was written. Play counts in Sorare
  // game weeks and the panel lists each of them once (lib/weeks.ts, pageWeeks), so the number addresses it.
  const week15 = await gameweek(request, "15");
  await showMonthOf(page, week15);
  const played = panel.getByRole("radio", { name: /GW15\b/ });
  await expect(played).toContainText("our plan's replay");
  await played.click();
  await expect(page).toHaveURL(addressOf(week15));
  await expect(page.getByRole("heading", { level: 1, name: "Gameweek 15" })).toBeVisible();
  await expect(trigger).toContainText("GW15");

  // The same week, carried to another page by the address alone. Each page counts in its own gameweeks and
  // shows its own days: Play the whole Sorare game week, the board the LaLiga round inside it — which can be
  // one of two, so the round is the week here and the game week is the wider span. The mock moves the Sorare
  // weeks with the clock and not the recorded grid, so whether any round sits inside GW15 changes through the
  // day: the page is held to what the week really holds, read from what is served, never to one of the two.
  const week = new URL(page.url()).searchParams.get("w")!;
  await page.goto(`/difficulty?w=${week}`);
  if (week15.md !== null) {
    await expect(page.locator(".wk-trigger b")).toHaveText(`GW${week15.md}`);
    await expect(page.locator(".toolbar .range")).toContainText(`GW${week15.md}`); // the board followed the week
  } else {
    await expect(page.locator(".wk-trigger b")).toHaveText("Sorare GW15"); // no round of ours to name it by
    await expect(page.locator(".toolbar")).toHaveCount(0); // and no round invented to draw (it says LaLiga is away)
  }
  // Which days each page prints for it is covered where the rule lives (lib/weeks.test.ts).
  await expect(page.locator("#gw-select")).toHaveCount(0); // the board's own selector is gone
});

test("Apply opens on the first step and does nothing until it is pressed", async ({ page }) => {
  await page.goto("/play");
  await page.getByRole("button", { name: "Apply plan" }).click();
  const sheet = page.locator(".ap");
  await expect(sheet).toBeVisible();

  // One hero, the lineup's own xScore, and the three steps in order.
  await expect(sheet.locator(".ap-num b")).toHaveText(/^\d+$/);
  await expect(sheet.locator(".ap-rail")).toContainText("1Check2Draft3Enter");
  await expect(sheet.locator(".ap-step > span.on")).toContainText("Check");
  // Every card the lineup holds, starters then subs, as many as its head says.
  const head = (await sheet.locator(".ap-what").textContent())!.match(/(\d+) \+ (\d+) subs/)!;
  const starters = Number(head[1]);
  const subs = Number(head[2]);
  await expect(sheet.locator(".ap-pc")).toHaveCount(starters + subs);
  await expect(sheet.locator(".ap-pc.sub")).toHaveCount(subs);

  // Playwright's Chrome has no extension, so the sheet says so instead of pretending, and the step that
  // would write anything cannot be pressed.
  await expect(sheet.locator(".ap-verdict")).toContainText("This browser can't reach the extension");
  await expect(sheet.getByRole("link", { name: /Set it up/ })).toHaveAttribute("href", "/control");
  await expect(sheet.getByRole("button", { name: "Check with Sorare" })).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: "Try again" })).toBeEnabled();
  await expect(sheet.locator(".ap-foot .note")).toHaveText("Nothing has been saved.");

  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toBeHidden();
});

test("the days in Play's header are the ones the week picker shows, for a planned week and an early one", async ({ page, request }) => {
  const header = page.locator(".pl-head .pl-sub span").first();
  const dates = async () => (await page.locator(".wk-trigger .wk-when").innerText()).trim();

  await page.goto("/play");
  await expect(header).toContainText(await dates());

  const early = (await playWeeks(request)).find((week) => !week.gw && week.early);
  expect(early, "the mock serves an early plan").toBeTruthy();
  await page.goto(`/play?w=${early!.id}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("LaLiga GW");
  await expect(header).toContainText(await dates());
});

test("a lineup entered for a week that has not locked says when it locks, not that it is still scoring", async ({ page }) => {
  await fakeExtension(page, [planned.gameweek.slug], true);
  await page.goto("/play");
  const lineup = page.getByRole("region", { name: "Your Sorare lineups" }).locator(".pl-entered-lineup");

  await expect(lineup.locator(".pl-entered-result small")).toHaveText(/^Locks in (\d+ d \d+ h|\d+ h|\d+ min)$/);
  await expect(lineup.locator(".pl-entered-result b")).toHaveText("–");
  await expect(lineup.locator(".pl-entered-card .sc")).toHaveCount(0);
  await expect(lineup).not.toContainText("Still scoring");
});
