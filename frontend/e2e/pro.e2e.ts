import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import fixture from "./fixtures/pro-response.json";
import { offline, resetBackend, smallText } from "./helpers";

// Pro draws the block the refresh publishes (e2e/fixtures/pro-response.json: GW35's real boards, cards and start chances, the plan
// research of plans/pro-page.md). Nothing here recomputes a chance: it checks the chain, hold or play and the switches use them.

const laliga = fixture.data.weeks[0]!.boards[0]!;
const byBatch = [...laliga.byBatch].sort((a, b) => a.start.localeCompare(b.start));

test.beforeEach(async ({ page, request }) => {
  await resetBackend(request);
  await offline(page);
});

test("plays every lineup of the matchday, and a cleared one moves the next up a step", async ({ page }) => {
  await page.goto("/pro");
  await expect(page.locator(".nav-links").getByRole("link", { name: "This week" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("tab", { name: /LaLiga/ })).toHaveAttribute("aria-selected", "true");
  const hp = page.getByRole("region", { name: "Hold or play" });
  await expect(hp.locator(".pro-hp-vd b")).toHaveText(`Play all ${byBatch.length}`);
  await expect(hp.locator(".pro-hp-seq li em")).toHaveText(byBatch.map(() => "play"));

  const first = page.locator(".pro-row").first();
  await expect(first.locator(".pro-goal-t b")).toHaveText(String(laliga.steps[0]!.target));
  await first.getByRole("button", { name: "Cleared" }).click();
  await expect(hp.locator(".pro-hp-seq li em").first()).toHaveText("cleared");
  // the next lineup now plays the step above, at its own chance there
  await page.getByRole("tab", { name: /^Sat/ }).click();
  const second = page.locator(".pro-row").first();
  await expect(second.locator(".pro-goal-t b")).toHaveText(String(laliga.steps[1]!.target));
  await expect(second.locator(".pro-pct")).toHaveText(`${Math.round(byBatch[1]!.reach[1]! * 100)}%`);
});

test("best five switches the plan, and a board with no legal five says so", async ({ page }) => {
  await page.goto("/pro");
  await page.getByRole("tab", { name: "Best five" }).click();
  await expect(page.locator(".pro-hp-seq li:not(.is-next)")).toHaveCount(laliga.bestFive.length);
  await page.getByRole("tab", { name: /European Champions/ }).click();
  await expect(page.getByText("No legal lineup this week")).toBeVisible();
});

test("a player entered before his own teamsheet shows his kickoff and has no sub", async ({ page }) => {
  await page.goto("/pro");
  const late = byBatch.flatMap((l) => l.starters).find((s) => s.late);
  expect(late).toBeTruthy();
  const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "Europe/Madrid" }).format(new Date(byBatch.find((l) => l.starters.includes(late!))!.start));
  await page.getByRole("tab", { name: new RegExp(`^${day}`) }).click();
  const card = page.locator(".pro-pc", { has: page.getByText(late!.name, { exact: true }) }).first();
  await expect(card.locator(".pro-late")).not.toBeEmpty();
  await expect(card.locator(".pro-bench > *")).toHaveCount(0);
});

test("Arena leftovers and Not placed list the cards the Sorare page leaves free, twelve a page", async ({ page }) => {
  const week = fixture.data.weeks[0]!;
  await page.goto("/pro");
  await page.getByRole("tab", { name: "Arena leftovers" }).click();
  const free = (list: typeof week.leftovers) => `${list.reduce((n, r) => n + r.free, 0)} cards`;
  await expect(page.locator(".pro-spare-h b")).toHaveText(String(week.leftovers.length));
  await expect(page.locator(".pro-spare-h span")).toContainText(free(week.leftovers));
  await expect(page.locator(".pro-spare-c")).toHaveCount(Math.min(12, week.leftovers.length));
  await expect(page.locator(".pro-spare-c .pro-nm").first()).toHaveText(week.leftovers[0]!.name);
  await page.getByRole("navigation", { name: "Pages" }).getByRole("button", { name: "2" }).click();
  await expect(page.locator(".pro-spare-c .pro-nm").first()).toHaveText(week.leftovers[12]!.name);
  await page.getByRole("tab", { name: "Not placed" }).click();
  await expect(page.locator(".pro-spare-h b")).toHaveText(String(week.notPlaced.length));
  await expect(page.locator(".pro-spare-c .pro-nm").first()).toHaveText(week.notPlaced[0]!.name);
  await page.getByRole("tab", { name: "Pro", exact: true }).click();
  await expect(page.getByRole("region", { name: "Hold or play" })).toBeVisible();
});

