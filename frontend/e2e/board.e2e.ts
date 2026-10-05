import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { scaleBucket } from "../lib/grid";
import { gameweekMatches } from "../lib/matches";
import type { Sorare } from "../lib/play";
import type { ApiResponse } from "../lib/types";
import { seasonWeeks, weekOn } from "../lib/weeks";
import { E2E_PORT } from "./constants";
import { grid, MOCK, offline, openingMatchday, resetBackend, servedGrid, sorare, teamRows } from "./helpers";

test.beforeEach(async ({ page, request }) => {
  await resetBackend(request);
  await offline(page);
});

const group = (page: Page, name: string) => page.getByRole("group", { name, exact: true });
const column = (number: number) => grid.matchdays.findIndex((md) => md.number === number);

/**
 * The weeks as the app works them out from what the mock serves, which moves every date with the clock: the week
 * Sorare is planning (in the recording it holds no LaLiga round and has your players' games) and the week Today opens.
 */
async function servedWeeks(request: APIRequestContext) {
  const served = ((await (await request.get(`${MOCK}/api/sorare`)).json()) as ApiResponse<Sorare>).data!;
  const now = new Date();
  const weeks = seasonWeeks(await servedGrid(request), served, now);
  return { weeks, planned: weeks.find((week) => week.gw === served.nextId)!, today: weekOn(weeks, now)! };
}

test("first load shows the overview, then the grid and the fixtures, from the opening gameweek", async ({ page }) => {
  await page.goto("/difficulty");
  await expect(page.getByRole("heading", { level: 1, name: "Fixtures & Difficulty" })).toBeVisible();
  await expect(page.locator(".wk-trigger")).toBeVisible(); // the week lives in the bar now, not in the board
  await expect(page.getByRole("article", { name: /^Most points coming: / })).toBeVisible();
  await expect(page.getByRole("article", { name: /^Fewest points coming: / })).toBeVisible();
  await expect(page.locator(".run-card")).toHaveCount(2); // the schedule swings sit behind each card's arrow
  for (const title of [`Gameweek ${openingMatchday}`, "Who to pick", "Expected points", "Table", "Fixture grid", `Gameweek ${openingMatchday} fixtures`]) {
    await expect(page.getByRole("heading", { level: 2, name: title, exact: true })).toBeVisible();
  }
  await expect(page.locator(".run-card .bento-meta").first()).toHaveText(`GW${openingMatchday}–GW${openingMatchday + 4}`);
  await expect(page.locator(".ladder-card .list-rows > li")).toHaveCount(grid.teams.length);
  await expect(page.locator(".table-card .list-rows > li")).toHaveCount(grid.teams.length);
  await expect(teamRows(page)).toHaveCount(grid.teams.length); // the full grid sits under the cards
  await expect(page.locator(".toolbar .range")).toHaveText(`GW${openingMatchday} – GW${openingMatchday + 4}`);
  await expect(page.getByRole("button", { name: /Open the full fixture grid/ })).toHaveCount(0);
});

test("each run card's arrow swaps it to the matching schedule swing", async ({ page }) => {
  await page.goto("/difficulty");
  const card = page.getByRole("article", { name: /^Most points coming: / });
  await card.getByRole("button", { name: "Show softest schedule" }).click();
  await expect(page.getByRole("article", { name: /^Softest schedule: / })).toBeVisible();
  await expect(page.getByRole("article", { name: /^Most points coming: / })).toHaveCount(0);
  // The other card is untouched, and both are still the same height.
  const fewest = page.getByRole("article", { name: /^Fewest points coming: / });
  await expect(fewest).toBeVisible();
  const softest = page.getByRole("article", { name: /^Softest schedule: / });
  expect((await softest.boundingBox())!.height).toBeCloseTo((await fewest.boundingBox())!.height, 0);
  await softest.getByRole("button", { name: "Show most points coming" }).click();
  await expect(page.getByRole("article", { name: /^Most points coming: / })).toBeVisible();
});

