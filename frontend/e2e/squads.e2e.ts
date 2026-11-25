import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { laneKey, ladder, prize, readable, within, type Target } from "../lib/squads";
import fixture from "./fixtures/squads-response.json";
import startFixture from "./fixtures/squads-start-response.json";
import pairFixture from "./fixtures/squads-pair-response.json";
import anyFixture from "./fixtures/squads-any-response.json";
import { offline, resetBackend, smallText } from "./helpers";

// Squads draws the block the refresh publishes (e2e/fixtures/squads-response.json: LaLiga on the 24 Nov 2026 blocks, built by
// backend/app/sorare/squads.py). Every number below is read from the fixture: nothing is worked out again but the budget's pick.
const block = readable(fixture.data)!;
const celta = block.clubs.find((c) => c.club === "Celta de Vigo")!;
const teamAt = (budget: number, target: Target, mine: boolean) => {
  const lane = celta.pro[laneKey(target)]![mine ? "owned" : "full"];
  const entry = within(lane, budget);
  return entry ? celta.teams.find((t) => t.id === entry.id)! : null;
};
const price = (n: number) => `€${n.toFixed(2)}`;

test.beforeEach(async ({ page, request }) => {
  await resetBackend(request);
  await offline(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("the picker lists every club for the budget, 12 a page, and a club opens with its team's price", async ({ page }) => {
  await page.goto("/squads");
  await expect(page.getByRole("link", { name: "Squads", exact: true })).toHaveAttribute("aria-current", "page");
  const picker = page.getByRole("region", { name: "Clubs for €40" });
  await expect(picker.getByRole("listitem")).toHaveCount(12);
  // the club the page opens on is the picker's first, marked as the one shown
  const first = picker.getByRole("link").first();
  await expect(first).toHaveAttribute("aria-current", "true");
  await picker.getByRole("button", { name: "More clubs" }).click();
  await expect(picker.getByRole("listitem")).toHaveCount(block.clubs.length - 12);
  await expect(picker.getByText("2 of 2")).toBeVisible();

  await page.goto("/squads?club=Celta%20de%20Vigo");
  await expect(page.getByRole("heading", { level: 1, name: "Celta de Vigo" })).toBeVisible();
  const team = teamAt(40, 0.9, true)!;
  await expect(page.locator(".sq-price")).toHaveText(price(team.toBuy));
  await expect(page.locator(".sq-price-side")).toContainText(`${team.cards.length} cards`);
  const owned = team.cards.filter((s) => celta.players[s]!.owned).length;
  await expect(page.locator(".sq-price-side")).toContainText(`you own ${owned}`);
  await expect(page.getByRole("region", { name: "The team" }).locator("li")).toHaveCount(team.cards.length);
});

test("the budget, the coverage target and your cards pick the team from the published frontier, and too small a budget says what it takes", async ({ page }) => {
  await page.goto("/squads?club=Celta%20de%20Vigo");
  const budget = page.getByRole("textbox", { name: "Budget in euros" });
  await budget.fill("25");
  await expect(page.locator(".sq-price")).toHaveText(price(teamAt(25, 0.9, true)!.toBuy));
  await expect(page).toHaveURL(/budget=25/);

  await budget.fill("10");
  await expect(page.getByText("No team inside €10")).toBeVisible();
  const cheapest = celta.pro["0.9"]!.owned[0]!;
  const toBuy = celta.teams.find((t) => t.id === cheapest.id)!.toBuy;
  await page.getByRole("button", { name: `Set €${Math.ceil(toBuy)}` }).click();
  await expect(page.locator(".sq-price")).toHaveText(price(teamAt(Math.ceil(toBuy), 0.9, true)!.toBuy));

  await budget.fill("60");
  await page.getByRole("group", { name: "Five starters in this share of games" }).getByRole("button", { name: "100%" }).click();
  await expect(page.locator(".sq-price")).toHaveText(price(teamAt(60, 1, true)!.toBuy));
  await page.getByRole("switch", { name: "Count my cards" }).click();
  await expect(page.locator(".sq-price")).toHaveText(price(teamAt(60, 1, false)!.full));
  await expect(page).toHaveURL(/cover=100/);
  await expect(page).toHaveURL(/mine=0/);
});

test("a point on the money curve opens its team, and a card with nothing listed shows Sorare's market value as an estimate", async ({ page }) => {
  await page.goto("/squads?club=Celta%20de%20Vigo");
  const lane = celta.pro["0.9"]!.owned;
  const cheapest = celta.teams.find((t) => t.id === lane[0]!.id)!;
  await page.getByRole("button", { name: `${price(cheapest.toBuy)}, ${Math.round(cheapest.mean)} a game: show this team` }).click();
  await expect(page).toHaveURL(new RegExp(`budget=${Math.ceil(cheapest.toBuy)}`));
  await expect(page.locator(".sq-price")).toHaveText(price(teamAt(Math.ceil(cheapest.toBuy), 0.9, true)!.toBuy));
  // the fixture predates buy-now prices: every card is priced at its market value, marked "est."
  await expect(page.getByRole("region", { name: "The team" }).getByText("est.").first()).toBeVisible();
});

test("the start of season picks each team from last season's record, shows how it did this season, who came from where and who is new", async ({ page }) => {
  const start = readable(startFixture.data)!;
  const cel = start.clubs.find((c) => c.club === "Celta de Vigo")!;
  const entry = within(cel.pro["0.9"]!.owned, 40)!;
  const team = cel.teams.find((t) => t.id === entry.id)!;
  await page.goto("/squads?club=Celta%20de%20Vigo&season=start");
  await expect(page.getByRole("heading", { level: 1, name: "Celta de Vigo" })).toBeVisible();
  await expect(page.getByText(`picked from ${start.record}, ${start.rounds} rounds`)).toBeVisible();
  await expect(page.locator(".sq-price")).toHaveText(price(team.toBuy));
  await expect(page.locator(".sq-proof")).toContainText(`${Math.round(team.proof!.mean!)} a game · ${team.proof!.five} of ${team.proof!.games} with five`);
  const moved = team.cards.map((s) => cel.players[s]!).find((p) => p.from)!;
  await expect(page.getByRole("region", { name: "The team" }).getByText(`from ${moved.from}`).first()).toBeVisible();
  await expect(page.getByRole("region", { name: /^New to LaLiga/ }).locator("li")).toHaveCount(cel.newcomers.length);
  // a club with no team at the target shows the coverage the budget buys; a promoted club says NEW
  const picker = page.getByRole("region", { name: "Clubs for €40" });
  await expect(picker.getByRole("link", { name: /^Elche, .*five starters in \d+% of last season's rounds$/ })).toBeVisible();
  await expect(picker.getByRole("link", { name: /^Deportivo La Coruña, new to the league/ })).toContainText("NEW");
  const axe = await new AxeBuilder({ page }).include("main").analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("group", { name: "Season" }).getByRole("button", { name: "Now" }).click();
  await expect(page).not.toHaveURL(/season=start/);
  await expect(page.getByText("13 games this season")).toBeVisible();
});

test("two clubs: pairs ranked by what their Pro board won, one team from both, each club's game a try of its round", async ({ page }) => {
  const pair = readable(pairFixture.data)!.clubs[0]!;
  const entry = within(pair.pro["0.9"]!.owned, 40)!;
  const team = pair.teams.find((t) => t.id === entry.id)!;
  await page.goto("/squads?team=two");
  await expect(page.getByRole("heading", { level: 1, name: "Deportivo Alavés + Racing Santander" })).toBeVisible();
  const picker = page.getByRole("region", { name: "Clubs for €40" });
  await expect(picker.getByRole("listitem")).toHaveCount(12);
  await expect(picker.getByText("1 of 2")).toBeVisible();
  await expect(page.locator(".sq-price")).toHaveText(price(team.toBuy));
  // not double a club's team: one pool, each card wearing its club's crest
  await expect(page.getByRole("region", { name: "The team" }).locator("li")).toHaveCount(team.cards.length);
  await expect(page.locator(".sq-team .sq-badge")).toHaveCount(team.cards.length);
  // the replay: a column a round, the ladder over both tries of it
  const rounds = [...new Set(pair.rounds!)].map((r) => pair.rounds!.flatMap((x, i) => (x === r ? [team.best[i] ?? null] : [])));
  const replay = page.getByRole("region", { name: "Pro or Arena, played all season" });
  await expect(replay.locator(".sq-sum > b")).toHaveText(String(ladder(rounds, block.board!).clears));
  await expect(replay.locator(".sq-col")).toHaveCount(rounds.length);
  const axe = await new AxeBuilder({ page }).include("main").analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  await page.getByRole("group", { name: "Team" }).getByRole("button", { name: "One club" }).click();
  await expect(page).not.toHaveURL(/team=two/);
});

test("a card swaps for another at its position: the team's price and score follow, and one tap brings the best team back", async ({ page }) => {
  await page.goto("/squads?club=Celta%20de%20Vigo");
  const team = teamAt(40, 0.9, true)!;
  const price0 = price(team.toBuy);
  await expect(page.locator(".sq-price")).toHaveText(price0);
  const defender = team.cards.find((s) => celta.players[s]!.pos === "DEF")!;
  await page.getByRole("button", { name: `Swap ${celta.players[defender]!.name}` }).click();
  const list = page.getByRole("region", { name: `Instead of ${celta.players[defender]!.name}` });
  await expect(list.getByRole("button").first()).toBeVisible();
  await list.getByRole("button").first().click();
  await expect(page.getByRole("button", { name: "Back to the best team" })).toBeVisible();
  await expect(page.getByRole("region", { name: "The team" }).locator("li[data-swapped]")).toHaveCount(1);
  await page.getByRole("button", { name: "Back to the best team" }).click();
  await expect(page.locator(".sq-price")).toHaveText(price0);
  await expect(page.getByRole("region", { name: "The team" }).locator("li[data-swapped]")).toHaveCount(0);
});

test("any clubs: the league's one best team, any five of a matchday in one lineup, each card with its club", async ({ page }) => {
  const anyBlock = readable(anyFixture.data)!;
  const pool = anyBlock.clubs[0]!;
  const team = pool.teams.find((t) => t.id === within(pool.pro["0.9"]!.owned, 40)!.id)!;
  await page.goto("/squads?team=any");
  await expect(page.getByRole("heading", { level: 1, name: "Any clubs, LaLiga" })).toBeVisible();
  await expect(page.locator(".sq-picker")).toHaveCount(0); // one team a league: nothing to pick
  await expect(page.locator(".sq-price")).toHaveText(price(team.toBuy));
  await expect(page.locator(".sq-team .sq-badge")).toHaveCount(team.cards.length);
  const axe = await new AxeBuilder({ page }).include("main").analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
});

test("who played shows each game's starters with their score, who came on with his minutes, and the five-starters line", async ({ page }) => {
  await page.goto("/squads?club=Celta%20de%20Vigo");
  const team = teamAt(40, 0.9, true)!;
  const strip = page.getByRole("region", { name: "Who played, by game" });
  await expect(strip.locator("thead th")).toHaveCount(celta.games.length + 1);
  const keeper = team.cards.map((s) => [s, celta.players[s]!] as const).find(([, p]) => p.pos === "GK")!;
  const g = keeper[1].played.indexOf("S");
  await expect(strip.getByLabel(`started, ${Math.round(keeper[1].scores[g]!)}`).first()).toBeVisible();
  const sub = team.cards.map((s) => celta.players[s]!).find((p) => p.played.includes("B"))!;
  const i = sub.played.indexOf("B");
  await expect(strip.getByLabel(`came on for ${sub.mins[i]} minutes`, { exact: false }).first()).toHaveText(`${sub.mins[i]}′`);
  await expect(strip.locator(".sq-five i")).toHaveCount(celta.games.length);
});

test("the season replay: Pro steps on the board, the Arena's prizes, and Sofix's pick before kickoff", async ({ page }) => {
  await page.goto("/squads?club=Celta%20de%20Vigo");
  const team = teamAt(40, 0.9, true)!;
  const replay = page.getByRole("region", { name: "Pro or Arena, played all season" });
  const lad = ladder(team.best.map((v) => [v]), block.board!);
  await expect(replay.locator(".sq-sum > b")).toHaveText(String(lad.clears));
  await expect(replay.locator(".sq-sum > em")).toHaveText(prize(lad.cash, lad.essence)!);
  await replay.getByRole("group", { name: "Score" }).getByRole("button", { name: "Median" }).click();
  const median = ladder(team.median.map((v) => [v]), block.board!);
  await expect(replay.locator(".sq-sum > b")).toHaveText(String(median.clears));

  await replay.getByRole("group", { name: "Lineup" }).getByRole("button", { name: "Sofix xS, before kickoff" }).click();
  await expect(replay.getByRole("group", { name: "Score" }).getByRole("button", { name: "What it scored" })).toHaveAttribute("aria-pressed", "true");

  await replay.getByRole("group", { name: "Mode" }).getByRole("button", { name: /ARENA/ }).click();
  await expect(replay.locator(".sq-sum > span")).toHaveText("paid in the Arena");
  await expect(replay.locator(".sq-mini li")).not.toHaveCount(0);
});

test("readable, no overflow and no accessibility violations at 1440 and 390 px", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/squads?club=Celta%20de%20Vigo");
  await expect(page.getByRole("heading", { level: 1, name: "Celta de Vigo" })).toBeVisible();
  expect(await smallText(page, 11)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const results = await new AxeBuilder({ page }).include("main").analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/squads-1440.png`, fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/squads?club=Celta%20de%20Vigo");
  await expect(page.getByRole("heading", { level: 1, name: "Celta de Vigo" })).toBeVisible();
  expect(await smallText(page, 10)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/squads-390.png`, fullPage: true });
});
