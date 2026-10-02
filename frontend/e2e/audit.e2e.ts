import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { offline, resetBackend, smallText } from "./helpers";

// The Audit page draws the numbers the job published (e2e/fixtures/audit-response.json: the page of 2 Oct 2026 as backend/app/sorare/audit.py
// builds it from the committed replay of the past and the start record: Sofix's chance written down for GW19's games, none played yet). Nothing
// here recomputes a figure: the tests check that what the payload says reaches the page, and that a figure under the floor is never drawn.

test.beforeEach(async ({ page, request }) => {
  await resetBackend(request);
  await offline(page);
});

test("the page leads with one figure: how often the xScore picks the better of two players", async ({ page }) => {
  await page.goto("/audit");
  await expect(page.getByRole("heading", { level: 1, name: "Audit" })).toBeVisible();

  const hero = page.getByRole("region", { name: "66% of the time it picks the better of two players" });
  await expect(hero.locator(".au-big")).toHaveText("66%");
  await expect(hero.getByText("A coin flip gets 50.")).toBeVisible();
  // what it is set against, and how much stands behind it
  await expect(hero.getByText("An average of his last five games does just as well.")).toBeVisible();
  await expect(hero.getByRole("list", { name: "What the count rests on" }).getByRole("listitem")).toHaveText([
    "39,961 pairs",
    "99 gameweeks",
    "84 of your players",
    "Aug 2025 – Oct 2026",
    "likely 65–67%",
  ]);
  await expect(hero.getByRole("list", { name: /^How often each picks the better of two players/ }).getByRole("listitem")).toHaveText([/^xScore.*66%$/, /^His last five games.*66%$/]);
  await expect(hero.getByRole("link", { name: "How it is counted" })).toHaveAttribute("href", /\/docs\/xscore_success_rate\.md$/);
});

test("the live check says what it is waiting for instead of showing a number", async ({ page }) => {
  await page.goto("/audit");

  const hero = page.getByRole("region", { name: /of the time it picks the better of two players/ });
  await expect(hero.getByText("18 players were written down before the lock. Their gameweeks are not played yet.")).toBeVisible();
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

test("Sofix's chance of starting is shown replayed on the past, band by band", async ({ page }) => {
  await page.goto("/audit");

  const replay = page.locator(".au-replay");
  await expect(replay).toContainText("72%");
  await expect(replay).toContainText("right on 4,615 games, Aug 2025 – Oct 2026");
  await expect(replay).toContainText("right 56% of the time"); // always saying he starts
  const bands = replay.getByRole("list", { name: "What Sofix said against how often he started" }).getByRole("listitem");
  await expect(bands).toHaveCount(4);
  await expect(bands.first()).toContainText("Under 20%");
  await expect(bands.last()).toContainText("80% or more");
  await expect(bands.last()).toContainText("said 83% · started 87%");
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
  await expect(page.locator(".nav-links").getByRole("link", { name: "Table" })).not.toHaveAttribute("aria-current", "page");
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
  const hero = page.getByRole("region", { name: /of the time it picks the better of two players/ });
  await expect(hero.getByText("64% (58–69%) on 130 pairs since the first lock.")).toBeVisible();
});

test("before the first refresh that writes it, the page says so instead of drawing empty figures", async ({ page, request }) => {
  await resetBackend(request, "no-audit");
  await page.goto("/audit");

  await expect(page.getByRole("status")).toContainText("The audit appears after the next refresh.");
  await expect(page.locator(".au-big")).toHaveCount(0);
});

test("no text is smaller than 11 px, nothing scrolls sideways, and the page has no accessibility violations", async ({ page }) => {
  await page.goto("/audit");
  await expect(page.locator(".au-big")).toBeVisible();

  expect(await smallText(page, 11)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(scan.violations).toEqual([]);
});
