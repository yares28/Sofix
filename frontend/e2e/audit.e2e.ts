import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import league from "../lib/data/audit_league.json";
import { offline, resetBackend, smallText } from "./helpers";

// The Audit page draws the numbers the job published (e2e/fixtures/audit-response.json: the page of 2 Oct 2026 as backend/app/sorare/audit.py
// builds it from the committed replay of the past and the start record: Sofix's chance written down for GW19's games, none played yet). Nothing
// here recomputes a figure: the tests check that what the payload says reaches the page, and that a figure under the floor is never drawn.

test.beforeEach(async ({ page, request }) => {
  await resetBackend(request);
  await offline(page);
});

test("the page leads with how often the xScore picks the better of two, per position, now against the old number", async ({ page }) => {
  await page.goto("/audit");
  await expect(page.getByRole("heading", { level: 1, name: "Audit" })).toBeVisible();

  const section = page.getByRole("region", { name: "How often Sofix picks the player who scored more" });
  await expect(section).toContainText("A coin flip hits 50 times in 100.");
  await expect(section).toContainText("One pair, for example"); // what the chart is about, shown with a pair
  const rows = section.getByRole("list", { name: /How often each position's xScore picks the better of two/ }).getByRole("listitem");
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toContainText("Goalkeepers");
  await expect(rows.nth(0)).toContainText(`${Math.round(league.positions[0]!.now!.rate * 100)}%`);
  await expect(rows.nth(3)).toContainText("Forwards");
});

test("the league figures draw every chart from the committed replay: weeks, how close, goalkeepers' chances, who starts, Sorare's number", async ({ page }) => {
  await page.goto("/audit");

  const weeks = page.getByRole("region", { name: /gameweeks$/ });
  await expect(weeks.locator(".lg-wk i")).toHaveCount(league.weeks.length);
  const close = page.getByRole("region", { name: "How far the score lands from the xScore" });
  await expect(close.locator(".lg-hs i")).toHaveCount(28);
  await expect(close.locator(".lg-hs i.mid")).toHaveCount(4);
  await expect(close).toContainText(league.miss.n.toLocaleString("en-GB"));
  await expect(page.getByRole("region", { name: /When Sofix says 30%/ }).locator(".lg-plot .pt")).not.toHaveCount(0);
  await expect(page.getByRole("region", { name: /chance that a player starts, against who started/ }).locator(".lg-plot .pt")).not.toHaveCount(0);
  const vs = page.getByRole("list", { name: "Share of starts within 7 points" }).getByRole("listitem");
  await expect(vs).toHaveText([/^Sorare's projection/, /^Sofix before/, /^Sofix now/]);
});

test("each source says where it stands: nothing yet, nothing yet, or waiting for results, never a made-up figure", async ({ page }) => {
  await page.goto("/audit");

  const ff = page.getByRole("article", { name: "Futbol Fantasy" });
  await expect(ff.getByText("Nothing yet")).toBeVisible();
  await expect(ff).toContainText("LaLiga");
  const sorare = page.getByRole("article", { name: "Sorare" });
  await expect(sorare.getByText("Nothing yet")).toBeVisible();
  await expect(sorare).toContainText("Sorare has not given a start chance for any of your players");
  const sofix = page.getByRole("article", { name: "Sofix" });
  await expect(sofix.getByText("Waiting for results")).toBeVisible();
  await expect(sofix).toContainText("24 games written down before the lock");
  await expect(sofix.getByRole("progressbar", { name: "Games checked" })).toHaveAttribute("aria-valuenow", "0");
  await expect(page.getByRole("progressbar")).toHaveCount(1);
  await expect(page.locator(".au-src-main.figure")).toHaveCount(0); // no figure anywhere under the floor
});

test("the record lists each gameweek written down before its lock", async ({ page }) => {
  await page.goto("/audit");

  const table = page.getByRole("table", { name: /Games written down before each lock/ });
  await expect(table.getByRole("row")).toHaveCount(3); // the head and two gameweeks
  await expect(table.getByRole("row", { name: /Fri 2 Oct/ })).toContainText("21");
  await expect(table.getByRole("row", { name: /Tue 6 Oct/ })).toContainText("3");
});

test("the top bar has the page, and marks it when it is open", async ({ page }) => {
  await page.goto("/audit");

  const link = page.locator(".nav-links").getByRole("link", { name: "Audit" });
  await expect(link).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".nav-links").getByRole("link", { name: "Season" })).not.toHaveAttribute("aria-current", "page");
});

test("with enough games a source shows its figure, and one under the floor still says too few to tell", async ({ page, request }) => {
  await resetBackend(request, "audit-enough");
  await page.goto("/audit");

  const ff = page.getByRole("article", { name: "Futbol Fantasy" });
  await expect(ff.locator(".au-src-main.figure")).toHaveText("74%");
  await expect(ff).toContainText("right on 120 games");
  await expect(ff).toContainText("Error score");
  await expect(ff).toContainText("0.17");
  await expect(ff).toContainText("80% or more");
  await expect(ff).toContainText("88% started");
  const sofix = page.getByRole("article", { name: "Sofix" });
  await expect(sofix.getByText("Too few to tell")).toBeVisible();
  await expect(sofix).toContainText("40 of 100 games checked");
  await expect(sofix.locator(".au-src-main.figure")).toHaveCount(0);
});

test("before the first refresh that writes it, the page says so instead of drawing empty figures", async ({ page, request }) => {
  await resetBackend(request, "no-audit");
  await page.goto("/audit");

  await expect(page.getByRole("status")).toContainText("The audit appears after the next refresh.");
  await expect(page.locator(".lg-card")).toHaveCount(0);
});

test("no text is smaller than 11 px, nothing scrolls sideways, and the page has no accessibility violations", async ({ page }) => {
  await page.goto("/audit");
  await expect(page.locator(".lg-card").first()).toBeVisible();

  expect(await smallText(page, 11)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(scan.violations).toEqual([]);
});
