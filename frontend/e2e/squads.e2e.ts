import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { laneKey, ladder, prize, readable, within, type Target } from "../lib/squads";
import fixture from "./fixtures/squads-response.json";
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
