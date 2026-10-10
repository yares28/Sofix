import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { MOCK, resetBackend, servedGrid, smallText } from "./helpers";
import type { Sorare } from "../lib/play";
import { seasonWeeks } from "../lib/weeks";

// The first planned player of the recording carries the picture of his game and a recorded daily stat sheet.
const SLUG = "juan-marcos-foyth";

test.describe("one player's page", () => {
  test.beforeEach(async ({ request }) => { await resetBackend(request); });
  test("restores the selected GW for owned players and player search after the optimizer moves on", async ({ page, request }) => {
    const served = (await (await request.get(`${MOCK}/api/sorare`)).json()).data as Sorare;
    const selected = seasonWeeks(await servedGrid(request), served, new Date()).find(week => week.gw && !week.kept && !served.weeks.some(plan => plan.gameweek.id === week.gw))!;
    expect(selected).toBeTruthy();
    const frozen = structuredClone(served.weeks.find(week => week.playing.players.some(player => player.player === SLUG))!);
    frozen.gameweek = { ...frozen.gameweek, ...served.timeline.find(week => week.id === selected.gw)! };
    const player = frozen.playing.players.find(player => player.player === SLUG)!;
    player.start = 37;
    player.x = 29.6;
    frozen.playing.players = [player];
    const market = served.market!.find(row => row.slug === "raphael-dias-belloli")!;
    const record = { gameweek: frozen.gameweek, players: { [market.slug]: { mu: 50, pPlay: 0.8, pStart: 0.7,
      games: [{ kickoff: frozen.gameweek.start, home: "FC Barcelona", away: "Getafe", competition: "laliga-es", sofix: 55 }] } } };
    await request.post(`${MOCK}/__test/my-weeks`, { data: { livePlan: frozen, chanceRecord: record } });
    await page.goto(`/players/${SLUG}?w=${selected.id}`);
    await expect(page.locator(".pd-x")).toHaveText("37");
    await page.goto(`/players?w=${selected.id}`);
    await page.getByRole("searchbox").fill(market.name);
    const row = page.getByRole("article").filter({ has: page.getByRole("link", { name: market.name, exact: true }) });
    await expect(row.locator(".s5-stat").filter({ hasText: "xScore" }).locator("b")).toHaveText("40");
    await row.getByRole("link", { name: market.name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`\\?w=${selected.id}$`));
    await expect(page.locator(".pd-x")).toHaveText("55");
  });
  test("shows the picture of his game, the stat sheet with its picker, how he compares and his last starts", async ({ page }) => {
    await page.goto(`/players/${SLUG}`);
    const root = page.getByTestId("player-page");
    await expect(root).toBeVisible();
    await expect(root.locator(".pd-x")).toHaveText("52");
    await expect(root.locator(".pd-bars i")).toHaveCount(40);
    await expect(root.locator(".pd-range")).toContainText("Lands between 41 and 80, 8 times in 10");

    // The stat sheet opens on the next game when the game is priced, and one press moves it: one window at a time, never three side by side.
    const picker = root.getByRole("group", { name: "Which games" });
    await expect(picker.getByRole("button", { name: "Last 10" })).toBeVisible();
    await expect(picker.getByRole("button", { name: "Saved starts" })).toBeVisible();
    await picker.getByRole("button", { name: "Last 10" }).click();
    await expect(picker.getByRole("button", { name: "Last 10" })).toHaveAttribute("aria-pressed", "true");
    await expect(root.locator(".pd-row").first()).toBeVisible();
    await expect(root.locator(".pd-tot")).toContainText("All-around points");

    await expect(root.getByRole("heading", { name: /Compared with other/ })).toBeVisible();
    await expect(root.locator(".pd-rail")).not.toHaveCount(0);
    await expect(root.getByRole("heading", { name: /His last \d+ starts/ })).toBeVisible();
    await expect(root.locator(".pd-l10 > div")).toHaveCount(10);
  });

  test("shows saved games, source misses and absence spells without inventing missing results", async ({ page }) => {
    await page.goto(`/players/${SLUG}`);
    const history = page.getByRole("region", { name: "This season" });
    await expect(history).toContainText("one away from a ban");
    await expect(history).toContainText("Sofix mean miss");
    await expect(history).toContainText("Sorare mean miss");
    await expect(history).toContainText("Started");
    await expect(history).toContainText("Came on");
    await expect(history).toContainText("Did not play");
    await expect(history).toContainText("Result not read");
    await expect(history.locator(".pd-saved-game")).toHaveCount(4);
    const injuries = page.getByRole("region", { name: "Injuries and suspensions" });
    await expect(injuries).toContainText("Returned by");
    await expect(injuries).toContainText("Still reported");
    await expect(injuries.getByRole("link", { name: "Futbol Fantasy" })).toHaveCount(2);
    await expect(injuries.getByRole("link", { name: "Futbol Fantasy" }).first()).toHaveAttribute("href", "https://www.futbolfantasy.com/jugadores/juan-foyth");
  });

  test("says so for a player nobody knows, and links from the search", async ({ page }) => {
    const missing = await page.goto("/players/nobody-at-all");
    expect(missing?.status()).toBe(404);
    await page.goto("/players");
    const link = page.locator(".s5-who-link").first();
    if (await link.count()) {
      await link.click();
      await expect(page).toHaveURL(/\/players\/[a-z0-9-]+\?w=/);
    }
  });

  test("fits a phone without a sideways scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/players/${SLUG}`);
    await expect(page.getByTestId("player-page")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(await smallText(page, 10)).toEqual([]);
  });

  test("the saved sections meet the desktop text floor and have no automatic accessibility violations", async ({ page }) => {
    await page.goto(`/players/${SLUG}`);
    expect(await smallText(page, 11)).toEqual([]);
    expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);
  });
});
