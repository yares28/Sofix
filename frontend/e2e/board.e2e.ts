import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { gameweekMatches } from "../lib/matches";
import { grid, offline, openingMatchday, resetBackend, teamRows } from "./helpers";

test.beforeEach(async ({ page, request }) => {
  await resetBackend(request);
  await offline(page);
});

const group = (page: Page, name: string) => page.getByRole("group", { name, exact: true });
const column = (number: number) => grid.matchdays.findIndex((md) => md.number === number);

test("first load shows the overview, then the grid and the fixtures, from the opening gameweek", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Fixtures & Difficulty" })).toBeVisible();
  await expect(page.locator("#gw-select").locator("option:checked")).toHaveText(new RegExp(`^GW${openingMatchday} · .* · next$`));
  await expect(page.getByRole("article", { name: /^Kindest run: / })).toBeVisible();
  await expect(page.getByRole("article", { name: /^Toughest run: / })).toBeVisible();
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

test("the expected points ranking is ordered, follows the horizon and lens, and lines up with the table", async ({ page }) => {
  await page.goto("/");
  const ladder = page.locator(".ladder-card");
  const values = (await ladder.locator(".list-rows .list-num").allTextContents()).map((text) => parseFloat(text));
  expect(values).toEqual([...values].sort((a, b) => b - a));
  await expect(ladder.locator(".odds")).toHaveCount(0); // odds only for Next and Next 3

  await group(page, "Horizon").getByRole("button", { name: "Next 5" }).click();
  await group(page, "Lens").getByRole("button", { name: "Attack" }).click();
  await expect(ladder.getByRole("heading", { level: 2, name: "Expected goals" })).toBeVisible();
  await expect(ladder.locator(".list-columns .list-num")).toHaveText("xG");
  await expect(page).toHaveURL(/lens=attack/);

  await group(page, "Lens").getByRole("button", { name: "Defence" }).click(); // longest title
  for (const width of [1280, 1100]) {
    await page.setViewportSize({ width, height: 900 });
    const tops = (selector: string) =>
      page.locator(selector).evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
    expect(await tops(".ladder-card .list-rows > li"), `rows line up at ${width}px`).toEqual(await tops(".table-card .list-rows > li"));
  }
});

test("Next and Next 3 show bookmaker odds beside each gameweek, by lens", async ({ page }) => {
  const opening = column(openingMatchday);
  const priced = grid.teams.find((team) => team.cells[opening]?.[0]?.market)!;
  await page.goto("/?h=next");
  const ladder = page.locator(".ladder-card");
  const row = ladder.locator(".list-rows > li").filter({ has: page.getByRole("link", { name: priced.name, exact: true }) });

  await expect(ladder.locator(".odds-head")).toHaveText([`GW${openingMatchday} W · D · L odds`]);
  await expect(row.locator(".odds-line")).toHaveText([/^W \d+\.\d\d$/, /^D \d+\.\d\d$/, /^L \d+\.\d\d$/]);
  const win = priced.cells[opening]![0]!.market!.win;
  await expect(row.locator(".odds-line").first()).toHaveText(`W ${(1 / win).toFixed(2)}`);
  await expect(row).toContainText(`gameweek ${openingMatchday}:`); // spoken summary for screen readers

  await group(page, "Lens").getByRole("button", { name: "Attack" }).click();
  await expect(row.locator(".odds-line")).toHaveText([/^Scores \d/, /^2\+ \d/]);
  await group(page, "Lens").getByRole("button", { name: "Defence" }).click();
  await expect(row.locator(".odds-line")).toHaveText([/^CS \d/, /^Conc 2\+ \d/]);

  // Three gameweeks: the third isn't priced yet.
  await group(page, "Horizon").getByRole("button", { name: "Next 3" }).click();
  await expect(page).toHaveURL(/h=3/);
  await expect(ladder.locator(".list-columns .odds-head")).toHaveCount(3);
  await expect(row.locator(".odds-cell").nth(2)).toContainText("No odds yet");
});

test("the table card switches to the predicted table and opens the full table", async ({ page }) => {
  await page.goto("/");
  const card = page.locator(".table-card");
  await card.getByRole("group", { name: "Table" }).getByRole("button", { name: "Predicted" }).click();
  await expect(page).toHaveURL(/t=predicted/);
  const points = (await card.locator(".list-rows .list-num").allTextContents()).map(Number);
  expect(points).toEqual([...points].sort((a, b) => b - a));
  await card.getByRole("button", { name: "Full table" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Predicted final table" })).toBeVisible();
});

test("the grid's lens and horizon are kept in the URL", async ({ page }) => {
  await page.goto("/");
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

test("the gameweek selector moves every card, the grid, the fixtures and the table", async ({ page }) => {
  const next = openingMatchday + 1;
  const past = openingMatchday - 2; // fully played (the gameweek before the opening one still has a live game)
  await page.goto("/");
  await page.getByRole("button", { name: "Next gameweek" }).click();
  await expect(page).toHaveURL(new RegExp(`gw=${next}`));
  await expect(page.getByRole("heading", { level: 2, name: `Gameweek ${next}`, exact: true })).toBeVisible();
  await expect(page.locator(".run-card .bento-meta").first()).toHaveText(`GW${next}–GW${next + 4}`);
  await expect(page.locator(".toolbar .range")).toHaveText(`GW${next} – GW${next + 4}`);
  await expect(page.getByRole("heading", { level: 2, name: `Gameweek ${next} fixtures` })).toBeVisible();

  // A played gameweek: its results, and the table as it stood after it.
  await page.locator("#gw-select").selectOption(String(column(past)));
  await expect(page).toHaveURL(new RegExp(`gw=${past}`));
  await expect(page.locator(".gw-card .gw-score").first()).toHaveText(/^FT \d+–\d+$/);
  await expect(page.getByRole("heading", { level: 2, name: `Table after GW${past}` })).toBeVisible();
  const playedAfter = await page.locator(".table-card .list-rows > li").count();
  expect(playedAfter).toBe(grid.teams.length);

  await page.getByRole("group", { name: "View" }).getByRole("button", { name: "Table" }).click();
  await expect(page.getByRole("heading", { level: 2, name: `Table after GW${past}` })).toBeVisible();
  const games = (await page.locator("table.standings tbody tr td:nth-child(3)").allTextContents()).map(Number);
  expect(Math.max(...games)).toBeLessThanOrEqual(past);

  await page.getByRole("button", { name: `Back to GW${openingMatchday}` }).click();
  await expect(page).not.toHaveURL(/gw=/);
  await expect(page.getByRole("heading", { level: 2, name: "LaLiga table" })).toBeVisible();
});

test("columns sort from the keyboard", async ({ page }) => {
  await page.goto("/");
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
  await page.goto("/");
  await page.getByRole("button", { name: `Pin ${team.name}` }).click();
  await expect(teamRows(page).first().locator(".team-name")).toHaveText(team.name);
  await expect(page.locator("tr.pin-divider")).toHaveCount(1);
  await expect(page).toHaveURL(new RegExp(`pins=${team.code}`));

  const fresh = await context.newPage();
  await offline(fresh);
  await fresh.goto("/"); // no pins in the URL: restored from this browser's storage
  await expect(teamRows(fresh).first().locator(".team-name")).toHaveText(team.name);
});

test("fixture tiles work from the keyboard with a tooltip", async ({ page }) => {
  await page.goto("/");
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
  await request.post("http://127.0.0.1:8765/__test/reset"); // reset() records a finished run 10 min ago
  await page.goto("/");
  const button = page.locator(".refresh-button");
  await expect(button).toHaveText("Refresh");
  await button.click();
  await expect(button).toHaveText(/Syncing fixtures|Updating predictions|Fetching weather|Fetching odds|Starting/, { timeout: 10_000 });
  await expect(button).toHaveText("Up to date", { timeout: 20_000 });
  await expect(button).toHaveText(/^Available in (9|10) min$/, { timeout: 10_000 });
  await expect(button).toBeDisabled();
});

test("a malformed API payload shows the error state, not a broken board", async ({ page, request }) => {
  await resetBackend(request, "malformed");
  await page.goto("/");
  await expect(page.locator(".empty-state")).toContainText("The fixture data could not be read");
  await expect(page.locator("table")).toHaveCount(0);
  await resetBackend(request); // leave a good payload for the next test
});

test("the gameweek card lists the matches and its details open as match cards in the grid", async ({ page }) => {
  const { matches } = gameweekMatches(grid, column(openingMatchday));
  await page.goto("/");
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
  await page.goto("/");
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

test("old links still work: ?view=next, ?from= and ?board=grid", async ({ page }) => {
  await page.goto("/?view=next");
  await expect(group(page, "Grid horizon").getByRole("button", { name: "Next", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".match").first()).toBeVisible();
  await page.goto(`/?board=grid&from=${openingMatchday + 2}`);
  await expect(page.locator(".toolbar .range")).toHaveText(`GW${openingMatchday + 2} – GW${openingMatchday + 6}`);
});

test("the Fixtures tab lists the selected gameweek, results included", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("group", { name: "View" }).getByRole("button", { name: "Fixtures" }).click();
  await expect(page).toHaveURL(/view=plain/);
  await expect(page.getByRole("heading", { level: 2, name: `Gameweek ${openingMatchday} fixtures` })).toBeVisible();
  await expect(page.locator(".fixture-row")).toHaveCount(gameweekMatches(grid, column(openingMatchday)).matches.length);
  await expect(page.locator(".bento")).toHaveCount(0);
  await expect(page.locator(".board")).toHaveCount(0);

  // Back into a played gameweek: scores instead of kick-off times.
  await page.getByRole("button", { name: "Previous gameweek" }).click();
  await expect(page.getByRole("heading", { level: 2, name: `Gameweek ${openingMatchday - 1} fixtures` })).toBeVisible();
  await expect(page.locator(".fixture-middle.score").first()).toHaveText(/^\d+–\d+$/);
});

test("the Table tab shows the standings and a predicted final table", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("group", { name: "View" }).getByRole("button", { name: "Table" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "LaLiga table" })).toBeVisible();
  const rows = page.locator("table.standings tbody tr");
  await expect(rows).toHaveCount(grid.teams.length);
  const points = (await page.locator("table.standings tbody td.strong").allTextContents()).map(Number);
  expect(points).toEqual([...points].sort((a, b) => b - a));

  await page.getByRole("group", { name: "Table" }).getByRole("button", { name: "Predicted" }).click();
  await expect(page).toHaveURL(/t=predicted/);
  await expect(page.getByRole("heading", { level: 2, name: "Predicted final table" })).toBeVisible();
  await expect(page.locator("table.standings.predicted tbody tr")).toHaveCount(grid.teams.length);
  const projected = (await page.locator("table.standings.predicted tbody td.strong").allTextContents()).map(Number);
  expect(projected).toEqual([...projected].sort((a, b) => b - a));
  const now = (await page.locator("table.standings.predicted tbody tr td:nth-child(3)").allTextContents()).map(Number);
  projected.forEach((value, i) => expect(value).toBeGreaterThanOrEqual(now[i]!));

  await page.reload();
  await expect(page.getByRole("heading", { level: 2, name: "Predicted final table" })).toBeVisible();
});

test("who to pick ranks clubs for each position and pins a club when clicked", async ({ page }) => {
  await page.goto("/");
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
  await page.goto("/");
  const team = grid.teams[0]!;
  await page.locator(".ladder-card").getByRole("link", { name: team.name, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/team/${team.code}$`));
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

test("the board has no automatically detectable accessibility violations", async ({ page }) => {
  for (const [path, ready] of [
    ["/", "tbody tr"],
    ["/?h=next", ".ladder-card .odds-line"],
    ["/?h=3&lens=defence&t=predicted", ".table-card .move"],
    [`/?gw=${openingMatchday - 2}`, ".gw-score"],
    ["/?view=plain", ".fixture-row"],
    ["/?view=table", "table.standings tbody tr"],
    ["/?view=table&t=predicted", "table.standings.predicted tbody tr"],
  ] as const) {
    await page.goto(path);
    await expect(page.locator(ready).first()).toBeVisible();
    const scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(
      scan.violations.map((v) => `${path} ${v.id}: ${v.nodes.slice(0, 4).map((n) => `${n.target.join(" ")} (${n.any[0]?.message ?? ""})`).join("; ")}`),
    ).toEqual([]);
  }
});
