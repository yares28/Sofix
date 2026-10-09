import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import league from "../lib/data/audit_league.json";
import { MOCK, offline, resetBackend, smallText, sorare } from "./helpers";

// The Audit page draws the numbers the job published (e2e/fixtures/audit-response.json: the page of 2 Oct 2026 as backend/app/sorare/audit.py
// builds it from the committed replay of the past and the start record: Sofix's chance written down for GW19's games, none played yet). Nothing
// here recomputes a figure: the tests check that what the payload says reaches the page, and that a figure under the floor is never drawn.

test.beforeEach(async ({ page, request }) => {
  await resetBackend(request);
  await offline(page);
});

test("saved weeks survive without Chrome on Recap, Cards and Rewards, beside the plan frozen at lock", async ({ page, request }) => {
  const card = sorare.collection![0]!;
  const start = `${new Date().getUTCFullYear()}-08-01T14:00:00Z`;
  const saved = { slug: "saved-week", number: 17, start, end: start, savedAt: start,
    lineups: [{ id: "mine", name: "Mine", competition: "LaLiga", board: "board", draft: false, confirmable: false,
      cards: [{ slug: card.slug, player: card.player, name: card.name, rarity: card.rarity, picture: card.pic, score: 70, captain: true }],
      result: { score: 300, rank: 10, essence: 250, cash: 2.5, card: false, xp: 100 } }] };
  await request.post(`${MOCK}/__test/my-weeks`, { data: { weeks: [saved], frozenPlans: [{ slug: saved.slug, number: 17, end: start, builtAt: start,
    plans: [{ rank: 1, lineups: [{ competition: "LaLiga", board: "board", expected: 290, score: 301.5, cameIn: [], bonusLost: false }] }] }] } });
  await page.goto("/");
  const season = page.getByRole("region", { name: "Your season" });
  await expect(season).toContainText("250 essence");
  await expect(season).toContainText("$2.50");
  await page.goto("/cards");
  const gallery = page.locator(".s5-pc").filter({ has: page.getByRole("link", { name: `${card.name}: open his page`, exact: true }) }).first();
  await expect(gallery).toContainText("250 essence");
  await expect(gallery).toContainText("$2.50");
  await page.goto("/audit/rewards");
  await expect(page.getByRole("region", { name: "You", exact: true })).toContainText("250 essence");
  const frozen = page.getByRole("region", { name: "Your lineups against the plan at lock" });
  await expect(frozen).toContainText("301.5");
  await expect(frozen).toContainText("300.0");
  await expect(frozen).toContainText("Rewards for the frozen plan are unknown");
  for (const path of ["/", "/cards", "/audit/rewards"]) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await smallText(page, 10)).toEqual([]);
  }
});

