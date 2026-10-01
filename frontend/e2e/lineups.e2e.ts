import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import type { Sorare } from "../lib/play";
import type { ApiResponse } from "../lib/types";
import { seasonWeeks } from "../lib/weeks";
import { grid, MOCK, offline, resetBackend } from "./helpers";

// The Lineups page draws Futbol Fantasy's probable elevens as the job published them (e2e/fixtures/lineups-response.json: the ten
// real round-8 pages of 30 Sep 2026, served by the mock API with their dates moved to two days ahead). Nothing here recomputes a
// number: the tests check that what the payload says reaches the page, on a desktop and on a phone.

test.beforeEach(async ({ page, request }) => {
  await resetBackend(request);
  await offline(page);
});

test("the round's ten matches sit in one bar, and the page opens on the next one", async ({ page }) => {
  await page.goto("/lineups");
  await expect(page.getByRole("heading", { level: 1, name: "Who starts this round?" })).toBeVisible();

  const strip = page.getByRole("navigation", { name: /^Matches of LaLiga · Round 8/ });
  await expect(strip.getByRole("link")).toHaveCount(10);
  await expect(strip.getByRole("link").first()).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("status").first()).toContainText("All 20 teams read");
});

test("there are no competition tabs when the round has only LaLiga", async ({ page }) => {
  await page.goto("/lineups");

  await expect(page.getByRole("navigation", { name: "Competition", exact: true })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Round", exact: true })).toHaveCount(0);
});

test("a match shows both teams' eleven as cards with their chance of starting, and the alternatives under their lines", async ({ page }) => {
  await page.goto("/lineups?m=22502");
  const home = page.getByRole("region", { name: "Real Sociedad lineup" });

  await expect(home.getByRole("heading", { name: "Real Sociedad" })).toBeVisible();
  await expect(home.getByText("4-2-3-1")).toBeVisible();
  await expect(home.locator(".lu-card")).toHaveCount(11);
  await expect(home.getByLabel(/^Mikel Oyarzabal, 90% to start/)).toBeVisible();
  await expect(home.getByLabel(/^Igor Zubeldia, 50% to start, doubt/)).toBeVisible();
  // the alternatives are named under the line they cover, with their chance
  await expect(home.getByRole("list", { name: "Alternatives, most likely first" }).first()).toBeVisible();
  await expect(home.getByLabel(/^Ander Barrenetxea, 50% to start/)).toBeVisible();
});

test("the owner's players are outlined, with no word for it", async ({ page }) => {
  await page.goto("/lineups?m=22502");
  const home = page.getByRole("region", { name: "Real Sociedad lineup" });

  const mine = home.locator(".lu-card[data-mine]");
  await expect(mine.first()).toBeVisible();
  expect(await mine.count()).toBeGreaterThanOrEqual(2);
  await expect(home.getByLabel(/your card/).first()).toBeVisible();
  await expect(page.getByText("Yours", { exact: true })).toHaveCount(0);
});

test("an injury, a doubt and a ban are icons with a text alternative, and the notes are in English", async ({ page }) => {
  await page.goto("/lineups?m=22502");
  const news = page.getByRole("list", { name: "Real Sociedad injuries and suspensions" });

  await expect(news.getByRole("img", { name: "Out" }).first()).toBeVisible();
  await expect(news.getByRole("img", { name: "Doubt" }).first()).toBeVisible();
  await expect(news.getByRole("img", { name: "Suspended" }).first()).toBeVisible();
  await expect(news).not.toContainText("Duda para");
});

test("the reading's times are behind one small button, and the match links to Futbol Fantasy", async ({ page }) => {
  await page.goto("/lineups?m=22502");

  await expect(page.getByText(/Last read/)).toBeHidden();
  await page.getByText(/^Read /).first().click();
  await expect(page.getByText("Last read")).toBeVisible();
  await expect(page.getByText("Lineups keep changing until kickoff.")).toBeVisible();
  const link = page.getByRole("link", { name: "Open this match on Futbol Fantasy" });
  await expect(link).toHaveAttribute("href", "https://www.futbolfantasy.com/partidos/22502-real-sociedad-deportivo");
  await expect(link).toHaveAttribute("rel", /noopener/);
});

test("another match opens from the bar and keeps its place in the address", async ({ page }) => {
  await page.goto("/lineups");
  await page.getByRole("navigation", { name: /^Matches of/ }).getByRole("link").nth(3).click();

  await expect(page).toHaveURL(/\/lineups\?m=\d+/);
  await expect(page.locator(".lu-match")).toBeVisible();
  await expect(page.locator(".lu-card")).toHaveCount(22);
});

test("the page says so when Futbol Fantasy has not been read", async ({ page, request }) => {
  await resetBackend(request, "no-sorare");
  await page.goto("/lineups");

  await expect(page.getByRole("status")).toContainText("lineups appear after the next refresh");
});

test("the page has no accessibility violations", async ({ page }) => {
  await page.goto("/lineups?m=22502");
  await expect(page.locator(".lu-card").first()).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
});

test("the top bar names the page", async ({ page }) => {
  await page.goto("/lineups");

  await expect(page.locator(".nav-links").getByRole("link", { name: "Lineups" })).toHaveAttribute("aria-current", "page");
});

test("what the site writes about an injury is in English, and a return that has gone by says so", async ({ page }) => {
  await page.goto("/lineups?m=22502");
  const home = page.getByRole("list", { name: "Real Sociedad injuries and suspensions" });
  const away = page.getByRole("list", { name: "Deportivo injuries and suspensions" });

  await expect(home).toContainText("ACL tear");
  await expect(home).toContainText("Hamstring discomfort");
  await expect(home).toContainText("Straight red card");
  await expect(home).toContainText("Out for round 8");
  await expect(home).toContainText("Doubt for round 8");
  await expect(home.locator("em", { hasText: /^Was due back late / })).toHaveCount(1);
  await expect(home).not.toContainText("Out until late");
  await expect(away).toContainText("Muscle overload");
  await expect(away).toContainText("Available for round 8");
  // a diagnosis nobody translated keeps the site's word, and says whose it is
  await expect(away.locator('i[lang="es"]', { hasText: "Pubalgia" })).toHaveAttribute("title", "Futbol Fantasy's own words");
  for (const spanish of ["Rotura", "Molestias", "Roja directa", "Sobrecarga", "Disponible", "Baja ", "Duda para", "Desde "]) {
    await expect(page.locator("main")).not.toContainText(spanish);
  }
});

test("a call-up is shown only for a club whose squad list is out, and the page never says both at once", async ({ page }) => {
  await page.goto("/lineups?m=22502");
  const home = page.getByRole("region", { name: "Real Sociedad lineup" });
  const away = page.getByRole("region", { name: "Deportivo lineup" });

  // Real Sociedad has not named its squad: the note is there, and no card carries a call-up
  await expect(home.getByText("Squad list not out.")).toBeVisible();
  await expect(home.getByRole("img", { name: "Called up by his national team" })).toHaveCount(0);
  await expect(home.locator('.lu-card[aria-label*="called up"]')).toHaveCount(0);
  // Deportivo has: two cards show the mark, and the legend names it
  await expect(away.getByText("Squad list not out.")).toHaveCount(0);
  await expect(away.getByRole("img", { name: "Called up by his national team" })).toHaveCount(2);
  await expect(page.getByText("Called up by his national team", { exact: true })).toBeVisible();
});

test("the legend leaves the call-up out when no club of the match has named its squad", async ({ page }) => {
  await page.goto("/lineups?m=22497");

  await expect(page.getByRole("img", { name: "Called up by his national team" })).toHaveCount(0);
  await expect(page.getByText("Called up by his national team")).toHaveCount(0);
});

// ------------------------------------------------------------------------ which week the page is for
const header = (page: Page) => page.locator(".lu-head > div").first();

async function weeksOf(request: APIRequestContext) {
  const served = ((await (await request.get(`${MOCK}/api/sorare`)).json()) as ApiResponse<Sorare>).data!;
  return seasonWeeks(grid, served, new Date());
}

test("the header names the LaLiga round, its days and the Sorare week it feeds, with a link to plan it", async ({ page }) => {
  await page.goto("/lineups");

  await expect(header(page).locator("p").first()).toContainText(/^LaLiga round 8 · \w{3} \d+ – \w{3} \d+ Oct · Sorare/);
  const sorare = header(page).getByRole("link", { name: /^Sorare/ });
  await expect(sorare).toHaveText(/^Sorare(: not open yet| GW\d+( · locks \w{3} \d{2}:\d{2}| · locked)?)$/);
  await expect(sorare).toHaveAttribute("href", /^\/play\?w=\d{4}-\d{2}-\d{2}$/);
  await expect(page.getByText("Probable elevens from Futbol Fantasy · kickoffs in Madrid time")).toBeVisible();
});

test("arriving for a week that is past says Futbol Fantasy only has the next round", async ({ page, request }) => {
  const past = (await weeksOf(request)).find((week) => week.md !== null && week.md < 8 && week.state === "done")!;
  await page.goto(`/lineups?w=${past.id}`);

  await expect(page.getByRole("status").filter({ hasText: "only has each club's next LaLiga game: round 8." })).toContainText(`Round ${past.md} has been played.`);
});

test("arriving for a national-team week says what that week is", async ({ page, request }) => {
  await resetBackend(request, "no-news-national");
  const national = (await weeksOf(request)).find((week) => week.number === 19 && week.md === null)!;
  await page.goto(`/lineups?w=${national.id}`);

  await expect(page.getByRole("status").filter({ hasText: "only has each club's next LaLiga game: round 8." })).toContainText("GW19 is national-team games.");
});

test("the round's own week adds no line", async ({ page, request }) => {
  const round8 = (await weeksOf(request)).find((week) => week.md === 8)!;
  await page.goto(`/lineups?w=${round8.id}`);

  await expect(page.getByRole("heading", { level: 1, name: "Who starts this round?" })).toBeVisible();
  await expect(page.locator(".lu-flash")).toHaveCount(0);
});

test("a match that is no longer on the site is said so, above the next one", async ({ page }) => {
  await page.goto("/lineups?m=99999");

  await expect(page.getByRole("status").filter({ hasText: "That match is no longer on Futbol Fantasy" })).toBeVisible();
  const strip = page.getByRole("navigation", { name: /^Matches of LaLiga · Round 8/ });
  await expect(strip.getByRole("link").first()).toHaveAttribute("aria-current", "page");
});

test("each match tab says how many of your players are in it and how many are starting, and the legend explains it", async ({ page }) => {
  await page.goto("/lineups");
  const strip = page.getByRole("navigation", { name: /^Matches of LaLiga · Round 8/ });

  for (const tab of await strip.getByRole("link").all()) await expect(tab).toContainText(/\d+ yours · \d+ starting/);
  await expect(page.getByText("on a match tab: your players named in the match, and how many are in the probable eleven")).toBeVisible();
  // never more starting than named
  for (const tab of await strip.getByRole("link").all()) {
    const [, named, starting] = ((await tab.innerText()).match(/(\d+) yours · (\d+) starting/) ?? []).map(Number);
    expect(starting).toBeLessThanOrEqual(named!);
  }
});

test("a pitch card and an alternative's chip write a player's name the same way, with the full name on hover", async ({ page }) => {
  await page.goto("/lineups?m=22502");
  const home = page.getByRole("region", { name: "Real Sociedad lineup" });

  // a player of the eleven: his surname in capitals on the card (a card of yours shows Sorare art instead), his full name on hover
  const oyarzabal = home.locator(".lu-card", { hasText: "GUEDES" });
  await expect(oyarzabal).toHaveAttribute("title", "Gonçalo Guedes");
  // an alternative: the same short form, not the full name
  const chip = home.locator(".lu-alt", { hasText: "BARRENETXEA" });
  await expect(chip).toHaveAttribute("title", "Ander Barrenetxea");
  await expect(chip).not.toContainText("Ander");
  // no chip keeps the long form
  for (const alt of await home.locator(".lu-alt").all()) {
    const full = (await alt.getAttribute("title"))!;
    const text = (await alt.innerText()).replace(/\d+%/, "").trim();
    expect(text, `${full} as a chip`).not.toBe(full.includes(" ") ? full : "");
  }
});
