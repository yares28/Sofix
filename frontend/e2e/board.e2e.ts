import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { gameweekMatches } from "../lib/matches";
import { grid, offline, openingMatchday, resetBackend, teamRows } from "./helpers";

test.beforeEach(async ({ page, request }) => {
  await resetBackend(request);
  await offline(page);
});

test("first load opens on the first mostly unplayed gameweek", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Fixtures & Difficulty" })).toBeVisible();
  await expect(teamRows(page)).toHaveCount(grid.teams.length);
  await expect(page.locator(".stepper .range")).toHaveText(new RegExp(`^GW${openingMatchday} – GW${openingMatchday + 7}$`));
  await expect(page.getByRole("button", { name: "Previous gameweek" })).toBeDisabled();
});

test("lens and horizon change the board and are kept in the URL", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("group", { name: "Lens" }).getByRole("button", { name: "Attack" }).click();
  await expect(page.locator(".legend")).toContainText("More xG");
  await page.getByRole("group", { name: "Horizon" }).getByRole("button", { name: "Next 3" }).click();
  await expect(page.getByRole("button", { name: /^Sort by gameweek/ })).toHaveCount(3);
  await expect(page).toHaveURL(/lens=attack/);
  await expect(page).toHaveURL(/h=3/);

  await page.reload();
  await expect(page.getByRole("group", { name: "Lens" }).getByRole("button", { name: "Attack" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /^Sort by gameweek/ })).toHaveCount(3);
});

test("the window steps forward, and back into played rounds only when asked", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Next gameweek" }).click();
  await expect(page.locator(".stepper .range")).toHaveText(new RegExp(`^GW${openingMatchday + 1} `));
  await page.getByRole("button", { name: "Previous gameweek" }).click();
  await expect(page.getByRole("button", { name: "Previous gameweek" })).toBeDisabled();

  await page.getByRole("button", { name: "Show played gameweeks" }).click();
  await expect(page.getByRole("button", { name: "Previous gameweek" })).toBeEnabled();
  await page.getByRole("button", { name: "Previous gameweek" }).click();
  await expect(page.locator(".stepper .range")).toHaveText(new RegExp(`^GW${openingMatchday - 1} `));
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
  await page.goto("/");
  const team = grid.teams[grid.teams.length - 1]!; // alphabetically last, so moving it is visible
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
  await expect(button).toHaveText(/Syncing fixtures|Updating predictions|Fetching weather|Starting/, { timeout: 10_000 });
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

test("the Next horizon shows the gameweek's matches with forecasts and steps between gameweeks", async ({ page }) => {
  const column = grid.matchdays.findIndex((md) => md.number === openingMatchday);
  const { matches } = gameweekMatches(grid, column);
  await page.goto("/");
  await page.getByRole("group", { name: "Horizon" }).getByRole("button", { name: "Next", exact: true }).click();
  await expect(page).toHaveURL(/h=next/);
  await expect(page.locator(".stepper .range")).toHaveText(`GW${openingMatchday}`);
  await expect(page.getByRole("group", { name: "Lens" })).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 2, name: `Gameweek ${openingMatchday}` })).toBeVisible();
  await expect(page.locator(".match")).toHaveCount(matches.length);
  await expect(page.locator(".board .scroll")).toHaveCount(0); // the grid is replaced, not stacked

  const forecast = matches.find((m) => m.homeCell.prediction)!;
  const card = page.getByRole("article", { name: `${forecast.home.name} v ${forecast.away.name}` });
  await expect(card.getByRole("img", { name: new RegExp(`^${forecast.home.name} win \\d+%, draw \\d+%`) })).toBeVisible();
  await expect(card.getByRole("rowheader", { name: "Expected goals" })).toBeVisible();
  await expect(card.getByRole("rowheader", { name: "Clean sheet" })).toBeVisible();

  await page.getByRole("button", { name: "Next gameweek" }).click();
  await expect(page.getByRole("heading", { level: 2, name: `Gameweek ${openingMatchday + 1}` })).toBeVisible();
  await expect(page.locator(".pick-measure").first()).toContainText(`GW${openingMatchday + 1}`);
});

