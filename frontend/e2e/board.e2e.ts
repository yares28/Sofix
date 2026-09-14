import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { grid, offline, openingMatchday, resetBackend, teamRows } from "./helpers";

test.beforeEach(async ({ page, request }) => {
  await resetBackend(request);
  await offline(page);
});

test("first load opens on the first mostly unplayed matchday", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Fixtures & Difficulty" })).toBeVisible();
  await expect(teamRows(page)).toHaveCount(grid.teams.length);
  await expect(page.locator(".stepper .range")).toHaveText(new RegExp(`^MD${openingMatchday} – MD${openingMatchday + 7}$`));
  await expect(page.getByRole("button", { name: "Previous matchday" })).toBeDisabled();
});

test("lens and horizon change the board and are kept in the URL", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("group", { name: "Lens" }).getByRole("button", { name: "Attack" }).click();
  await expect(page.locator(".legend")).toContainText("More xG");
  await page.getByRole("group", { name: "Horizon" }).getByRole("button", { name: "Next 3" }).click();
  await expect(page.getByRole("button", { name: /^Sort by matchday/ })).toHaveCount(3);
  await expect(page).toHaveURL(/lens=attack/);
  await expect(page).toHaveURL(/h=3/);

  await page.reload();
  await expect(page.getByRole("group", { name: "Lens" }).getByRole("button", { name: "Attack" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /^Sort by matchday/ })).toHaveCount(3);
});

test("the window steps forward, and back into played rounds only when asked", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Next matchday" }).click();
  await expect(page.locator(".stepper .range")).toHaveText(new RegExp(`^MD${openingMatchday + 1} `));
  await page.getByRole("button", { name: "Previous matchday" }).click();
  await expect(page.getByRole("button", { name: "Previous matchday" })).toBeDisabled();

  await page.getByRole("button", { name: "Show played matchdays" }).click();
  await expect(page.getByRole("button", { name: "Previous matchday" })).toBeEnabled();
  await page.getByRole("button", { name: "Previous matchday" }).click();
  await expect(page.locator(".stepper .range")).toHaveText(new RegExp(`^MD${openingMatchday - 1} `));
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
  await expect(focused).toHaveAttribute("aria-label", /^Matchday \d+, /);
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
});
