import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import type { Sorare } from "../lib/play";
import type { ApiResponse } from "../lib/types";
import { seasonWeeks } from "../lib/weeks";
import { MOCK, offline, resetBackend, servedGrid, smallText, sorare as served } from "./helpers";

// The Lineups page draws Futbol Fantasy's probable elevens as the job published them (e2e/fixtures/lineups-response.json: the ten
// real round-8 pages of 30 Sep 2026, served by the mock API with their dates moved to two days ahead). Nothing here recomputes a
// number: the tests check that what the payload says reaches the page, on a desktop and on a phone.

test.beforeEach(async ({ page, request }) => {
  await resetBackend(request);
  await offline(page);
});

test("the round's ten matches sit on one timeline, and the page opens on the next one", async ({ page }) => {
  await page.goto("/lineups");
  await expect(page.getByRole("heading", { level: 1, name: "Who starts this round?" })).toBeVisible();

  const strip = page.getByRole("navigation", { name: /^Matches of LaLiga · Round 8/ });
  await expect(strip.getByRole("link")).toHaveCount(10);
  await expect(strip.getByRole("link").first()).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("status").first()).toContainText("All 20 teams read");
  await expect(page.locator(".lu-lock")).toHaveCount(0);
});

test("the round is drawn as days, each kickoff time once, and a game as its two crests", async ({ page }) => {
  await page.goto("/lineups");
  const strip = page.getByRole("navigation", { name: /^Matches of LaLiga · Round 8/ });

  // the mock moves its dates to be ahead of today, so the days are counted, not named
  await expect(strip.locator(".lu-day")).toHaveCount(4);
  await expect(strip.locator(".lu-day-head b")).toHaveText([/^\d+$/, /^\d+$/, /^\d+$/, /^\d+$/]);
  // two games kick off together on the third day, last: one time, two pairs
  const together = strip.locator(".lu-day").nth(2).locator(".lu-slot").last();
  await expect(together.locator(".lu-slot-time")).toHaveText(/^\d{2}:\d{2}$/);
  await expect(together.getByRole("link")).toHaveCount(2);
  // a game carries no names on the bar; hover or keyboard focus reveals the saved match evidence
  const first = strip.getByRole("link").first();
  await expect(first).toHaveText("");
  await expect(first).toHaveAttribute("aria-label", /^M.laga against Espanyol, \w{3} \d{2}:\d{2}$/);
  await first.hover();
  await expect(page.getByRole("tooltip")).toContainText("Bookmaker chances");
  await expect(page.getByRole("tooltip")).toContainText("Home 39%");
  await expect(page.getByRole("tooltip")).toContainText("Sofix forecast");
  await expect(page.getByRole("tooltip")).toContainText(/xG 0\.8.1\.1/);
  await page.screenshot({ path: "test-results/lineups-desktop-tooltip.png" });
  // the slot of the open match is marked
  await expect(strip.locator(".lu-slot[data-current]")).toHaveCount(1);
  await expect(strip.locator(".lu-slot[data-current]").getByRole("link")).toHaveAttribute("aria-current", "page");
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

test("the reading's times appear on icon hover, and the match links to Futbol Fantasy", async ({ page }) => {
  await page.goto("/lineups?m=22502");

  await expect(page.getByText(/Last read/)).toBeHidden();
  const info = page.getByLabel("Futbol Fantasy reading details");
  await expect(info).toHaveText("");
  await info.hover();
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
  await expect(home.locator(".lu-card .lu-call")).toHaveCount(0);
  await expect(home.locator('.lu-card[aria-label*="called up"]')).toHaveCount(0);
  // Deportivo has: two cards show the mark, and the legend names it
  await expect(away.getByText("Squad list not out.")).toHaveCount(0);
  // the mark says which country: his two letters on the card's corner, the country's name for a screen reader
  const marks = away.locator(".lu-card .lu-call");
  await expect(marks).toHaveCount(2);
  await expect(marks).toHaveText(["KE", "ES"]);
  await expect(marks.first()).toHaveAttribute("aria-label", "Called up by Kenya");
  await expect(marks.nth(1)).toHaveAttribute("aria-label", "Called up by Spain");
  await expect(page.getByText("Called up by his national team", { exact: true })).toBeVisible();
});

test("the legend leaves the call-up out when no club of the match has named its squad", async ({ page }) => {
  await page.goto("/lineups?m=22497");

  await expect(page.locator(".lu-call")).toHaveCount(0);
  await expect(page.getByText("Called up by his national team")).toHaveCount(0);
});

// ------------------------------------------------------------------------ which week the page is for
const header = (page: Page) => page.locator(".lu-head");

async function weeksOf(request: APIRequestContext) {
  const served = ((await (await request.get(`${MOCK}/api/sorare`)).json()) as ApiResponse<Sorare>).data!;
  return seasonWeeks(await servedGrid(request), served, new Date());
}

test("the header names the LaLiga round and its days without a speculative Sorare status", async ({ page }) => {
  await page.goto("/lineups");

  await expect(header(page).locator(".lu-eyebrow")).toHaveText(/^LaLiga round 8 .*\w{3} \d+ . \w{3} \d+ Oct$/);
  await expect(header(page).getByRole("link", { name: /^Sorare/ })).toHaveCount(0);
  await expect(page.getByText(/Futbol Fantasy .* kickoffs in Madrid time/)).toBeVisible();
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

test("the compact ownership switch dims others and the removed summary stays absent", async ({ page }) => {
  await page.goto("/lineups?m=22502");
  await expect(page.getByRole("region", { name: "Your players in this match" })).toHaveCount(0);
  const others = page.locator(".lu-card:not([data-mine])").first();
  const mine = page.locator(".lu-card[data-mine]").first();
  await page.getByRole("switch", { name: "Only my players" }).check();
  await expect(others).toHaveCSS("opacity", "0.22");
  await expect(mine).toHaveCSS("opacity", "1");
  await page.getByRole("radio", { name: "Sorare", exact: true }).check();
  await expect(others).toHaveCSS("opacity", "0.22");
  await page.getByRole("navigation", { name: /^Matches of/ }).getByRole("link").first().click();
  await expect(page.getByRole("switch", { name: "Only my players" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Sorare", exact: true })).toBeChecked();
  await page.getByRole("switch", { name: "Only my players" }).uncheck();
  await expect(page.locator(".lu-card:not([data-mine])").first()).toHaveCSS("opacity", "1");
});

test("a player of yours opens his card on Cards, from the pitch and the alternatives", async ({ page }) => {
  await page.goto("/lineups?m=22498");
  const owned = new Set(served.collection!.map((card) => card.player));
  const hrefs = await page.locator(".lu-go").evaluateAll((links) => links.map((link) => link.getAttribute("href")!));
  const href = hrefs.find((one) => owned.has(one.replace("/cards#p-", "")))!;
  // the pitch and the chips under it link the same way
  await expect(page.locator(".lu-card[data-mine] a.lu-go").first()).toHaveAttribute("href", /^\/cards#p-/);
  await expect(page.locator(".lu-card:not([data-mine]) a.lu-go")).toHaveCount(0);
  await expect(page.locator(".lu-alt[data-mine] a.lu-alt-go").first()).toHaveAttribute("href", /^\/cards#p-/);

  await page.locator(`a.lu-go[href="${href}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  const tile = page.locator(`#${href.split("#")[1]}`);
  await expect(tile).toBeInViewport();
  // the page was reached by a client navigation, where the browser never sets :target: the tile is marked all the same
  await expect(tile).toHaveClass(/is-target/);
  await expect(tile.locator(".art")).toHaveCSS("box-shadow", /rgb\(0, 113, 227\)/);
});

test("switching match answers from the page: no new request, the address follows, and Back returns", async ({ page }) => {
  await page.goto("/lineups?m=22497");
  await page.evaluate(() => {
    (window as unknown as { __kept: boolean }).__kept = true; // a reload would drop it
  });
  const asked: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/lineups") asked.push(request.url());
  });
  const strip = page.getByRole("navigation", { name: /^Matches of LaLiga · Round 8/ });
  const kept = () => page.evaluate(() => (window as unknown as { __kept?: boolean }).__kept === true);

  await strip.getByRole("link", { name: /Rayo against Athletic/ }).click();
  await expect(page).toHaveURL(/\/lineups\?m=22498$/);
  await expect(page.getByRole("article", { name: /^Rayo.* against Athletic/ })).toBeVisible();
  await expect(strip.getByRole("link", { name: /Rayo against Athletic/ })).toHaveAttribute("aria-current", "page");
  await expect(strip.getByRole("link", { name: /^M.laga against Espanyol/ })).not.toHaveAttribute("aria-current", "page");
  expect(await kept(), "the page was not reloaded").toBe(true);
  expect(asked, "nothing was asked of the server").toEqual([]);

  await page.goBack();
  await expect(page).toHaveURL(/\/lineups\?m=22497$/);
  await expect(page.getByRole("article", { name: /^M.laga.* against Espanyol/ })).toBeVisible();
  expect(await kept(), "Back did not reload it either").toBe(true);
});

test("a modified click on a match tab still opens it as a link would", async ({ page, context }) => {
  await page.goto("/lineups?m=22497");
  const strip = page.getByRole("navigation", { name: /^Matches of LaLiga · Round 8/ });
  const opened = context.waitForEvent("page");
  await strip.getByRole("link", { name: /Rayo against Athletic/ }).click({ modifiers: ["Control"] });
  const tab = await opened;
  await expect(tab).toHaveURL(/\/lineups\?m=22498$/);
  await expect(page).toHaveURL(/m=22497$/); // this page stayed where it was
});

test("who can come in sits under each starter's own card, as Futbol Fantasy draws it, and one player can stand under several slots", async ({ page }) => {
  await page.goto("/lineups?m=22493");
  const home = page.getByRole("region", { name: "Alavés lineup" });
  const away = page.getByRole("region", { name: "Atlético lineup" });

  // Atlético: four starters have somebody under them, and Lookman is under two of them
  await expect(away.locator(".lu-card:has(.lu-nx)")).toHaveCount(4);
  await expect(away.locator(".lu-nx", { hasText: "LOOKMAN" })).toHaveCount(2);
  const lee = away.locator(".lu-card").filter({ has: page.locator(".lu-nx", { hasText: "LOOKMAN" }) }).first();
  await expect(lee.locator(".lu-nx")).toHaveCount(1);
  // Alavés: Mariano under Toni, Aleñá under Denis Suárez, Valentini under Jonny, each with his chance
  for (const name of ["DÍAZ", "ALEÑÁ", "VALENTINI"]) {
    const under = home.locator(".lu-nx", { hasText: name });
    await expect(under, name).toHaveCount(1);
    await expect(under).toContainText(/\d+%/);
  }
  // he is not listed a second time among the line's chips, and the page says it is a slot's own list
  await expect(home.locator(".lu-pitch .lu-row .lu-alts .lu-alt", { hasText: "VALENTINI" })).toHaveCount(0);
  await expect(home.getByRole("list", { name: /Could come in for/ })).toHaveCount(3);
});

test("every player is drawn as his Sorare card, yours with the ring, the others with a real card of him", async ({ page }) => {
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await page.route("https://assets.sorare.com/**", (route) => route.fulfill({ contentType: "image/png", body: PNG }));
  await page.goto("/lineups?m=22493");
  const cards = page.locator(".lu-card");

  expect(await cards.count()).toBe(22);
  await expect(page.locator(".lu-card .lu-sil")).toHaveCount(0); // no silhouette anywhere: all 22 are cards
  const others = page.locator(".lu-card:not([data-mine])");
  const mineCount = await page.locator(".lu-card[data-mine]").count();
  await expect(others).toHaveCount(22 - mineCount);
  for (const card of await others.all()) {
    await expect(card).toHaveAttribute("data-rarity", "limited");
    await expect(card.locator("img").first()).toHaveAttribute("src", /assets\.sorare\.com\/card\/e2e-\d+\//);
  }
  // yours keep the ring and are the only ones that link to a card of yours
  await expect(page.locator(".lu-card[data-mine] a.lu-go").first()).toHaveAttribute("href", /^\/cards#p-/);
  await expect(others.locator("a.lu-go")).toHaveCount(0);
});

test("a match with no card art keeps the face and the silhouette for the players it has none of", async ({ page }) => {
  await page.goto("/lineups?m=22502");
  await expect(page.locator(".lu-card:not([data-mine]) .lu-sil").first()).toBeVisible();
});

test("percentages switch source, missing estimates stay blank and FF keeps attribution", async ({ page }) => {
  await page.goto("/lineups?m=22500");
  await expect(page.getByRole("group", { name: "What the colours of the chances mean" })).toHaveCount(0);
  await expect(page.getByText(/% = his chance of starting/)).toHaveCount(0);
  const foyth = page.getByRole("listitem", { name: /^Juan Foyth,/ });
  await expect(foyth.locator(".lu-pct")).toHaveText("40%");
  await expect(foyth.getByRole("link", { name: /40% to start.*Futbol Fantasy/ })).toHaveAttribute("href", /futbolfantasy.com.*22500/);
  const before = await page.locator(".lu-card").count();
  await page.getByRole("radio", { name: "Sorare", exact: true }).check();
  await expect(foyth.locator(".lu-pct")).toHaveText("70%");
  await expect(foyth).toHaveAttribute("aria-label", /70% to start/);
  await expect(page.locator(".lu-card:not([data-mine]) .lu-pct").first()).toHaveText("—");
  await page.getByRole("radio", { name: "Sofix", exact: true }).check();
  await expect(foyth.locator(".lu-pct")).toHaveText("54%");
  await expect(page.locator(".lu-card")).toHaveCount(before);
  await page.getByRole("radio", { name: "Futbol Fantasy", exact: true }).check();
  await expect(foyth.locator(".lu-pct")).toHaveText("40%");
  await page.getByRole("group", { name: "Chance to start source" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "../output/playwright/lineups-desktop.png", fullPage: true });
});

const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test("a card shows his name and position on a quiet skeleton while Sorare's picture is on its way, then the picture alone", async ({ page }) => {
  await page.route("https://assets.sorare.com/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3000)); // the art takes its time
    await route.fulfill({ contentType: "image/png", body: PIXEL });
  });
  await page.goto("/lineups?m=22493");
  const first = page.locator(".lu-card").first();

  await expect(first.locator(".lu-skel")).toBeVisible();
  await expect(first.locator(".lu-skel")).toContainText(/GK|DEF|MID|FWD/);
  await expect(first.locator(".lu-skel b")).not.toHaveText("");
  await expect(first.locator(".lu-skel")).toHaveCount(0, { timeout: 15_000 }); // the picture arrived: nothing of the skeleton is left
  await expect(first.locator("img")).toBeVisible();
});

test("a club's shield in its colour holds the crest's place until the crest arrives, and stays if it never does", async ({ page }) => {
  await page.route("https://crests.football-data.org/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await route.fulfill({ contentType: "image/png", body: PIXEL });
  });
  await page.goto("/lineups?m=22493");
  const shield = page.locator(".lu-match-head .lu-shield").first();

  await expect(shield.locator("svg")).toHaveCSS("opacity", "1");
  const box = await shield.boundingBox();
  expect(box!.width).toBeGreaterThan(40); // the room is kept while it waits
  await expect(shield.locator("svg")).toHaveCSS("opacity", "0", { timeout: 15_000 }); // the crest is there: the shield steps back
});

test("a crest that never arrives leaves the shield in its colour", async ({ page }) => {
  await page.goto("/lineups?m=22493"); // the suite blocks every crest
  await expect(page.locator(".lu-match-head .lu-shield svg").first()).toHaveCSS("opacity", "1");
});

test("the lines of the pitch sit close together: a team shorter than the other keeps its rows tight, not spread to fill the column", async ({ page }) => {
  await page.goto("/lineups?m=22502");
  // the other team's column is made much taller (a long injury list does that): this team's pitch must not spread its lines to fill it
  await page.addStyleTag({ content: ".lu-team.away { min-height: 2200px; }" });
  for (const name of ["Real Sociedad lineup"]) {
    const rows = page.getByRole("region", { name }).locator(".lu-pitch .lu-row:not(.lu-others)");
    const boxes = await rows.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
    const gaps = boxes.slice(0, -1).map((box, index) => boxes[index + 1]!.top - box.bottom);
    for (const [index, gap] of gaps.entries()) expect(gap, `${name}: between line ${index + 1} and ${index + 2}`).toBeLessThanOrEqual(46);
  }
});

test("a payload from before the slots were read still puts the alternatives by line", async ({ page }) => {
  await page.goto("/lineups?m=22502"); // Real Sociedad–Deportivo carries no per-slot names
  await expect(page.locator(".lu-nx")).toHaveCount(0);
  await expect(page.locator(".lu-pitch .lu-alt").first()).toBeVisible();
});

test("a match with none of your players keeps the compact controls", async ({ page }) => {
  await page.goto("/lineups?m=22496");
  await expect(page.getByRole("region", { name: "Your players in this match" })).toHaveCount(0);
  await expect(page.getByRole("switch", { name: "Only my players" })).toBeVisible();
  await page.getByRole("radio", { name: "Sofix", exact: true }).check();
  await expect(page.locator(".lu-card .lu-pct").first()).toHaveText("—");
});

test("alternatives at 5% or less and anyone out or suspended fold into '+N more', and the knocks he plays despite into 'N more fit to play'", async ({ page }) => {
  await page.goto("/lineups?m=22502");
  const home = page.getByRole("region", { name: "Real Sociedad lineup" });
  const away = page.getByRole("region", { name: "Deportivo lineup" });

  // no chip on the pitch is at 5% or less unless it is yours
  for (const chip of await home.locator(".lu-pitch .lu-alt:not([data-mine])").all()) {
    const pct = Number((await chip.innerText()).match(/(\d+)%/)![1]);
    expect(pct, await chip.innerText()).toBeGreaterThan(5);
  }
  // the folded ones are one line, and open to names with their reasons
  const more = home.locator("details.lu-more");
  await expect(more.locator("summary")).toHaveText(/^\+\d+ more$/);
  await expect(more.getByText("ÓSKARSSON")).toBeHidden();
  await more.locator("summary").click();
  await expect(more.getByText("ÓSKARSSON")).toBeVisible();
  await expect(more).toContainText("the list below says why");
  // "Also in the squad, at 0%" is gone
  await expect(page.getByText("Also in the squad, at 0%")).toHaveCount(0);
  // the knock he plays despite is folded away from the news
  await expect(away.locator(".lu-news > li.lu-new", { hasText: "Amatucci" })).toHaveCount(0);
  await expect(away.locator(".lu-fit summary")).toHaveText("1 more fit to play");
  await away.locator(".lu-fit summary").click();
  await expect(away.locator(".lu-fit").getByText("Lorenzo Amatucci")).toBeVisible();
});

test("every text on a match is 11 px or more", async ({ page }) => {
  await page.goto("/lineups?m=22502"); // Real Sociedad–Deportivo: injuries, a call-up, your players, alternatives
  await page.waitForTimeout(400);
  expect(await smallText(page, 11)).toEqual([]);
});