test("the page leads with how often the xScore picks the better of two, per position, now against the old number", async ({ page }) => {
  await page.goto("/audit");
  await expect(page.getByRole("heading", { level: 1, name: "How often the xScore is right" })).toBeVisible();
  await expect(page.locator(".ax-big")).toContainText("A coin flip gets 50."); // one number, said against a coin flip

  const section = page.getByRole("region", { name: "Pick the better of two" });
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
  const vs = page.getByRole("list", { name: "Share of starts within 7 points" }).getByRole("listitem");
  await expect(vs).toHaveText([/^Sorare's projection/, /^Sofix before/, /^Sofix now/]);

  // Sofix's chance that a player starts, against who started, leads Who starts (canvas board 7b).
  await page.goto("/audit/starts");
  await expect(page.getByRole("region", { name: /chance that a player starts, against who started/ }).locator(".lg-plot .pt")).not.toHaveCount(0);
});

test("each source says where it stands: nothing yet, nothing yet, or waiting for results, never a made-up figure", async ({ page }) => {
  await page.goto("/audit/starts");

  const ff = page.getByRole("article", { name: "Futbol Fantasy" });
  await expect(ff.getByText("Nothing yet")).toBeVisible();
  await expect(ff).toContainText("LaLiga");
  const sorare = page.getByRole("article", { name: "Sorare" });
  await expect(sorare.getByText("Nothing yet")).toBeVisible();
  await expect(sorare).toContainText("Sorare has not given a start chance for any recorded player");
  const sofix = page.getByRole("article", { name: "Sofix" });
  await expect(sofix.getByText("Waiting for results")).toBeVisible();
  await expect(sofix).toContainText("24 games written down before the lock");
  await expect(sofix.getByRole("progressbar", { name: "Games checked" })).toHaveAttribute("aria-valuenow", "0");
  await expect(page.getByRole("progressbar")).toHaveCount(1);
  await expect(page.locator(".au-src-main.figure")).toHaveCount(0); // no figure anywhere under the floor
});

test("the record lists each gameweek written down before its lock", async ({ page }) => {
  await page.goto("/audit/record");

  const table = page.getByRole("table", { name: /Games written down before each lock/ });
  await expect(table.getByRole("row")).toHaveCount(3); // the head and two gameweeks
  await expect(table.getByRole("row", { name: /Fri 2 Oct/ })).toContainText("21");
  await expect(table.getByRole("row", { name: /Tue 6 Oct/ })).toContainText("3");
});

test("predicted elevens wait honestly for stored readings and the live xScore record is visible", async ({ page }) => {
  await page.goto("/audit/starts");
  const elevens = page.getByRole("region", { name: "Futbol Fantasy's eleven" });
  await expect(elevens).toContainText("No predicted elevens kept yet");
  await expect(elevens.getByRole("table")).toHaveCount(0);
  expect(await smallText(page, 11)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goto("/audit");
  await expect(page.getByRole("region", { name: "Written before the lock" })).toBeVisible();
});

test("the top bar has the page, and marks it when it is open", async ({ page }) => {
  await page.goto("/audit");

  const link = page.locator(".nav-links").getByRole("link", { name: "Audit" });
  await expect(link).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".nav-links").getByRole("link", { name: "Season" })).not.toHaveAttribute("aria-current", "page");
});

test("with enough games a source shows its figure, and one under the floor still says too few to tell", async ({ page, request }) => {
  await resetBackend(request, "audit-enough");
  await page.goto("/audit/starts");

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

test("the switch under the top bar moves between xScore, Who starts and Written down", async ({ page }) => {
  await page.goto("/audit");
  const lens = page.locator(".lens");
  await expect(lens.getByRole("link", { name: "xScore" })).toHaveAttribute("aria-current", "page");
  await lens.getByRole("link", { name: "Who starts" }).click();
  await expect(page).toHaveURL(/\/audit\/starts/);
  await expect(page.getByRole("heading", { level: 1, name: "Who starts, checked" })).toBeVisible();
  await lens.getByRole("link", { name: "Written down" }).click();
  await expect(page).toHaveURL(/\/audit\/starts#written/);
  await expect(page.getByRole("heading", { level: 2, name: "Written down so far" })).toBeInViewport();

  // An old link to the record page lands on the same section.
  await page.goto("/audit/record");
  await expect(page).toHaveURL(/\/audit\/starts#written/);
});

test("Rewards adds up what the plans expected over the season against what they won, and says too few to tell under the floor", async ({ page }) => {
  await page.goto("/audit/rewards");
  await expect(page.getByRole("heading", { level: 1, name: "Rewards" })).toBeVisible();

  const plans = page.getByRole("region", { name: "Sofix's plans" });
  await expect(plans).toContainText("Too few to tell yet"); // 5 lineups, under the floor of 100: no share is drawn
  await expect(plans).toContainText("5 of 100");
  await expect(plans.locator("dd").nth(0)).toHaveText("183"); // expected: chance x reward, added up
  await expect(plans.locator("dd").nth(1)).toHaveText("250"); // what the plans really won

  const weeks = page.getByRole("region", { name: "Week by week" }).locator("tbody tr");
  await expect(weeks).toHaveCount(2);
  await expect(weeks.first()).toHaveText(/GW18\s*120\s*250/); // newest first

  // What you won is read from Sorare through the extension, which this browser does not have: it says so instead of a zero
  await expect(page.getByRole("region", { name: "You" }).getByRole("status")).toContainText("can't reach the extension");
});

test("Missions says too few to tell under the floor, and lists each day's picks against the cards that did it", async ({ page }) => {
  await page.goto("/audit/missions");
  await expect(page.getByRole("heading", { level: 1, name: "Missions" })).toBeVisible();
  const hero = page.getByRole("region", { name: "Sofix's picks" });
  await expect(hero.getByRole("heading", { name: "Too few to tell yet" })).toBeVisible();
  await expect(hero).toContainText("2 of 100");
  await expect(hero).toContainText("3 of 4"); // achievers caught

  const days = page.getByRole("region", { name: "Day by day" });
  await expect(days.locator(".au-ms-days > li")).toHaveCount(2);
  const first = days.locator(".au-ms-days > li").first();
  await expect(first).toContainText("1 of 3");
  await expect(first.locator(".au-ms-card.hit")).toHaveCount(1);
  await expect(first.locator(".au-ms-card.left")).toHaveCount(2); // Güler and Pedri did it and were not picked
  await expect(days.locator(".au-ms-days > li").nth(1)).toContainText("not loaded");

  await page.getByRole("link", { name: "Missions", exact: true }).first().click();
  await expect(page).toHaveURL(/\/audit\/missions/);
});
