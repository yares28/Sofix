import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import league from "../lib/data/audit_league.json";
import { MOCK, offline, resetBackend, smallText, sorare } from "./helpers";

// The Audit page draws the numbers the job published (e2e/fixtures/audit-response.json: the page of 2 Oct 2026 as backend/app/sorare/audit.py
// builds it from the committed replay of the past and the start record: Sofix's chance written down for GW19's games, none played yet). Nothing
// here recomputes a figure: the tests check that what the payload says reaches the page, and that retained statistics and source evidence reach the page without inventing missing values.

test.beforeEach(async ({ page, request }) => {
  await resetBackend(request);
  await offline(page);
});

test("player comparisons cover every saved GW, an all-time summary and URL-restored history; analysis comes first", async ({ page, request, context }) => {
  const model = (await (await request.get(`${MOCK}/api/sorare`)).json()).data;
  const live = model.timeline.find((w: { id: string }) => w.id === model.nextId);
  const card = model.collection[0];
  const row = { player: card.player, name: card.name, pic: card.pic, pos: card.pos, game: "international",
    kickoff: live.start, home: "Spain", away: "Denmark", competition: "International", xscore: 50, by: "sofix",
    sorare: 60, actual: 0, difference: -50, firstScore: 0, played: true, started: true, state: "rechecked",
    checkedAt: live.start, recheckedAt: live.start, firstDue: live.start, recheckDue: live.end, reason: "" };
  const summary = { checked: 1, total: 1, rechecked: 1, starts: 1, xCases: 1, xMiss: 50, sorareCases: 1, sorareMiss: 60 };
  await request.post(`${MOCK}/__test/my-weeks`, { data: {
    chanceRecord: { writtenAt: new Date(Date.parse(live.lock) - 3600000).toISOString(), gameweek: { slug: live.slug, lock: live.lock },
      players: { [card.player]: { games: [{ id: "international", sources: { futbolfantasy: 0, sofix: 0.7 }, ffMatch: { id: 123 } }] } } },
    playerScores: { weeks: [
    { slug: live.slug, number: live.number, rows: [row], summary },
    { slug: "older-record", number: 12, rows: [{ ...row, actual: 70, difference: 20, by: "form" }], summary },
  ] } } });
  await page.goto(`/audit?gw=${live.id}`);
  const section = page.getByRole("region", { name: "Your players, xScore against actual" });
  await expect(section.locator("#player-score-view-help")).toContainText("the GW selected above");
  for (const name of ["Within 7 points, by position", "How far the score lands from the xScore", "Landing within 7 points of the score",
    "When Sofix says 30%, does it happen 30% of the time?", "Match forecasts, checked"]) {
    const above = await page.getByRole("region", { name, exact: true }).evaluate((element) =>
      !!(element.compareDocumentPosition(document.querySelector(".au-player-scores")!) & Node.DOCUMENT_POSITION_FOLLOWING));
    expect(above).toBe(true);
  }
  await expect(section.getByRole("article")).toHaveCount(1);
  await expect(section.locator(".au-score-starts")).toContainText("Sofix start70%");
  await expect(section.locator(".au-score-starts").getByRole("link", { name: "0%" })).toHaveAttribute("href", "https://www.futbolfantasy.com/partidos/123");
  await expect(section.getByRole("article").locator(".au-score-art")).toHaveCSS("width", "96px");
  await section.getByRole("link", { name: "All GWs", exact: true }).click();
  await expect(section.locator("#player-score-view-help")).toContainText("Every saved player game, grouped by GW");
  await expect(section.getByRole("article")).toHaveCount(2);
  await expect(section).toContainText("GW12");
  await expect(section.getByRole("article").last().locator(".au-score-starts")).not.toContainText("70%");
  await section.getByRole("link", { name: "Summary", exact: true }).click();
  await expect(section.locator("#player-score-view-help")).toContainText("One row per player across all saved GWs");
  await expect(section.getByRole("article")).toHaveCount(1);
  await expect(section.getByRole("article")).toContainText("-15.0");
  await expect(section).toContainText("2 recorded GWs");
  await expect(section.getByRole("article")).toContainText("SF, L5");
  const url = page.url();
  await page.close();
  const reopened = await context.newPage();
  await offline(reopened);
  await reopened.goto(url);
  const restored = reopened.getByRole("region", { name: "Your players, xScore against actual" });
  await expect(restored.locator("#player-score-view-help")).toContainText("average scores, total diff and average miss from checked starts");
  await expect(restored.getByRole("link", { name: "Summary", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(restored.getByRole("article")).toContainText("-15.0");
  await restored.getByRole("link", { name: "Gameweek", exact: true }).click();
  await expect(restored.getByRole("combobox", { name: "Player gameweek" })).toHaveCount(0);
  await reopened.goto(`/audit?gw=${live.id}&scoreGw=older-record#player-scores`);
  await expect(restored.locator(".au-label")).toContainText(`GW${live.number}`);
  await expect(restored.getByRole("article").getByText("0.0", { exact: true })).toBeVisible();
  await reopened.reload();
  await expect(restored.getByRole("article")).toHaveCount(1);

});

test("your players show saved forecasts, zero, corrections and pending games before 100 starts; selected GW survives navigation and closed tabs", async ({ page, request, context }) => {
  const response = await (await request.get(`${MOCK}/api/sorare`)).json();
  const model = response.data;
  const live = model.timeline.find((w: { id: string }) => w.id === model.nextId);
  const card = model.collection[0];
  const base = { player: card.player, name: card.name, pic: card.pic, pos: card.pos, game: "game", kickoff: live.start,
    home: "Spain", away: "Denmark", competition: "International", xscore: 55, by: "sofix", sorare: 60, actual: 0,
    difference: -55, firstScore: 0, played: true, started: 1, state: "provisional", sources: { futbolfantasy: 0, sofix: 0.7, sorare: 0.8 }, checkedAt: live.start,

    recheckedAt: null, firstDue: live.start, recheckDue: live.end, reason: "" };
  await request.post(`${MOCK}/__test/my-weeks`, { data: { playerScores: { weeks: [{ slug: live.slug, number: live.number,
    rows: [base, { ...base, game: "corrected", name: "Corrected player", actual: 53, difference: -2, firstScore: 50, state: "rechecked", recheckedAt: live.start },
      { ...base, game: "sub", name: "Substitute", started: 0, actual: 10, difference: -45 },
      { ...base, game: "dnp", name: "DNP player", played: false, started: null, actual: null, difference: null, sources: {} },
      { ...base, game: "missing", name: "Pending player", actual: null, difference: null, sorare: null, state: "pending", checkedAt: null, reason: "Player scores not available yet" }],
    summary: { checked: 4, total: 5, rechecked: 1, starts: 2, xCases: 2, xMiss: 28.5, sorareCases: 2, sorareMiss: 33.5 } }] } } });
  await page.goto(`/audit?gw=${live.id}`);
  let section = page.getByRole("region", { name: "Your players, xScore against actual" });
  await expect(section).toContainText(`GW${live.number}`);
  await expect(section).toContainText("4 of 5 player games checked");
  await expect(section).toContainText("28.5");
  const zero = section.getByRole("article").filter({ hasText: card.name });
  await expect(zero.getByText("0.0", { exact: true })).toBeVisible();
  await expect(zero).toContainText("Provisional");
  await expect(zero.locator(".au-score-starts")).toContainText("FF start0%");
  await expect(zero.locator(".au-score-starts")).toContainText("Sofix start70%");
  await expect(zero.locator(".au-score-starts")).toContainText("Sorare start80%");
  await expect(zero.locator(".au-score-starts")).toContainText("Started");
  await expect(section.getByRole("article").first()).toContainText("Corrected player");
  await expect(section.getByRole("article").nth(1)).toContainText("Substitute");
  await expect(section.getByRole("article").nth(2)).toContainText(card.name);
  await expect(section.getByRole("article").filter({ hasText: "Substitute" }).locator(".au-score-starts")).toContainText("Did not start");
  await expect(section.getByRole("article").filter({ hasText: "DNP player" }).locator(".au-score-starts")).toContainText("FF start—");
  await expect(section.getByRole("article").filter({ hasText: "DNP player" }).locator(".au-score-starts")).toContainText("Did not start");
  await expect(section.getByRole("article").filter({ hasText: "Pending player" }).locator(".au-score-starts")).toContainText("Pending");
  await expect(section.getByRole("article").filter({ hasText: "Corrected player" })).toContainText("50.0 → 53.0");
  await expect(section.getByRole("article").filter({ hasText: "Pending player" })).toContainText("Pending");
  await expect(section).not.toContainText("Too few");
  expect((await new AxeBuilder({ page }).include(".au-player-scores").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await smallText(page, width === 390 ? 10 : 11)).toEqual([]);
  }
  const url = page.url();
  await page.close();
  const reopened = await context.newPage();
  await offline(reopened);
  await reopened.goto(url);
  section = reopened.getByRole("region", { name: "Your players, xScore against actual" });
  await expect(section).toContainText("50.0 → 53.0");
  // The shared date selector carries the same week across Audit views.
  await reopened.goto(`/audit/versus?gw=${live.id}`);
  await expect(reopened.getByRole("region", { name: "Your players, xScore against actual" })).toContainText("Corrected player");
  const other = model.timeline.find((w: { slug: string }) => w.slug !== live.slug);
  await reopened.goto(`/audit?gw=${other.id}`);
  await expect(reopened.getByRole("region", { name: "Your players, xScore against actual" })).not.toContainText("Corrected player");
});

test("Audit opens the latest locked GW and honours an explicitly selected future GW", async ({ page, request }) => {
  const model = (await (await request.get(`${MOCK}/api/sorare`)).json()).data;
  const locked = model.timeline.filter((w: { lock: string }) => new Date(w.lock).getTime() <= Date.now())
    .sort((a: { lock: string }, b: { lock: string }) => b.lock.localeCompare(a.lock))[0];
  expect(locked).toBeTruthy();
  await page.goto("/audit");
  const section = page.getByRole("region", { name: "Your players, xScore against actual" });
  await expect(section).toContainText(`GW${locked.number}`);
  const future = model.timeline.find((w: { id: string }) => w.id === model.nextId);
  await page.goto(`/audit?gw=${future.id}`);
  await expect(section).toContainText(`GW${future.number}`);
});

test("empty match comparisons remain missing rather than zero", async ({ page }) => {
  await page.goto("/audit");
  const section = page.getByRole("region", { name: "Match forecasts, checked" });
  await expect(section).toContainText("No paired results yet");
  await section.getByText("How this is checked", { exact: true }).click();
  await expect(section).toContainText("No odds saved yet");

});

test("the page leads with Sofix's and Sorare's success rate within 7 points, starters and substitutes apart, and draws both by position", async ({ page, request }) => {
  await resetBackend(request, "audit-enough");
  await page.goto("/audit?w=2026-10-09");
  await expect(page.getByRole("heading", { level: 1, name: "Sofix against Sorare" })).toBeVisible();
  const duo = page.locator(".ax-duo > div");
  await expect(duo.nth(0)).toContainText("Sofix · starters");
  await expect(duo.nth(0).locator(".ax-duo-n")).toHaveText("31%"); // within 7 points of the score
  await expect(duo.nth(0)).toContainText("Right more often");
  await expect(duo.nth(0).locator(".ax-duo-m")).toHaveText("Sofix · substitutes42%");
  await expect(duo.nth(1).locator(".ax-duo-n")).toHaveText("29%");
  await expect(duo.nth(1).locator(".ax-duo-m")).toHaveText("Sorare · substitutes20%");
  await expect(duo.nth(1)).not.toContainText("Right more often");
  await expect(page.locator(".ax-facts")).toContainText("412 starts");
  await expect(page.locator(".ax-facts")).toContainText("96 came on");
  const rows = page.getByRole("region", { name: "Within 7 points, by position" }).getByRole("listitem");
  await expect(rows).toHaveCount(5);
  await expect(rows.nth(0)).toContainText("All412 starts");
  await expect(rows.nth(0)).toContainText("Sofix 31%");
  await expect(rows.nth(1)).toContainText("Sorare 29%"); // 40 goalkeepers' starts: shown, no floor
  const detail = page.getByRole("region", { name: "The same games, three ways" });
  await expect(detail.getByRole("row", { name: /Substitutes/ })).toContainText("96 games");
  await expect(detail.getByRole("list", { name: "Week by week" })).toContainText("60 starts · within 7: Sofix 31%, Sorare 29%");
  await expect(page.locator(".ax-hero, .au-vs").getByText(/too few to tell|better of two|coin flip/i)).toHaveCount(0);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await smallText(page, width === 390 ? 10 : 11)).toEqual([]);
    expect((await new AxeBuilder({ page }).include(".ax-hero").include(".au-vs").include(".au-result").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  }
});

test("saved weeks survive without Chrome on Recap, Cards and Rewards, beside the plan frozen at lock", async ({ page, request }) => {
  const card = sorare.collection![0]!;
  const start = `${new Date().getUTCFullYear()}-08-01T14:00:00Z`;
  const saved = { slug: "saved-week", number: 17, start, end: start, savedAt: start,
    lineups: [{ id: "mine", name: "Mine", competition: "LaLiga", board: "board", draft: false, confirmable: false,
      cards: [{ slug: card.slug, player: card.player, name: card.name, rarity: card.rarity, picture: card.pic, score: 70, captain: true }],
      result: { score: 300, rank: 10, essence: 250, cash: 2.5, card: false, xp: 100 } }] };
  await request.post(`${MOCK}/__test/my-weeks`, { data: { weeks: [saved], frozenPlans: [{ slug: saved.slug, number: 17, end: start, builtAt: start,
    plans: [{ rank: 1, lineups: [{ competition: "LaLiga", board: "board", expected: 290, score: 301.5, cameIn: [], bonusLost: false },
      { competition: "Older rules", board: "missing", expected: 200, score: null, reason: "incomplete-plan", cameIn: [], bonusLost: false },
      { competition: "Waiting", board: "waiting", expected: 210, score: null, cameIn: [], bonusLost: false }] }] }] } });
  await page.goto("/");
  const season = page.getByRole("region", { name: "Your season" });
  await expect(season).toContainText("250 Limited essence");
  await expect(season).toContainText("1 GW played");
  await season.getByText("Week by week", { exact: true }).click();
  await season.getByText("GW17", { exact: true }).click();
  await expect(season.getByRole("list", { name: "Essence-winning lineup" })).toContainText(card.name);
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
  await expect(frozen).toContainText("1 entered lineup saved across 1 GW");
  await expect(frozen.getByRole("row").filter({ hasText: "Older rules" })).toContainText("Rules not saved");
  await expect(frozen.getByRole("row").filter({ hasText: "Older rules" })).toContainText("No entry");
  await expect(frozen.getByRole("row").filter({ hasText: "Waiting" })).toContainText("Pending results");
  for (const path of ["/", "/cards", "/audit/rewards"]) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await smallText(page, 10)).toEqual([]);
  }
});

test("before any game is checked the success rates are a dash, never a made-up number", async ({ page }) => {
  await page.goto("/audit");
  await expect(page.getByRole("heading", { level: 1, name: "Sofix against Sorare" })).toBeVisible();
  await expect(page.locator(".ax-duo-n")).toHaveText(["–", "–"]);
  await expect(page.locator(".ax-duo-s").first()).toHaveText("Nothing checked yet");
});

test("the league figures draw every chart from the committed replay: how close, goalkeepers' chances, who starts, Sorare's number", async ({ page }) => {
  await page.goto("/audit");

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

test("predicted elevens wait honestly for stored readings", async ({ page }) => {
  await page.goto("/audit/starts");
  const elevens = page.getByRole("region", { name: "Futbol Fantasy's eleven" });
  await expect(elevens).toContainText("No predicted elevens kept yet");
  await expect(elevens.getByRole("table")).toHaveCount(0);
  expect(await smallText(page, 11)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
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

  // the start chances moved to what happened: a run with 100 games is used, a thinner one says how many are still to come
  const fixes = page.getByRole("region", { name: "Start chances, corrected from the record" });
  await expect(fixes.getByRole("row", { name: /50% to 90%/ })).toContainText("73%");
  await expect(fixes.getByRole("row", { name: /50% to 90%/ })).toContainText("Yes");
  await expect(fixes.getByRole("row", { name: /95%/ })).toContainText("Not yet (88 to go)");
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

test("the switch under the top bar moves between xScore, Who starts and Lineups", async ({ page }) => {
  await page.goto("/audit");
  const lens = page.locator(".lens");
  await expect(lens.getByRole("link", { name: "xScore" })).toHaveAttribute("aria-current", "page");
  await lens.getByRole("link", { name: "Who starts" }).click();
  await expect(page).toHaveURL(/\/audit\/starts/);
  await expect(page.getByRole("heading", { level: 1, name: "Who starts, checked" })).toBeVisible();
  await lens.getByRole("link", { name: "Lineups" }).click();
  await expect(page).toHaveURL(/\/audit\/lineups/);
  await expect(page.getByRole("heading", { level: 1, name: "Lineups" })).toBeVisible();

  // An old link to the record page lands on the section at the foot of Who starts.
  await page.goto("/audit/record");
  await expect(page).toHaveURL(/\/audit\/starts#written/);
  await expect(page.getByRole("heading", { level: 2, name: "Written down so far" })).toBeInViewport();
});

test("Lineups judges the saved plans by score and by prize: Sofix and Sorare within 15 points, then what you, Sofix and Sorare won, plan by plan", async ({ page, request }) => {
  const start = `${new Date().getUTCFullYear()}-08-01T14:00:00Z`;
  const line = (id: string, result: Record<string, unknown>) => ({ id, name: id, competition: "LaLiga", board: id, draft: false, confirmable: false, cards: [],
    result: { score: 300, rank: 10, essence: 0, cash: 0, card: false, ...result } });
  await request.post(`${MOCK}/__test/my-weeks`, { data: { weeks: [{ slug: "gw-18", number: 18, start, end: start, savedAt: start,
    lineups: [line("a", { essence: 250 }), line("b", { xp: 500 }), line("c", { xp: 500 }), line("d", {})] }] } });
  await page.goto("/audit/lineups");
  const duo = page.locator(".ax-duo > div");
  await expect(duo.nth(0)).toContainText("Sofix · best plan");
  await expect(duo.nth(0).locator(".ax-duo-n")).toHaveText("40%"); // the fixture: 4 of the best plan's 10 lineups within 15
  await expect(duo.nth(0)).toContainText("4 of 10 lineups within 15");
  await expect(duo.nth(0)).toContainText("Right more often");
  await expect(duo.nth(1).locator(".ax-duo-n")).toHaveText("20%");
  await expect(page.getByRole("region", { name: "Within 15 points, every plan" }).getByRole("listitem")).toHaveCount(2);

  // XP alone is not a win: your one essence lineup of four is 25%, and the two XP lineups are named apart.
  const won = page.getByRole("region", { name: "What the lineups won" }).getByRole("listitem");
  await expect(won.nth(0)).toContainText("25%");
  await expect(won.nth(0)).toContainText("Essence 1 · XP only 2 · Nothing 1");
  await expect(won.nth(1)).toContainText("40%"); // Sofix's best plan: 1 cash and 3 essence of 10
  await expect(won.nth(1)).toContainText("Cash 1 · Essence 3 · XP only 4 · Nothing 2");
  await expect(won.nth(2)).toContainText("10%");

  const plans = page.getByRole("region", { name: "Every plan, both ways" });
  await expect(plans.locator("tbody tr")).toHaveCount(2);
  await expect(plans.locator("tbody tr").nth(1)).toContainText("30%"); // plan 2 has its own rate
  await expect(plans.getByRole("list", { name: "Week by week" })).toContainText("GW18");
  expect(await smallText(page, 11)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(scan.violations).toEqual([]);
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

test("Strategies scores each way of building a lineup beside yours, and says whether a big score was the numbers or luck", async ({ page }) => {
  await page.goto("/audit/strategies");
  await expect(page.getByRole("heading", { level: 1, name: "Strategies" })).toBeVisible();
  const duo = page.locator(".ax-duo > div");
  await expect(duo.nth(0)).toContainText("Highest ceiling · most points"); // 2,600 over 8 lineups against xScore's 2,400
  await expect(duo.nth(0).locator(".ax-duo-n")).toHaveText("325");
  await expect(duo.nth(1)).toContainText("You · entered");
  await expect(duo.nth(1).locator(".ax-duo-n")).toHaveText("280");
  await expect(page.getByText("Only 2 weeks so far: too few to tell which strategy is better.")).toBeVisible();

  const table = page.getByRole("region", { name: "How each one did" }).locator("tbody tr");
  await expect(table).toHaveCount(3); // two strategies and you
  await expect(table.nth(0)).toContainText("75%"); // of the best in hindsight: 2,400 of 3,200
  await expect(table.nth(0)).toContainText("38%"); // essence or better: 3 of 8
  await expect(table.nth(0)).toContainText("1 of 8"); // lucky weeks

  const luck = page.getByRole("region", { name: /Built on the numbers, or on luck/ });
  await expect(luck).toContainText("451 points, expected 263 (182–342)");
  await expect(luck).toContainText("Lucky: above the top of its range");
  await expect(luck).toContainText("Chust and Isco scored above their own range");
  await expect(page.getByRole("list", { name: "Week by week" }).getByRole("listitem")).toHaveCount(2);

  expect(await smallText(page, 11)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(scan.violations).toEqual([]);
});