test("old Next GW links open the Next horizon", async ({ page }) => {
  await page.goto("/?view=next");
  await expect(page.getByRole("group", { name: "Horizon" }).getByRole("button", { name: "Next", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".match").first()).toBeVisible();
});

test("the Fixtures tab lists one gameweek at a time, results included", async ({ page }) => {
  const column = grid.matchdays.findIndex((md) => md.number === openingMatchday);
  await page.goto("/");
  await page.getByRole("group", { name: "View" }).getByRole("button", { name: "Fixtures" }).click();
  await expect(page).toHaveURL(/view=plain/);
  await expect(page.getByRole("heading", { level: 2, name: `Gameweek ${openingMatchday} fixtures` })).toBeVisible();
  await expect(page.locator(".fixture-row")).toHaveCount(gameweekMatches(grid, column).matches.length);
  await expect(page.locator(".pick-card")).toHaveCount(0);
  await expect(page.locator(".board")).toHaveCount(0);

  // Back into a played gameweek without any toggle: scores instead of kick-off times.
  await page.getByRole("button", { name: "Previous gameweek" }).click();
  await expect(page.getByRole("heading", { level: 2, name: `Gameweek ${openingMatchday - 1} fixtures` })).toBeVisible();
  await expect(page.locator(".fixture-middle.score").first()).toHaveText(/^\d+–\d+$/);
  await page.getByRole("button", { name: "Next gameweek" }).click();
  await page.getByRole("button", { name: "Next gameweek" }).click();
  await expect(page.getByRole("heading", { level: 2, name: `Gameweek ${openingMatchday + 1} fixtures` })).toBeVisible();
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

test("pick cards rank clubs for each position and pin a club when clicked", async ({ page }) => {
  await page.goto("/");
  for (const title of ["Forwards", "Midfielders", "Defenders & keepers"]) {
    await expect(page.getByRole("heading", { level: 2, name: title })).toBeVisible();
  }
  const forwards = page.locator(".pick-card").filter({ has: page.getByRole("heading", { name: "Forwards" }) }).locator(".pick");
  await expect(forwards).toHaveCount(4);
  const xg = (await forwards.locator(".pick-value").allTextContents()).map((text) => parseFloat(text));
  expect(xg).toEqual([...xg].sort((a, b) => b - a));

  const top = forwards.first();
  const name = (await top.locator(".pick-name").textContent())!;
  await top.click();
  await expect(top).toHaveAttribute("aria-pressed", "true");
  await expect(teamRows(page).first().locator(".team-name")).toHaveText(name);
  await expect(page.locator(".cell .bucket-num")).toHaveCount(0); // tiles carry no corner number
});

test("team names open the team page", async ({ page }) => {
  await page.goto("/");
  const team = grid.teams[0]!;
  await page.getByRole("link", { name: team.name, exact: true }).click();
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
  await page.goto("/");
  await expect(teamRows(page)).toHaveCount(grid.teams.length);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  const report = results.violations.map(
    (v) => `${v.id}: ${v.help} → ${v.nodes.slice(0, 6).map((n) => `${n.target.join(" ")} (${n.any[0]?.message ?? ""})`).join("; ")}`,
  );
  expect(report).toEqual([]);

  for (const [path, ready] of [
    ["/?h=next", ".match"],
    ["/?view=plain", ".fixture-row"],
    ["/?view=table", "table.standings tbody tr"],
    ["/?view=table&t=predicted", "table.standings.predicted tbody tr"],
  ] as const) {
    await page.goto(path);
    await expect(page.locator(ready).first()).toBeVisible();
    const scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(scan.violations.map((v) => `${path} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 4).join("; ")}`)).toEqual([]);
  }
});