test("reads at 1440 and 390 px with no small text, no overflow and no accessibility violations", async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/pro");
    await expect(page.locator(".pro-row").first()).toBeVisible();
    for (const view of ["Pro", "Arena leftovers"]) {
      await page.getByRole("tab", { name: view, exact: true }).click();
      expect(await smallText(page, width === 390 ? 10 : 11)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    }
    await page.getByRole("tab", { name: "Pro", exact: true }).click();
    expect(await smallText(page, width === 390 ? 10 : 11)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    expect((await new AxeBuilder({ page }).include(".pro").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  }
});

test("follows the week in the top bar: the planned gameweek has its boards, a later one says it has none", async ({ page }) => {
  await page.goto("/pro");
  await expect(page.getByRole("tab", { name: /LaLiga/ })).toBeVisible();
  await page.getByRole("button", { name: "Next gameweek" }).click();
  await expect(page).toHaveURL(/[?&]w=/);
  await expect(page.locator(".pro-empty")).toBeVisible();
  await expect(page.getByRole("tab", { name: /LaLiga/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Previous gameweek" }).click();
  await expect(page.getByRole("tab", { name: /LaLiga/ })).toBeVisible();
});

// The teamsheet watch (plans/pro-page.md): the page asks the app only inside a lineup's window, only every 5 minutes, and Check now
// starts the job by hand.
function sheetsApi(page: import("@playwright/test").Page, checkedAt: string) {
  const asked = { gets: 0, posts: 0 };
  void page.route("**/api/pro-sheets", (route) => {
    if (route.request().method() === "POST") {
      asked.posts += 1;
      return route.fulfill({ status: 202, json: { run: { status: "queued", conclusion: null, at: checkedAt } } });
    }
    asked.gets += 1;
    return route.fulfill({ json: { version: null, checkedAt, run: null } });
  });
  return asked;
}

test("inside a lineup's teamsheet window it shows when the clock last looked, asks every 5 minutes, and Check now starts the job", async ({ page }) => {
  const start = Date.parse(byBatch[0]!.start);
  await page.clock.install({ time: new Date(start - 40 * 60_000) });
  const asked = sheetsApi(page, new Date(start - 39 * 60_000).toISOString());
  await page.goto("/pro");
  const sheet = page.locator(".pro-row").first().locator(".pro-sheet");
  await expect(sheet).toHaveText("Not checked yet");
  await page.clock.runFor(4 * 60_000);
  expect(asked.gets).toBe(0); // never sooner than 5 minutes
  await page.clock.runFor(90_000);
  await expect.poll(() => asked.gets).toBe(1);
  await expect(sheet).toHaveText(/^Checked \d\d:\d\d$/);
  await page.locator(".pro-row").first().getByRole("button", { name: "Check now" }).click();
  await expect.poll(() => asked.posts).toBe(1);
});

test("outside every teamsheet window it says when the teams are due and asks nothing", async ({ page }) => {
  const start = Date.parse(byBatch[0]!.start);
  await page.clock.install({ time: new Date(start - 3 * 3600_000) });
  const asked = sheetsApi(page, new Date(start - 3 * 3600_000).toISOString());
  await page.goto("/pro");
  const row = page.locator(".pro-row").first();
  await expect(row.locator(".pro-sheet")).toHaveText(/^Teams ~\d\d:\d\d$/);
  await expect(row.getByRole("button", { name: "Check now" })).toHaveCount(0);
  await page.clock.runFor(11 * 60_000);
  expect(asked.gets).toBe(0);
});

test("before the first refresh writes it, the page says so", async ({ page, request }) => {
  await resetBackend(request, "no-sorare");
  await page.goto("/pro");
  await expect(page.getByRole("heading", { name: "No Pro boards read yet" })).toBeVisible();
});