test("the expected points ranking is ordered, follows the horizon and lens, and lines up with the table", async ({ page }) => {
  await page.goto("/difficulty");
  const ladder = page.locator(".ladder-card");
  const values = (await ladder.locator(".list-rows .list-num").allTextContents()).map((text) => parseFloat(text));
  expect(values).toEqual([...values].sort((a, b) => b - a));
  await expect(ladder.locator(".list-rows .tiles[data-count='5']")).toHaveCount(grid.teams.length); // one tile per gameweek

  await group(page, "Horizon").getByRole("button", { name: "Next 5" }).click();
  await group(page, "Lens").getByRole("button", { name: "Attack" }).click();
  await expect(ladder.getByRole("heading", { level: 2, name: "Expected goals" })).toBeVisible();
  await expect(ladder.locator(".list-columns .list-num")).toHaveText("xG");
  await expect(page).toHaveURL(/lens=attack/);

  await group(page, "Lens").getByRole("button", { name: "Defence" }).click(); // longest title
  for (const width of [1440, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const tops = (selector: string) =>
      page.locator(selector).evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
    expect(await tops(".ladder-card .list-rows > li"), `rows line up at ${width}px`).toEqual(await tops(".table-card .list-rows > li"));
  }
});

test("Next shows the gameweek's prices in columns, by lens", async ({ page }) => {
  const opening = column(openingMatchday);
  const priced = grid.teams.find((team) => team.cells[opening]?.[0]?.market)!;
  const market = priced.cells[opening]![0]!.market!;
  await page.goto("/difficulty?h=next");
  const ladder = page.locator(".ladder-card");
  const row = ladder.locator(".list-rows > li").filter({ has: page.getByRole("link", { name: priced.name, exact: true }) });

  await expect(ladder.locator(".list-columns .price")).toHaveText(["W", "D", "L"]);
  await expect(row.locator(".price")).toHaveText([(1 / market.win).toFixed(2), (1 / market.draw).toFixed(2), (1 / market.loss).toFixed(2)]);
  await expect(row.locator(".mkt-pct")).toHaveText(`${Math.round(market.win * 100)}%`);
  await expect(row).toContainText(`gameweek ${openingMatchday}:`); // spoken summary for screen readers

  await group(page, "Lens").getByRole("button", { name: "Attack" }).click();
  await expect(ladder.locator(".list-columns .price")).toHaveText(["Scores", "2+", "BTS"]);
  await group(page, "Lens").getByRole("button", { name: "Defence" }).click();
  await expect(ladder.locator(".list-columns .price")).toHaveText(["CS", "Conc 2+"]);
  await expect(row.locator(".price").first()).toHaveText((1 / market.clean_sheet).toFixed(2));
});

test("Next 3 puts the chosen price in each gameweek's tile", async ({ page }) => {
  const opening = column(openingMatchday);
  const priced = grid.teams.find((team) => team.cells[opening]?.[0]?.market)!;
  await page.goto("/difficulty?h=3");
  const ladder = page.locator(".ladder-card");
  const row = ladder.locator(".list-rows > li").filter({ has: page.getByRole("link", { name: priced.name, exact: true }) });
  const tiles = row.locator(".tile");

  await expect(tiles).toHaveCount(3);
  await expect(tiles.nth(0).locator(".tile-price")).toHaveText((1 / priced.cells[opening]![0]!.market!.win).toFixed(2));
  await expect(tiles.nth(2).locator(".tile-price")).toHaveCount(0); // the third gameweek isn't priced yet
  await expect(ladder.locator(".gw-labels .unpriced").first()).toContainText("not priced");

  await ladder.getByLabel("Price shown in each gameweek's tile").selectOption({ label: "Win or draw" });
  const m = priced.cells[opening]![0]!.market!;
  await expect(tiles.nth(0).locator(".tile-price")).toHaveText((1 / (m.win + m.draw)).toFixed(2));
});

test("the Odds lens ranks clubs by the bookmakers and colours the grid the same way", async ({ page }) => {
  await page.goto("/difficulty?h=3");
  const ladder = page.locator(".ladder-card");
  await group(page, "Lens").getByRole("button", { name: "Odds", exact: true }).click();
  await expect(page).toHaveURL(/lens=odds/);
  await expect(ladder.getByRole("heading", { level: 2, name: "Market odds" })).toBeVisible();
  await expect(ladder.locator(".list-columns .list-num")).toHaveText("Mkt/gm");
  const opening = column(openingMatchday);
  const priced = grid.teams.find((team) => team.cells[opening]?.[0]?.market)!;
  const bucket = scaleBucket(priced.cells[opening]![0]!.market!.win, grid.lens_scales.odds);
  const pricedRow = ladder.locator(".list-rows > li").filter({ has: page.getByRole("link", { name: priced.name, exact: true }) });
  await expect(pricedRow.locator(".tile").first()).toHaveClass(new RegExp(`\\bf${bucket}\\b`));
  const values = (await ladder.locator(".list-rows .list-num").allTextContents()).map((text) => parseFloat(text)).filter((v) => !Number.isNaN(v));
  expect(values.length).toBeGreaterThan(10);
  expect(values).toEqual([...values].sort((a, b) => b - a));
  await expect(ladder.getByLabel("Price shown in each gameweek's tile")).toHaveValue("0"); // Win
  await expect(page.locator(".legend")).toContainText("Favourite"); // the grid follows the lens
});

test("the Record lens ranks clubs by how far they beat their price", async ({ page }) => {
  await page.goto("/difficulty?h=5");
  const ladder = page.locator(".ladder-card");
  await group(page, "Lens").getByRole("button", { name: "Record", exact: true }).click();
  await expect(page).toHaveURL(/lens=record/);
  await expect(ladder.getByRole("heading", { level: 2, name: "Wins vs its rating" })).toBeVisible();
  await expect(ladder.locator(".list-columns .list-num")).toHaveText("Gap");
  await expect(page.locator("#grid .legend")).toContainText("Wins more than most");
  // Totals read as signed points, not percentages or goals.
  await expect(ladder.locator(".list-rows > li .list-num").first()).toHaveText(/^([+−]\d+ pts|level) gap against the league/); // + the spoken unit
});

test("very wide screens keep the layout: no sideways scroll, tiles fit, rows still line up", async ({ page }) => {
  for (const width of [1920, 2560]) {
    await page.setViewportSize({ width, height: 1200 });
    for (const path of ["/difficulty?h=next", "/difficulty?h=3&lens=defence", "/difficulty?h=8"]) {
      await page.goto(path);
      await expect(page.locator(".ladder-card .list-rows > li")).toHaveCount(grid.teams.length);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${width} ${path}`).toBe(true);
      const main = (await page.locator("main").boundingBox())!;
      expect(main.width, "the page stops growing at its maximum width").toBeLessThanOrEqual(1600);
      const clipped = await page.locator(".ladder-card .tile, .ladder-card .price").evaluateAll((els) =>
        els.filter((el) => el.scrollWidth > el.clientWidth + 1).length,
      );
      expect(clipped, `${width} ${path} clipped tiles`).toBe(0);
      const tops = (selector: string) =>
        page.locator(selector).evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
      expect(await tops(".ladder-card .list-rows > li")).toEqual(await tops(".table-card .list-rows > li"));
    }
  }
  for (const width of [1100, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/difficulty?lens=defence");
    const controls = page.locator(".ladder-card .bento-controls");
    expect(await controls.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `every lens button visible at ${width}px`).toBe(true);
    if (width > 1200) {
      // The header wraps here; the table's grows with it, so the rows must still line up.
      const tops = (selector: string) =>
        page.locator(selector).evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
      expect(await tops(".ladder-card .list-rows > li"), `rows line up at ${width}px`).toEqual(await tops(".table-card .list-rows > li"));
    }
  }
});

test("the table card switches to the predicted table and opens the full table", async ({ page }) => {
  await page.goto("/difficulty");
  const card = page.locator(".table-card");
  await card.getByRole("group", { name: "Table" }).getByRole("button", { name: "Predicted" }).click();
  await expect(page).toHaveURL(/t=predicted/);
  const points = (await card.locator(".list-rows .list-num").allTextContents()).map(Number);
  expect(points).toEqual([...points].sort((a, b) => b - a));
  await card.getByRole("button", { name: "Full table" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Predicted final table" })).toBeVisible();
});

test("the grid's lens and horizon are kept in the URL", async ({ page }) => {
  await page.goto("/difficulty");
  await group(page, "Grid lens").getByRole("button", { name: "Attack" }).click();
  await expect(page.locator(".legend")).toContainText("More xG");
  await group(page, "Grid horizon").getByRole("button", { name: "Next 3" }).click();
  await expect(page.getByRole("button", { name: /^Sort by gameweek/ })).toHaveCount(3);
  await expect(page).toHaveURL(/lens=attack/);
  await expect(page).toHaveURL(/h=3/);

  await page.reload();
  await expect(group(page, "Grid lens").getByRole("button", { name: "Attack" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /^Sort by gameweek/ })).toHaveCount(3);
});

test("the gameweek selector moves every card, the grid, the fixtures and the table", async ({ page, request }) => {
  const next = openingMatchday + 1;
  const past = openingMatchday - 2; // fully played (the gameweek before the opening one still has a live game)
  await page.goto(`/difficulty?gw=${next}`);
  await expect(page.getByRole("heading", { level: 2, name: `Gameweek ${next}`, exact: true })).toBeVisible();
  await expect(page.locator(".run-card .bento-meta").first()).toHaveText(`GW${next}–GW${next + 4}`);
  await expect(page.locator(".toolbar .range")).toHaveText(`GW${next} – GW${next + 4}`);
  await expect(page.getByRole("heading", { level: 2, name: `Gameweek ${next} fixtures` })).toBeVisible();

  // A played gameweek: its results, and the table as it stood after it.
  await page.goto(`/difficulty?gw=${past}`);
  await expect(page.locator(".gw-card .gw-score").first()).toHaveText(/^FT \d+–\d+$/);
  await expect(page.getByRole("heading", { level: 2, name: `Table after GW${past}` })).toBeVisible();
  const playedAfter = await page.locator(".table-card .list-rows > li").count();
  expect(playedAfter).toBe(grid.teams.length);

  await page.getByRole("group", { name: "View" }).getByRole("button", { name: "Table" }).click();
  await expect(page.getByRole("heading", { level: 2, name: `Table after GW${past}` })).toBeVisible();
  const games = (await page.locator("table.standings tbody tr td:nth-child(3)").allTextContents()).map(Number);
  expect(Math.max(...games)).toBeLessThanOrEqual(past);

  // Today sits beside the picker, not in its menu, and opens the week the clock is in.
  const { planned, today } = await servedWeeks(request);
  await page.getByRole("button", { name: "Today" }).click();
  await expect(page).toHaveURL(new RegExp(`[?&]w=${today.id}(&|$)`));
  // A week with no LaLiga round says so on the table, instead of the board quietly showing a round from another week.
  await page.goto(`/table?w=${planned.id}`);
  await expect(page.locator(".ow-note")).toContainText("LaLiga isn't playing this week");
  await expect(page.getByRole("heading", { level: 2, name: "LaLiga table" })).toBeVisible();
});

test("columns sort from the keyboard", async ({ page }) => {
  await page.goto("/difficulty");
  const totalHeader = page.getByRole("columnheader").filter({ has: page.getByRole("button", { name: /^Sort by total/ }) });
  await page.getByRole("button", { name: /^Sort by total/ }).focus();
  await page.keyboard.press("Enter");
  await expect(totalHeader).toHaveAttribute("aria-sort", "ascending");
  const best = await teamRows(page).first().locator(".avg-num").textContent();
  const totals = await page.locator("tbody .avg-num").allTextContents();
  expect(Math.max(...totals.map(Number))).toBe(Number(best));

  await page.keyboard.press("Enter");
  await expect(totalHeader).toHaveAttribute("aria-sort", "descending");
});

test("a pinned team floats to the top and is remembered", async ({ page, context }) => {
  const team = grid.teams[grid.teams.length - 1]!; // alphabetically last, so moving it is visible
  await page.goto("/difficulty");
  await page.getByRole("button", { name: `Pin ${team.name}` }).click();
  await expect(teamRows(page).first().locator(".team-name")).toHaveText(team.name);
  await expect(page.locator("tr.pin-divider")).toHaveCount(1);
  await expect(page).toHaveURL(new RegExp(`pins=${team.code}`));

  const fresh = await context.newPage();
  await offline(fresh);
  await fresh.goto("/difficulty"); // no pins in the URL: restored from this browser's storage
  await expect(teamRows(fresh).first().locator(".team-name")).toHaveText(team.name);
});

test("fixture tiles work from the keyboard with a tooltip", async ({ page }) => {
  await page.goto("/difficulty");
  const tooltip = page.locator(".tip");
  await page.locator('[data-row="0"][data-col]').first().focus();
  await page.keyboard.press("ArrowRight");
  const focused = page.locator(":focus");
  await expect(focused).toHaveAttribute("aria-label", /^Gameweek \d+, /);
  await expect(tooltip).toHaveClass(/show/);
  await page.keyboard.press("ArrowDown");
  await expect(focused).toHaveAttribute("data-row", "1");
  await page.keyboard.press("Escape");
  await expect(tooltip).not.toHaveClass(/show/);
});

test("the refresh button runs a refresh, then waits out the cooldown", async ({ page, request }) => {
  await request.post(`${MOCK}/__test/reset`); // reset() records a finished run 10 min ago
  await page.goto("/difficulty");
  await page.locator(".status-pill").click(); // the button lives in the Control Center page
  await expect(page).toHaveURL(/\/control$/, { timeout: 30_000 }); // the dev server compiles the page on first visit
  await expect(page.getByRole("heading", { level: 1, name: "Control Center" })).toBeVisible();
  const button = page.locator(".refresh-button");
  await expect(button).toHaveText("Refresh");
  await button.click();
  await expect(button).toHaveText(/Syncing fixtures|Updating predictions|Fetching odds|Starting/, { timeout: 10_000 });
  await expect(button).toHaveText("Up to date", { timeout: 20_000 });
  await expect(button).toHaveText(/^Available in (9|10) min$/, { timeout: 10_000 });
  await expect(button).toBeDisabled();
});

test("a malformed API payload shows the error state, not a broken board", async ({ page, request }) => {
  await resetBackend(request, "malformed");
  await page.goto("/difficulty");
  await expect(page.locator(".empty-state")).toContainText("The fixture data could not be read");
  await expect(page.locator("table")).toHaveCount(0);
  await resetBackend(request); // leave a good payload for the next test
});

test("the gameweek card lists the matches and its details open as match cards in the grid", async ({ page }) => {
  const { matches } = gameweekMatches(grid, column(openingMatchday));
  await page.goto("/difficulty");
  const card = page.locator(".gw-card");
  await expect(card.locator(".gw-match")).toHaveCount(matches.filter((m) => m.homeCell.status !== "finished").length); // GW not finished
  const forecast = matches.find((m) => m.homeCell.prediction && m.homeCell.status !== "finished")!;
  await expect(card.getByText(new RegExp(`${forecast.home.name} v ${forecast.away.name}: ${forecast.home.name} win \\d+%`))).toHaveCount(1);

  await card.getByRole("button", { name: "Match details" }).click();
  await expect(page).toHaveURL(/h=next/);
  await expect(page.locator("#grid .match")).toHaveCount(matches.length);
  await expect(page.locator("#grid")).toBeInViewport();
});

test("the Next horizon shows the gameweek's matches with forecasts and follows the selector", async ({ page }) => {
  const { matches } = gameweekMatches(grid, column(openingMatchday));
  await page.goto("/difficulty");
  await group(page, "Grid horizon").getByRole("button", { name: "Next", exact: true }).click();
  await expect(page).toHaveURL(/h=next/);
  await expect(page.locator(".toolbar .range")).toHaveText(`GW${openingMatchday}`);
  await expect(group(page, "Grid lens")).toHaveCount(0);
  await expect(page.locator(".match")).toHaveCount(matches.length);
  await expect(page.locator(".board .scroll")).toHaveCount(0); // the grid is replaced, not stacked

  const forecast = matches.find((m) => m.homeCell.prediction)!;
  const card = page.getByRole("article", { name: `${forecast.home.name} v ${forecast.away.name}` });
  await expect(card.getByRole("img", { name: new RegExp(`^${forecast.home.name} win \\d+%, draw \\d+%`) })).toBeVisible();
  await expect(card.getByRole("rowheader", { name: "Expected goals" })).toBeVisible();
  await expect(card.getByRole("rowheader", { name: "Clean sheet" })).toBeVisible();

  await page.getByRole("button", { name: "Next gameweek" }).click();
  await expect(page.locator("#grid").getByRole("heading", { level: 2, name: `Gameweek ${openingMatchday + 1}` })).toBeVisible();
});

test("old links from when the board lived at / open its new pages", async ({ page }) => {
  await page.goto("/?view=next");
  await expect(page).toHaveURL(/\/difficulty\?h=next$/);
  await expect(group(page, "Grid horizon").getByRole("button", { name: "Next", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".match").first()).toBeVisible();
  await page.goto(`/?board=grid&from=${openingMatchday + 2}`);
  await expect(page).toHaveURL(new RegExp(String.raw`/difficulty\?gw=${openingMatchday + 2}$`));
  await expect(page.locator(".toolbar .range")).toHaveText(`GW${openingMatchday + 2} – GW${openingMatchday + 6}`);
  await page.goto("/?view=table&t=predicted");
  await expect(page).toHaveURL(/\/table\?t=predicted$/);
  await expect(page.getByRole("heading", { level: 2, name: "Predicted final table" })).toBeVisible();
});

test("the Fixtures tab lists the selected gameweek, results included", async ({ page }) => {
  await page.goto("/difficulty");
  await page.getByRole("group", { name: "View" }).getByRole("button", { name: "Fixtures" }).click();
  await expect(page).toHaveURL(/\/fixtures$/); // the tab is the path; switching it doesn't reload
  await expect(page.getByRole("heading", { level: 2, name: `Gameweek ${openingMatchday} fixtures` })).toBeVisible();
  await expect(page.locator(".fixture-row")).toHaveCount(gameweekMatches(grid, column(openingMatchday)).matches.length);
  await expect(page.locator("#fixtures-title").locator("xpath=..")).toContainText(/\d+ matches? · Madrid time/); // kickoffs carry their time zone
  await expect(page.locator(".bento")).toHaveCount(0);
  await expect(page.locator(".board")).toHaveCount(0);

  // Back into a played gameweek: scores instead of kick-off times.
  await page.goto(`/fixtures?gw=${openingMatchday - 1}`);
  await expect(page.getByRole("heading", { level: 2, name: `Gameweek ${openingMatchday - 1} fixtures` })).toBeVisible();
  await expect(page.locator(".fixture-middle.score").first()).toHaveText(/^\d+–\d+$/);
});

test("the Table tab shows the standings and a predicted final table", async ({ page }) => {
  await page.goto("/difficulty");
  await page.getByRole("group", { name: "View" }).getByRole("button", { name: "Table" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "LaLiga table" })).toBeVisible();
  const rows = page.locator("table.standings tbody tr");
  await expect(rows).toHaveCount(grid.teams.length);
  const points = (await page.locator("table.standings tbody td.strong").allTextContents()).map(Number);
  expect(points).toEqual([...points].sort((a, b) => b - a));

  await page.getByRole("group", { name: "Table" }).getByRole("button", { name: "End of season" }).click();
  await expect(page).toHaveURL(/t=predicted/);
  await expect(page.getByRole("heading", { level: 2, name: "Predicted final table" })).toBeVisible();
  await expect(page.locator("table.standings.predicted tbody tr")).toHaveCount(grid.teams.length);
  const projected = (await page.locator("table.standings.predicted tbody td.strong").allTextContents()).map(Number);
  expect(projected).toEqual([...projected].sort((a, b) => b - a));
  const now = (await page.locator("table.standings.predicted tbody tr td:nth-child(4)").allTextContents()).map(Number); // Pts won so far
  projected.forEach((value, i) => expect(value).toBeGreaterThanOrEqual(now[i]!));

  await page.reload();
  await expect(page.getByRole("heading", { level: 2, name: "Predicted final table" })).toBeVisible();

  // After the round in play: the projection stops at the end of that round.
  await page.getByRole("group", { name: "Table" }).getByRole("button", { name: `After round ${openingMatchday}` }).click();
  await expect(page).toHaveURL(/t=after/);
  await expect(page.getByRole("heading", { level: 2, name: `Projected table after GW${openingMatchday}` })).toBeVisible();
});

test("the Table tab walks back and forward a gameweek at a time, and charts the season", async ({ page }) => {
  const past = openingMatchday - 2; // fully played
  await page.goto("/table");
  // Both modes share one skeleton: the same columns, so nothing shifts when the toggle flips.
  const headers = () => page.locator("table.standings thead th");
  const width = async () => (await page.locator("table.standings thead th").first().boundingBox())!.width;
  await expect(headers()).toHaveCount(10);
  const currentWidth = await width();
  await page.getByRole("group", { name: "Table" }).getByRole("button", { name: "End of season" }).click();
  await expect(headers()).toHaveCount(10);
  expect(await width()).toBeCloseTo(currentWidth, 0);
  await expect(headers().nth(5)).toHaveText("xPts");
  await expect(headers().nth(6)).toHaveText("xGD");

  // Stepping back stops the projection at that gameweek.
  await page.goto(`/table?t=after&gw=${past}`);
  await expect(page.getByRole("heading", { level: 2, name: `Projected table after GW${past}` })).toBeVisible();
  await page.getByRole("group", { name: "Table" }).getByRole("button", { name: "Now" }).click();
  await expect(page.getByRole("heading", { level: 2, name: `Table after GW${past}` })).toBeVisible();

  // The chart: Europe by default, one solid and one dashed line per club shown, and the crest at the end.
  const chart = page.locator(".progression-chart");
  await expect(chart.locator("path[stroke-dasharray='5 5']")).toHaveCount(6); // one projection per club shown
  await expect(chart.locator("path:not([stroke-dasharray])")).not.toHaveCount(0);
  const shown = page.getByRole("group", { name: "Clubs shown" });
  await expect(shown.getByRole("button")).toHaveText(["Europe", "Relegation", "All"]);

  // Every club lives behind one button; picking one switches the view to All and focuses that club.
  await page.getByRole("button", { name: "Clubs", exact: true }).click();
  const picker = page.getByRole("group", { name: "Clubs to follow" });
  await expect(picker.getByRole("checkbox")).toHaveCount(grid.teams.length);
  const club = grid.teams[0]!;
  await picker.getByRole("checkbox", { name: club.name }).check();
  await expect(shown.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".progression-focus")).toContainText(club.name);
  await expect(page.getByRole("button", { name: club.name, exact: true })).toBeVisible(); // the button names the pick
  await expect(chart.locator("path[stroke-dasharray='5 5']")).toHaveCount(grid.teams.length); // the rest stay as context

  // Select all is simply All, coloured; a preset clears the picks.
  await picker.getByRole("button", { name: "Select all" }).click();
  await expect(page.getByRole("button", { name: "All clubs" })).toBeVisible();
  await expect(page.locator(".progression-focus")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await shown.getByRole("button", { name: "Europe" }).click();
  await expect(page.getByRole("button", { name: "Clubs", exact: true })).toBeVisible();
  await expect(chart.locator("path[stroke-dasharray='5 5']")).toHaveCount(6);

  // The (i) button holds the zone and prediction switches, and the key the heading used to carry.
  await expect(page.locator(".progression .insight-meta")).toHaveCount(0);
  const zonesDrawn = () => chart.locator("rect[opacity='0.07']");
  await expect(zonesDrawn()).toHaveCount(4);
  await expect(chart.locator("path[stroke-dasharray='1 5']")).toHaveCount(6);
  await page.getByRole("button", { name: "Chart options" }).click();
  const options = page.getByRole("group", { name: "Chart options" });
  await options.getByRole("checkbox", { name: /Champions League, Europe and relegation/ }).uncheck();
  await expect(zonesDrawn()).toHaveCount(0);
  await options.getByRole("checkbox", { name: /^Prediction/ }).uncheck();
  await expect(chart.locator("path[stroke-dasharray='1 5']")).toHaveCount(0);
});

test("a played game keeps its forecast, with how expected the result was", async ({ page }) => {
  const played = grid.teams.flatMap((team) =>
    team.cells.flatMap((column, i) => column.filter((cell) => cell.status === "finished" && cell.review).map((cell) => ({ team, cell, i }))),
  )[0]!;
  await page.goto(`/difficulty?gw=${grid.matchdays[played.i]!.number}&h=all`);
  const tile = page.locator(`[data-key="${played.team.code}-${played.cell.fixture_id}"]`);
  await expect(tile.locator(".cell-mark")).toHaveText(String(Math.round(played.cell.review!.outcome_chance * 100)));
  await tile.focus();
  const tip = page.locator(".tip.show");
  await expect(tip).toContainText("We gave this result");
  await expect(tip).toContainText("Surprise");
  await expect(tip).toContainText("Difficulty"); // the forecast it carried is still there

  // The Next list keeps a played club's expected points, under a line rather than in a second table.
  await page.goto(`/difficulty?gw=${grid.matchdays[played.i]!.number}&h=next`);
  const ladder = page.locator(".ladder-card");
  await expect(ladder.locator(".list-divider")).toHaveText("Already played");
  const after = ladder.locator(".list-rows > li.played").first();
  await expect(after.locator(".list-num")).toHaveText(/^\d+\.\d/);
});

test("who to pick ranks clubs for each position and pins a club when clicked", async ({ page }) => {
  await page.goto("/difficulty");
  const card = page.locator(".picks-card");
  const picks = card.locator(".pick");
  await expect(picks).toHaveCount(5);
  const xg = (await picks.locator(".pick-value").allTextContents()).map((text) => parseFloat(text));
  expect(xg).toEqual([...xg].sort((a, b) => b - a));
  expect(await picks.locator(".pick-value").first().textContent()).toMatch(/ xG$/);

  await card.getByRole("group", { name: "Position" }).getByRole("button", { name: "Defenders" }).click();
  await expect(picks.locator(".pick-value").first()).toHaveText(/ CS$/);
  const cs = (await picks.locator(".pick-value").allTextContents()).map((text) => parseFloat(text));
  expect(cs).toEqual([...cs].sort((a, b) => b - a));

  const top = picks.first();
  const name = (await top.locator(".pick-name").textContent())!;
  await top.click();
  await expect(top).toHaveAttribute("aria-pressed", "true");
  await expect(teamRows(page).first().locator(".team-name")).toHaveText(name);
  await expect(page.locator(".cell .bucket-num")).toHaveCount(0); // tiles carry no corner number
});

test("team names open the team page", async ({ page }) => {
  await page.goto("/difficulty");
  const team = grid.teams[0]!;
  await page.locator(".ladder-card").getByRole("link", { name: team.name, exact: true }).click();
  // The dev server compiles /team/[code] the first time anyone asks for it, which can take a few seconds.
  await expect(page).toHaveURL(new RegExp(`/team/${team.code}$`), { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1, name: team.name })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Home and away" })).toBeVisible();
  await page.getByRole("link", { name: "← All fixtures" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Fixtures & Difficulty" })).toBeVisible();
});

test("an unknown team code is a 404 page", async ({ page }) => {
  const response = await page.goto("/team/XXX");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
});

test("the status pill opens the Control Center: status, install with a QR code, how it runs", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); // the cards fade in; scan the colours they settle on
  await page.goto("/difficulty");
  await page.locator(".status-pill").click();
  await expect(page).toHaveURL(/\/control$/, { timeout: 30_000 }); // the dev server compiles the page on first visit
  await expect(page.locator(".status-pill")).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { level: 2, name: "All good" })).toBeVisible(); // no database: no setup to nag about
  await expect(page.getByRole("button", { name: "Refresh" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Get the app" })).toBeVisible();
  await expect(page.getByRole("img", { name: `QR code for 127.0.0.1:${E2E_PORT}`, exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: /^GitHub runs the jobs on a clock/ })).toBeVisible();
  const scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(scan.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 4).map((n) => n.target.join(" ")).join("; ")}`)).toEqual([]);
});

test("home (Recap): the gameweek, the best cards, the round as a scoreboard, the table after it and the Sorare blocks", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".rc-head h1")).toHaveText(/^Gameweek \d+$/);
  await expect(page.locator(".rc-head p")).toContainText(`LaLiga round ${openingMatchday}`);
  await expect(page.locator(".rc-pill")).toContainText(/^Locks? /);
  for (const title of ["This round", `Table after round ${openingMatchday}`, "Your lineups", "Missions", "News this week", "Team news"]) {
    await expect(page.getByRole("heading", { level: 2, name: title, exact: true })).toBeVisible();
  }
  const matches = gameweekMatches(grid, column(openingMatchday)).matches.length;
  await expect(page.locator(".rc-mt")).toHaveCount(matches);
  // Each side of a match: its win chance, xG and clean sheet, in that order, under labelled columns.
  await expect(page.locator(".rc-rh")).toContainText("Win");
  await expect(page.locator(".rc-rh")).toContainText("Clean sheet");
  await expect(page.locator(".rc-mt").first().locator(".rc-win")).toHaveCount(2);
  await expect(page.locator(".rc-table tbody tr")).toHaveCount(grid.teams.length);
  // The narrow table keeps its Now and After columns inside its tile (a global min-width once pushed them out).
  expect(await page.locator(".rc-table").evaluate((tile) => tile.querySelector("table")!.getBoundingClientRect().right <= tile.getBoundingClientRect().right + 1)).toBe(true);
  const best = page.locator(".rc-best .rc-card");
  expect(await best.count()).toBeGreaterThan(0);
  expect(await best.count()).toBeLessThanOrEqual(10);
  await expect(best.first().locator(".rc-hex")).toHaveText(/^\d+$/);
  await expect(page.locator(".rc-lu").first().locator(".rc-ring")).toContainText("%");
  const scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(scan.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 4).map((n) => n.target.join(" ")).join("; ")}`)).toEqual([]);

  // A block opens its page for the same gameweek.
  await page.locator(".rc-table").getByRole("link", { name: /Season/ }).click();
  await expect(page).toHaveURL(/\/table$/, { timeout: 30_000 });
});

test("home: the week in the bar moves to a played gameweek and the round follows", async ({ page }) => {
  const past = openingMatchday - 2; // fully played
  // The address carries the round (the mock's dates move with the clock, so its month in the picker is not fixed).
  await page.goto(`/?gw=${past}`);
  const picker = page.getByRole("group", { name: "Choose gameweek" });
  await expect(page.locator(".rc-head p")).toContainText(`LaLiga round ${past}`);
  await expect(page.getByRole("heading", { level: 2, name: `Table after round ${past}` })).toBeVisible();
  // A played match shows its score where the kickoff was.
  await expect(page.locator(".rc-mt time").first()).toHaveText(/^\d+-\d+$/);

  await page.getByRole("button", { name: "Next gameweek" }).click();
  // The bar has to show the round that was picked before the blocks are asked to follow it: one Sorare
  // game week can hold two LaLiga rounds, and each is its own week (lib/weeks.ts).
  await expect(picker.getByRole("button", { expanded: false })).toContainText(`LaLiga round ${past + 1}`);
  await expect(page.locator(".rc-head p")).toContainText(`LaLiga round ${past + 1}`);
  await page.locator(".rc-round").getByRole("link", { name: /All games/ }).click();
  await expect(page).toHaveURL(new RegExp(`/fixtures\\?gw=${past + 1}$`), { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 2, name: `Gameweek ${past + 1} fixtures` })).toBeVisible();
});

test("home: a Sorare-only week says LaLiga is away and identifies each player's real fixture", async ({ page, request }) => {
  // One step back from the week after the one Sorare is planning lands on it.
  const { weeks, planned } = await servedWeeks(request);
  await page.goto(`/?w=${weeks[weeks.indexOf(planned) + 1]!.id}`);
  await page.getByRole("button", { name: "Previous gameweek" }).click();

  await expect(page.locator(".wk-trigger")).toContainText(`Sorare GW${planned.number}`);
  await expect(page.getByRole("heading", { level: 2, name: "No LaLiga this week" })).toBeVisible();
  await expect(page.locator(".hm-top")).toHaveCount(0);
  await expect(page.locator(".ow-games li").first()).toContainText(/\d+%\s*play/);
  await expect(page.locator(".ow-games li").first()).toContainText(/xScore/);
});

test("home: a gameweek the season doesn't have goes back to the home page", async ({ page }) => {
  await page.goto("/?gw=99");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".rc-head p")).toContainText(`LaLiga round ${openingMatchday}`);
});

test("the top bar's place and the switch under it follow the board's own tab switches", async ({ page }) => {
  await page.goto("/difficulty");
  await expect(page.locator(".nav-links").getByRole("link", { name: "Season" })).toHaveAttribute("aria-current", "page");
  const bar = page.locator(".lens");
  await expect(bar.getByRole("link", { name: "Difficulty" })).toHaveAttribute("aria-current", "page");
  await page.getByRole("group", { name: "View" }).getByRole("button", { name: "Table" }).click();
  await expect(page).toHaveURL(/\/table$/);
  await expect(bar.getByRole("link", { name: "Table" })).toHaveAttribute("aria-current", "page");
  await page.reload(); // the address is real: a reload lands on the same tab
  await expect(page.getByRole("heading", { level: 2, name: "LaLiga table" })).toBeVisible();
});

test("the manifest is linked with credentials, so it loads behind Vercel's login", async ({ page, request }) => {
  await page.goto("/difficulty");
  const link = page.locator('link[rel="manifest"]');
  await expect(link).toHaveCount(1);
  await expect(link).toHaveAttribute("crossorigin", "use-credentials");
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ name: "Sofix", display: "standalone", start_url: "/" });
});

test("the board has no automatically detectable accessibility violations", async ({ page }) => {
  test.setTimeout(150_000); // eight pages, each compiled on demand by the dev server and then scanned
  for (const [path, ready] of [
    ["/difficulty", "tbody tr"],
    ["/difficulty?h=next", ".ladder-card .next-line .price"],
    ["/difficulty?h=3&lens=odds", ".ladder-card .tile-price"],
    ["/difficulty?h=3&lens=defence&t=predicted", ".table-card .move"],
    [`/difficulty?gw=${openingMatchday - 2}`, ".gw-score"],
    ["/fixtures", ".fixture-row"],
    ["/table", "table.standings tbody tr"],
    ["/table?t=predicted", "table.standings.predicted tbody tr"],
  ] as const) {
    await page.goto(path);
    await expect(page.locator(ready).first()).toBeVisible();
    const scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(
      scan.violations.map((v) => `${path} ${v.id}: ${v.nodes.slice(0, 4).map((n) => `${n.target.join(" ")} (${n.any[0]?.message ?? ""})`).join("; ")}`),
    ).toEqual([]);
  }
});

test("a week with no LaLiga round shows the games your own players play", async ({ page }) => {
  // The week Sorare is planning holds no LaLiga round at all. Play opens on it, so the week comes from there
  // and travels to the board in the address, the way the top bar's links carry it.
  const planned = sorare.weeks.find((week) => week.gameweek.id === sorare.nextId)!.gameweek.number;
  await page.goto("/play");
  await page.locator(".wk-trigger").click();
  await page.locator(".wk-panel").getByRole("radio", { name: new RegExp(String.raw`GW${planned}\b`) }).click();
  await expect(page).toHaveURL(/\/play\?w=\d{4}-\d{2}-\d{2}$/);
  await page.locator(".lens").getByRole("link", { name: "LaLiga" }).click();
  await expect(page).toHaveURL(/\/fixtures\?w=\d{4}-\d{2}-\d{2}$/);

  const own = page.locator(".ow");
  await expect(own).toBeVisible();
  await expect(own.locator(".ow-cap")).toContainText("LaLiga is away");
  await expect(own.locator(".ow-num b")).toHaveText(/^\d+$/); // one hero: the games there are
  await expect(own.locator(".ow-games li").first().locator(".ow-card img")).toBeVisible(); // the card, not a box
  await expect(page.locator(".fixture-row")).toHaveCount(0); // no LaLiga round is invented for it

  // The same week on the other two tabs: the difficulty we do have, and the table as it stands.
  await page.getByRole("group", { name: "View" }).getByRole("button", { name: "Difficulty" }).click();
  await expect(page.locator(".ow-rank li").first()).toContainText("xScore");
  await expect(page.locator(".board")).toHaveCount(0);

  await page.getByRole("group", { name: "View" }).getByRole("button", { name: "Table" }).click();
  await expect(page.locator(".ow-note")).toContainText("LaLiga isn't playing this week");
  await expect(page.locator("table.standings tbody tr")).toHaveCount(grid.teams.length);
});

test("Control says how often the board refreshes from the real schedule, and the cloud box is not the old 2× a day", async ({ page }) => {
  await page.goto("/control");
  const facts = page.locator(".cc-facts");

  await expect(facts.getByText("3–5×")).toBeVisible();
  await expect(facts).toContainText("board refreshes a day");
  await expect(facts).not.toContainText("2×");
});

test("Season's Fixtures lists every round, and its round numbers jump to each one", async ({ page }) => {
  await page.goto("/season");
  await expect(page.getByRole("heading", { level: 1, name: "All fixtures" })).toBeVisible();
  await expect(page.locator(".season-round")).toHaveCount(grid.matchdays.length);
  await expect(page.locator(`#round-${openingMatchday}`)).toBeInViewport(); // it opens on the round in play
  await expect(page.locator(".lens").getByRole("link", { name: "Fixtures" })).toHaveAttribute("aria-current", "page");
  const last = grid.matchdays[grid.matchdays.length - 1]!.number;
  await page.getByRole("navigation", { name: "Rounds" }).getByRole("link", { name: String(last), exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#round-${last}$`));
  await expect(page.locator(`#round-${last}`)).toBeInViewport();
});
