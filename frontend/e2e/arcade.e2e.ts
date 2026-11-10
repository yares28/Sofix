import { expect, test, type Page } from "@playwright/test";
import { offline, resetBackend, smallText } from "./helpers";
import { madridDate, whenLabel } from "../lib/arcadePlan";

const GAME = "Game:11111111-2222-3333-4444-555555555555";
const KICKOFF = new Date(Date.now() + 86_400_000).toISOString(); // tomorrow, inside the days Sorare projects
/** The verdict's "now" or day for the games at KICKOFF: "now" is said only for a game today (9 Nov 2026). */
const ON = madridDate(KICKOFF) === madridDate(new Date().toISOString()) ? "now" : `on ${whenLabel(Date.parse(KICKOFF), Date.now()).replace(/ \d\d:\d\d$/, "")}`;
/** A kick-off's Madrid time, as a chain node shows it. */
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });
const SQUAD = [
  ["c1", "p", "Player One", "Forward", 1.1],
  ["c2", "gk", "Keeper Two", "Goalkeeper", 1],
  ["c3", "d", "Defender Three", "Defender", 1],
  ["c4", "m", "Midfielder Four", "Midfielder", 1],
  ["c5", "m2", "Midfielder Five", "Midfielder", 1],
  ["c6", "f2", "Forward Six", "Forward", 1],
] as const;

/** Arcade reads everything from the extension; a stub answers as Sorare would (shapes from lib/arcade.test.ts). */
const ANSWERS: Record<string, unknown> = {
  arcade: {
    cardSet: { currentSet: { slug: "glitch", name: "HyperGlitch", startDate: null, endDate: new Date(Date.now() + 7 * 86_400_000).toISOString(), availableCompetitions: [] } }, // a week ahead: the set is running
    currentUser: {
      slug: "owner",
      gems: [{ currency: "COMMON_GEM", amount: 40 }],
      essence: [{ rarity: "common", cardShardsCount: 3200, cardSet: { slug: "glitch" } }],
      setBoard: { id: "b", title: "Board", configSlug: "football-glitch-chapter-1", myCurrentStep: { id: "Tasks::Task:bf7e7356-70a2-4ff6-864f-112fa18e2bef", level: 2 }, steps: [
        { id: "s1", level: 1, target: 260, state: "CLAIMED", rewardConfigs: [{ __typename: "CardShardRewardConfig", rarity: "common", quantity: 5000 }] },
        { id: "Tasks::Task:bf7e7356-70a2-4ff6-864f-112fa18e2bef", level: 2, target: 300, state: "PLAYABLE", engineConfiguration: { captain: 0.5 }, maxLineupsCount: 4, remainingLineupsCount: 3, lockedLineupsCount: 1, pendingLineupsCount: 0,
          cardPacks: [
            { slug: "bronze", title: "Bronze", effectivePrice: 1000, currency: "COMMON_ESSENCE", cardsCount: 1, canPurchase: true, competition: null },
            { slug: "silver", title: "Silver", effectivePrice: 10, currency: "COMMON_GEM", cardsCount: 1, canPurchase: true, competition: null },
          ],
          rewardConfigs: [{ __typename: "InGameCurrencyRewardConfig", amount: 10, currency: "COMMON_GEM" }] },
      ] },
    },
  },
  "arcade-lineups": { currentUser: { setBoard: { steps: [] } } },
  "arcade-missions": { currentUser: { setPlayTasks: [] } },
  "arcade-collection": { currentUser: { tracks: [{ __typename: "CardsCountTargetTask", id: "collect-club", title: "Club collector", description: "Collect 2 Club cards", progress: 0, target: 2, expired: false, aasmState: "in_progress", rewardConfigs: [], players: [], specifiedTeams: [{ slug: "club", name: "Club" }], competitions: [] }], setBoard: { myCollectionTasks: [] } } },
  "arcade-games": { currentUser: { setBoard: { pickableGames: { nodes: [{ game: { id: GAME, date: KICKOFF, statusTyped: "scheduled",
    competition: { slug: "laliga-es", displayName: "LALIGA EA Sports" }, homeTeam: { slug: "club", name: "Club" }, awayTeam: { slug: "rival", name: "Rival" } } }],
    pageInfo: { hasNextPage: false, endCursor: null } } } } },
  "arcade-cards": { currentUser: { cards: { nodes: SQUAD.map(([slug, player, name, position, bonus]) => ({ slug, pictureUrl: null, anyPositions: [position], cardSet: { slug: "glitch" },
    skinEdition: { bonus, skinName: bonus > 1 ? "Holo" : "Standard" }, anyPlayer: { slug: player, displayName: name }, anyTeam: { slug: "club", name: "Club" } })), pageInfo: { hasNextPage: false, endCursor: null } } } },
  // Step 3: one card per club is asked for its club bonus; past scores; the game's projections (Player One has none: his average stands in).
  "arcade-bonuses": { currentUser: { setBoard: { b0: [{ key: "collection", bonusBasisPoints: 400 }] } } },
  "arcade-past": { players: SQUAD.map(([, player]) => ({ slug: player, gameplayTier: "IMPACT", playingStatus: "STARTER", activeInjuries: [], playerGameScores: [50, 60, 70].map((score) => ({ score, anyPlayerGameStats: { minsPlayed: 90 } })) })) },
  "arcade-pack-odds": { currentUser: { setBoard: { myCurrentStep: { cardPacks: [
    { slug: "bronze", cardsCount: 1, s0: [{ gameplayTier: "IMPACT", probabilityBasisPoint: 10000, playerOdds: [{ probabilityBasisPoint: 5000, player: { slug: "p" }, team: { slug: "club" } }, { probabilityBasisPoint: 5000, player: { slug: "new" }, team: { slug: "club" } }] }] },
    { slug: "silver", cardsCount: 1, s0: [{ gameplayTier: "GOAT", probabilityBasisPoint: 10000, playerOdds: [{ probabilityBasisPoint: 9900, player: { slug: "new" }, team: { slug: "club" } }] }] },
  ] } } } },
  "arcade-projections": { anyGame: { id: GAME, playerGameScores: SQUAD.slice(1).map(([, player]) => ({ projection: { score: 60 }, anyPlayer: { slug: player } })) } },
};

test.beforeEach(async ({ page, request }) => {
  await resetBackend(request);
  await offline(page);
});

/** The page's three views: Play now, Missions & packs, Players. */
const show = (page: Page, view: string) => page.getByRole("group", { name: "Arcade view" }).getByRole("button", { name: view }).click();

const withExtension = (page: Page, answers: Record<string, unknown> = ANSWERS, version = "0.4.14", holdPast = false) => page.addInitScript(([answers, version, holdPast]) => {
  Object.defineProperty(window, "chrome", { configurable: true, value: { runtime: { sendMessage(_id: string, message: { type: string; step?: string; game?: string }, reply: (answer: unknown) => void) {
    if (message.step === "arcade-pack-odds") {
      const state = window as unknown as { __packReads?: number; __failPacks?: boolean };
      state.__packReads = (state.__packReads ?? 0) + 1;
      if (state.__failPacks) return reply({ ok: true, state: "failed" });
    }
    if (message.type === "ping") return reply({ ok: true, version, sorareUser: "owner", appReachable: true });
    if (message.type === "read-arcade") return reply({ ok: true, state: "ok", players: 1, games: 1 });
    if (holdPast && message.step === "arcade-past") return;
    const over = (window as unknown as { __answers?: Record<string, unknown> }).__answers ?? {}; // a later answer (a pack opened)
    reply({ ok: true, state: "ok", step: message.step, data: over[message.step ?? ""] ?? answers[`${message.step}:${message.game}`] ?? answers[message.step ?? ""] });
  } } } });
}, [answers, version, holdPast] as const);

test("Batch covers all games, bounds and remembers the team count, and never draws a partial team", async ({ page }) => {
  const later = new Date(Date.parse(KICKOFF) + 3 * 3_600_000).toISOString();
  const games = [{ id: GAME, date: KICKOFF, statusTyped: "scheduled", competition: { slug: "laliga-es", displayName: "LaLiga" }, homeTeam: { slug: "club", name: "Club" }, awayTeam: { slug: "rival", name: "Rival" } }, { id: "no-owned-cards", date: later, statusTyped: "scheduled", competition: { slug: "laliga-es", displayName: "LaLiga" }, homeTeam: { slug: "other", name: "Other" }, awayTeam: { slug: "another", name: "Another" } }];
  await withExtension(page, { ...ANSWERS, "arcade-games": { currentUser: { setBoard: { pickableGames: { nodes: games.map(game => ({ game })), pageInfo: { hasNextPage: false } } } } } });
  await page.goto("/");
  await page.getByRole("link", { name: "Arcade", exact: true }).click();
  await show(page, "Batch");
  const batch = page.getByRole("region", { name: "Batch" });
  // A window with no card of yours is skipped by default and marked when shown (9 Nov 2026: Batch listed games the others did not).
  await expect(batch.getByRole("group", { name: "Batches" }).getByRole("button")).toHaveCount(1);
  const empty = batch.getByRole("button", { name: "Without your cards (1)" });
  await expect(empty).toHaveAttribute("aria-pressed", "false");
  await empty.click();
  await expect(batch.getByRole("group", { name: "Batches" }).getByRole("button")).toHaveCount(2);
  await expect(batch.getByRole("group", { name: "Batches" }).getByRole("button").nth(1)).toContainText("no card of yours");
  await expect(batch.getByRole("group", { name: "Batches" }).getByRole("button").first()).not.toContainText("no card of yours");
  if (process.env.ARCADE_PLAN_SHOT) for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await batch.locator(".arc-plan-head").screenshot({ path: `${process.env.ARCADE_PLAN_SHOT}-batch-head-${width}.png` });
    await batch.getByRole("group", { name: "Batches" }).screenshot({ path: `${process.env.ARCADE_PLAN_SHOT}-batch-rail-${width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(await smallText(page, 11)).toEqual([]);
  await expect(batch.getByRole("button", { name: "Fewer teams" })).toBeDisabled();
  await expect(batch.locator(".arc-batch-lineup")).toHaveCount(1);
  await batch.getByRole("button", { name: "More teams" }).click();
  await expect(batch.getByRole("status")).toContainText("Only 1 of 2 teams");
  await expect(batch.locator(".arc-batch-lineup")).toHaveCount(1);
  await batch.getByRole("button", { name: "More teams" }).click();
  await batch.getByRole("button", { name: "More teams" }).click();
  await expect(batch.getByRole("button", { name: "More teams" })).toBeDisabled();
  await show(page, "Players");
  await show(page, "Batch");
  await expect(batch.getByRole("spinbutton", { name: "Teams in this batch" })).toHaveValue("4");
  await page.reload();
  await expect(batch.getByRole("spinbutton", { name: "Teams in this batch" })).toHaveValue("4");
  await batch.getByRole("group", { name: "Batches" }).getByRole("button").nth(1).click();
  // A window with no card of yours says so, not "not enough available players with scores" (9 Nov 2026).
  await expect(batch.getByRole("status")).toHaveText("None of your cards plays in this window.");
  await expect(batch.locator(".arc-batch-lineup")).toHaveCount(0);
  await expect(batch.getByText("Other", { exact: true })).toBeVisible();
  await batch.getByLabel("Batch date").fill("2000-01-01");
  await expect(batch.getByRole("status")).toHaveText("No batches on this date.");
  await page.reload();
  await expect(batch.getByLabel("Batch date")).toHaveValue("2000-01-01");
  await batch.getByRole("button", { name: "All dates", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(batch.getByRole("group", { name: "Batches" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await smallText(page, 10)).toEqual([]);
  await page.clock.setFixedTime(Date.parse(later) + 1);
  await page.reload();
  await expect(batch.getByRole("status")).toHaveText("No future games left in this set.");
});

test("Arcade shows the step you are on, its target, reward and lineups left, your gems, essence and set cards", async ({ page }) => {
  await withExtension(page);
  await page.goto("/arcade");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Step 2 of 2 · 300 pts");
  const step = page.locator(".arc-ladder li.is-current"); // the board beside Your move, once predictions are read
  await expect(step).toContainText("300");
  await expect(step).toContainText("10 gems");
  await expect(page.locator(".arc-move .arc-lives")).toHaveAttribute("aria-label", "3 of 4 lives");
  await expect(page.locator(".arc-wallet")).toContainText("3,200");
  await show(page, "Players");
  await expect(page.locator(".arc-grid .arc-card").first()).toHaveAttribute("aria-label", "Defender Three");
  expect(await smallText(page, 11)).toEqual([]);

  await page.getByRole("searchbox", { name: "Search player or club" }).fill("nobody");
  await expect(page.locator(".arc-count")).toHaveText("No card matches");
  await page.getByRole("searchbox", { name: "Search player or club" }).fill("player one");
  await expect(page.locator(".arc-count")).toHaveText("1–1 of 1");
});

test("without the extension Arcade says so instead of showing empty numbers", async ({ page }) => {
  await page.goto("/arcade");
  await expect(page.getByRole("status")).toContainText("can't reach the Sofix extension");
});

test("collection cards keep their evidence compact and all reads in the hero toolbar", async ({ page }) => {
  await page.route("**/api/arcade/chances", (route) => route.fulfill({ json: { chances: { [GAME]: { p: [0, 1792579200], gk: [9000, 1792579200] } } } }));
  await withExtension(page, { ...ANSWERS, "arcade-past": { players: SQUAD.map(([, player], i) => ({ slug: player, gameplayTier: i === 0 ? "GOAT" : i === 1 ? "STAR_PLUS" : "IMPACT", playingStatus: "STARTER", activeInjuries: [], l5: i === 0 ? 62 : i === 1 ? 39.6 : null, l10: 55, l40: 41, playerGameScores: [50, 60, 70].map((score) => ({ score, anyPlayerGameStats: { minsPlayed: 90 } })) })) } }, "0.4.17");
  await page.goto("/arcade");
  const toolbar = page.getByRole("group", { name: "Refresh Arcade data" });
  await expect(toolbar.getByRole("button", { name: "Refresh scores", exact: true })).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "Refresh board and cards" })).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "Refresh start percentages" })).toBeVisible();
  await show(page, "Players");
  await page.getByRole("searchbox", { name: "Search player or club" }).fill("player one");
  const card = page.locator(".arc-grid .arc-card");
  await expect(card.locator(".arc-art .arc-card-score")).toContainText("0");
  await expect(card.locator(".arc-card-score")).toHaveText("0");
  await expect(card.locator(".arc-card-score")).toHaveCSS("background-color", "rgb(192, 67, 63)");
  await expect(card.locator(".arc-art .arc-card-bonus")).toHaveText("+10%");
  await expect(card.locator("figcaption .arc-card-start")).toHaveText("0%");
  await expect(card.locator("figcaption .arc-card-xd")).toHaveText("xD —");
  await expect(card.locator("figcaption .arc-card-xd")).toHaveAttribute("title", /its number is his recent form$/);
  await expect(card.locator("figcaption")).not.toContainText(/Player One|if he plays|pts|start|kick-off/);
  await expect(card.getByRole("button", { name: /Club v Rival/ })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search player or club" }).fill("");
  await page.getByRole("combobox", { name: "Start percentage" }).selectOption("80");
  await expect(page.locator(".arc-grid .arc-card")).toHaveCount(1);
  await expect(page.locator(".arc-grid .arc-card")).toHaveAttribute("aria-label", "Keeper Two");
  await page.getByRole("combobox", { name: "FDR rating" }).selectOption("unknown");
  await expect(page.locator(".arc-grid .arc-card")).toHaveCount(1);
  await page.getByRole("combobox", { name: "Start percentage" }).selectOption("zero");
  await expect(page.locator(".arc-grid .arc-card")).toHaveAttribute("aria-label", "Player One");
  await page.getByRole("combobox", { name: "Start percentage" }).selectOption("unknown");
  await expect(page.locator(".arc-grid .arc-card")).toHaveCount(4);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.locator(".arc-grid .arc-card")).toHaveCount(6);
  await expect(page.locator(".arc-again")).toHaveCount(0);
  await page.getByRole("combobox", { name: "Tier", exact: true }).selectOption("icon");
  await expect(page.locator(".arc-grid .arc-card")).toHaveAttribute("aria-label", "Player One");
  await page.getByRole("combobox", { name: "Tier", exact: true }).selectOption("star+");
  await expect(page.locator(".arc-grid .arc-card")).toHaveAttribute("aria-label", "Keeper Two");
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByRole("combobox", { name: "L5", exact: true }).selectOption("40");
  await expect(page.locator(".arc-grid .arc-card")).toHaveCount(2);
  await page.getByRole("combobox", { name: "L5", exact: true }).selectOption("unknown");
  await expect(page.locator(".arc-grid .arc-card")).toHaveCount(4);
  await page.getByRole("button", { name: "Clear filters" }).click();
  const day = new Date(KICKOFF).toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });
  await page.getByRole("combobox", { name: "Day", exact: true }).selectOption(day);
  await expect(page.locator(".arc-grid .arc-card")).toHaveCount(6);
  await page.getByRole("combobox", { name: "Day", exact: true }).selectOption("none");
  await expect(page.locator(".arc-count")).toHaveText("No card matches");
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByRole("combobox", { name: "xScore", exact: true }).selectOption("60");
  await expect(page.locator(".arc-grid .arc-card")).toHaveCount(4);
  await page.getByRole("combobox", { name: "xScore", exact: true }).selectOption("unknown");
  await expect(page.locator(".arc-count")).toHaveText("No card matches");
  for (const [width, floor] of [[1440, 11], [390, 10]] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator(".arc-filters").scrollIntoViewIfNeeded();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await smallText(page, floor)).toEqual([]);
  }
});

test("collection fixture buttons align scores and starts, filters reset pagination", async ({ page }) => {
  const second = "Game:11111111-2222-3333-4444-555555555556";
  const games = [GAME, second].map((id, i) => ({ id, date: new Date(Date.parse(KICKOFF) + i * 86400000).toISOString(), statusTyped: "scheduled", competition: { slug: "laliga-es", displayName: "LaLiga" }, homeTeam: { slug: "club", name: "Club" }, awayTeam: { slug: `rival-${i}`, name: `Rival ${i}` } }));
  const cards = Array.from({ length: 25 }, (_, i) => ({ slug: `extra-${i}`, anyPositions: ["Forward"], cardSet: { slug: "glitch" }, anyPlayer: { slug: "p", displayName: `Player ${String(i).padStart(2, "0")}` }, anyTeam: { slug: i === 24 ? "unmatched" : "club", name: i === 24 ? "Unmatched" : "Club" } }));
  await page.route("**/api/arcade/chances", (route) => route.fulfill({ json: { chances: { [GAME]: { p: [5000, 1792579200] }, [second]: { p: [9000, 1792579200] } } } }));
  await withExtension(page, { ...ANSWERS,
    "arcade-cards": { currentUser: { cards: { nodes: cards, pageInfo: { hasNextPage: false } } } },
    "arcade-games": { currentUser: { setBoard: { pickableGames: { nodes: games.map((game) => ({ game })), pageInfo: { hasNextPage: false } } } } },
    [`arcade-projections:${GAME}`]: { anyGame: { id: GAME, playerGameScores: [{ projection: { score: 60 }, anyPlayer: { slug: "p" } }] } },
    [`arcade-projections:${second}`]: { anyGame: { id: second, playerGameScores: [{ projection: { score: 80 }, anyPlayer: { slug: "p" } }] } },
  }, "0.4.17");
  await page.goto("/arcade");
  const gallery = page.locator(".arc-cards");
  await show(page, "Players");
  await expect(gallery.locator(".arc-card")).toHaveCount(12);
  const first = gallery.locator(".arc-card").first();
  await expect(first.locator(".arc-card-start")).toHaveText("50%");
  await expect(first.locator(".arc-card-score b")).toHaveText("31");
  const buttons = first.getByRole("button");
  await expect(buttons).toHaveCount(2);
  await buttons.nth(1).click();
  await expect(buttons.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(first.locator(".arc-card-start")).toHaveText("90%");
  await expect(first.locator(".arc-card-score b")).toHaveText("75");
  await gallery.getByRole("button", { name: "Next", exact: true }).click();
  await expect(gallery.getByText("Page 2 of 3", { exact: true })).toBeVisible();
  await gallery.getByRole("combobox", { name: "Start percentage" }).selectOption("unknown");
  await expect(gallery.locator(".arc-card")).toHaveCount(1);
  await expect(gallery.locator(".arc-card")).toHaveAttribute("aria-label", "Player 24");
  await expect(gallery.getByRole("navigation", { name: "Card pages" })).toHaveCount(0);
  await gallery.getByRole("button", { name: "Clear filters" }).click();
  await expect(gallery.getByText("Page 1 of 3", { exact: true })).toBeVisible();
  await gallery.getByRole("combobox", { name: "FDR rating" }).selectOption("75");
  await expect(gallery.locator(".arc-count")).toHaveText("No card matches");
});

test("the hero read icons refresh their own data and report refusal without losing the collection", async ({ page }) => {
  await withExtension(page, ANSWERS, "0.4.17");
  await page.goto("/arcade");
  await expect(page.locator(".arc-grid .arc-card")).toHaveCount(6);
  await page.evaluate(() => {
    const runtime = (window as unknown as { chrome: { runtime: { sendMessage: (...args: unknown[]) => void } } }).chrome.runtime;
    runtime.sendMessage = (_id, message, reply) => {
      const m = message as { type: string };
      (reply as (a: unknown) => void)(m.type === "ping" ? { ok: true, version: "0.4.17" } : { ok: false, state: "failed", error: "refused" });
    };
  });
  await page.getByRole("button", { name: "Refresh scores", exact: true }).click();
  await expect(page.getByText("Sorare did not answer; scores could not be refreshed.")).toBeVisible();
  await page.getByRole("button", { name: "Refresh board and cards" }).click();
  await expect(page.getByText(/Showing the last successful read/)).toBeVisible();
  await expect(page.locator(".arc-grid .arc-card")).toHaveCount(6);
});

test("the next visit shows the last read board at once, and says when Sorare cannot be read now", async ({ page, context }) => {
  await withExtension(page);
  await page.goto("/arcade");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Step 2 of 2 · 300 pts");
  const later = await context.newPage(); // same browser, no extension this time
  await later.goto("/arcade");
  await expect(later.getByRole("heading", { level: 1 })).toHaveText("Step 2 of 2 · 300 pts");
  await expect(later.locator(".arc-grid .arc-card").first()).toHaveAttribute("aria-label", "Defender Three");
  await expect(later.getByText(/Your board as read .*can't reach the Sofix extension/)).toBeVisible();
});

test("on a phone Arcade fits the width and keeps text readable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await withExtension(page);
  await page.goto("/arcade");
  await expect(page.locator(".arc-grid .arc-card").first()).toHaveAttribute("aria-label", "Defender Three");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(await smallText(page, 10)).toEqual([]);
  if (process.env.ARCADE_SHOT) await page.screenshot({ path: process.env.ARCADE_SHOT, fullPage: true });
});

test("each card shows Sorare's start % for its next game, and the read button reports what Sorare's page gave", async ({ page }) => {
  let saved = false;
  await page.route("**/api/arcade/chances", (route) => route.fulfill({ json: { chances: saved ? { [GAME]: { p: [9000, 1792579200] } } : {} } }));
  await withExtension(page);
  await page.goto("/arcade");
  await show(page, "Players");
  await page.getByRole("searchbox", { name: "Search player or club" }).fill("player one");
  await expect(page.locator(".arc-grid .arc-card-start")).toHaveText("—");
  await expect(page.locator(".arc-grid").getByRole("button", { name: /Club v Rival/ })).toBeVisible();
  saved = true; // as if the walk saved Sorare's reading
  await page.getByRole("button", { name: "Read Arcade's start %" }).click();
  await expect(page.locator(".arc-read")).toContainText("Read 1 players in 1 games.");
  await expect(page.locator(".arc-grid .arc-card-start")).toHaveText("90%");
  await expect(page.locator(".arc-read")).toContainText("Sorare's start % for 1 of 6 cards");
});

test("each card shows its predicted score, and Pick teams builds the best lineup from the games picked with its chance at every step", async ({ page }) => {
  await page.route("**/api/arcade/chances", (route) => route.fulfill({ json: { chances: { [GAME]: { p: [5000, 1792579200] } } } }));
  await withExtension(page);
  await page.goto("/arcade");
  // Player One: no projection, so his played average (60) × 50% start × (1 + 10% Holo + 4% club) = 34.
  await show(page, "Players");
  await page.getByRole("searchbox", { name: "Search player or club" }).fill("player one");
  await expect(page.locator(".arc-grid .arc-card-score b")).toHaveText("34");
  await show(page, "Play now");
  await expect(page.locator(".arc-plan")).toContainText("Pick at least one game."); // nothing picked for you
  await page.getByRole("group", { name: "Games to pick from" }).getByRole("button").click();
  await expect(page.locator(".arc-pitch li")).toHaveCount(5); // the five on the pitch
  await expect(page.locator(".arc-scale-tick.is-aim")).toContainText("Step 2");
  await page.getByText("Each card's numbers").click();
  const lineup = page.locator(".arc-detail .arc-lineup li");
  await expect(lineup).toHaveCount(5);
  await expect(page.locator(".arc-detail .arc-lineup .arc-slot")).toHaveText([/^Goalkeeper/, /^Defender/, /^Midfielder/, /^Forward/, /^Extra/]);
  await expect(page.locator(".arc-detail .arc-lineup .arc-captain")).toHaveCount(1);
  await expect(lineup.filter({ hasText: "Keeper Two" }).getByLabel("Start chance —", { exact: true })).toHaveAttribute("title", /no start % yet/);
  await expect(page.locator(".arc-chances li.is-aim")).toContainText("Step 2 · 300");
  if (process.env.ARCADE_PLAN_SHOT) {
    await page.emulateMedia({ reducedMotion: "reduce" }); // still pictures, not mid-animation
    await page.locator(".arc-plan").screenshot({ path: `${process.env.ARCADE_PLAN_SHOT}-1440.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator(".arc-plan").screenshot({ path: `${process.env.ARCADE_PLAN_SHOT}-390.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  }
  await page.getByRole("group", { name: "Games to pick from" }).getByRole("button").click(); // unpick the only game
  await expect(page.locator(".arc-plan")).toContainText("Pick at least one game.");
});

test("Your move says to play now, why, and the lineup to enter, beside the board's chance at every step; teams to build around feed Pick teams", async ({ page }) => {
  await page.route("**/api/arcade/chances", (route) => route.fulfill({ json: { chances: { [GAME]: { gk: [10000, Math.floor(Date.now() / 1000)] } } } }));
  await withExtension(page, ANSWERS, "0.4.18");
  await page.goto("/arcade");
  const move = page.locator(".arc-move");
  await expect(move.getByRole("heading", { level: 2 })).toHaveText(`Play ${ON}`);
  await expect(move.locator(".arc-move-why")).toContainText("No later game before the set ends.");
  // One time for the move: the bar's Play time is the time to enter by.
  const enterBy = await move.locator(".arc-move-times span").filter({ hasText: "Enter before" }).locator("b").textContent();
  await expect(move.locator(".arc-split .is-pick time")).toHaveText(enterBy!);
  // One 100% bar (owner, 9 Nov 2026): no later game, so Play holds all of it; its own chance at this step sits beneath.
  await expect(move.locator(".arc-split figcaption")).toContainText("Who is likelier to win step");
  const pills = move.locator(".arc-split > div > span");
  await expect(move.locator(".arc-split .is-pick")).toContainText("Play");
  await expect(move.locator(".arc-split .is-pick > b")).toHaveText("100%");
  await expect(pills.last().locator("b")).toHaveText("0%");
  await expect(move.locator(".arc-split .is-pick .arc-split-step")).toHaveText(/^\d+% clears step 2$/);
  await expect(pills.last()).toContainText("No later lineup");
  await expect(move.locator(".arc-lineup li")).toHaveCount(5); // the five to enter
  await expect(move.locator(".arc-art .arc-card-ratings .arc-card-fdr")).toHaveCount(5);
  await expect(move.locator(".arc-art .arc-card-ratings .arc-card-score")).toHaveCount(5);
  await expect(move.locator(".arc-card figcaption .arc-card-start")).toHaveCount(5);
  await expect(move.locator(".arc-card figcaption .arc-card-games")).toHaveCount(5);
  await expect(move.locator(".arc-card figcaption .arc-card-xd")).toHaveCount(5);
  // Points needed is drawn only on entered lineups, on sorare.com and on Play's Pro rows (owner, 2 Nov 2026): never on a plan here.
  await expect(page.locator(".arc-main .need-pill")).toHaveCount(0);
  await expect(move.locator(".arc-card figcaption").first()).not.toContainText(/start|if he plays|pts/);
  expect(await move.locator(".arc-card-start").first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(28);
  await expect(move.locator(".arc-lineup")).not.toContainText("if he plays");
  await expect(move.locator(".arc-lineup .arc-card-name")).toHaveCount(0);
  const team = await move.locator(".arc-lineup li").evaluateAll((items) => items.map((li) => ({ name: li.getAttribute("aria-label"), captain: !!li.querySelector(".arc-captain") })));
  await move.getByRole("button", { name: "Edit in Pick teams" }).click();
  await page.getByText("Each card's numbers").click();
  expect(await page.locator(".arc-detail .arc-lineup li").evaluateAll((items) => items.map((li) => ({ name: li.getAttribute("aria-label"), captain: !!li.querySelector(".arc-captain") })))).toEqual(team);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const bar = await move.locator(".arc-split > div").evaluate((el) => ({ width: el.getBoundingClientRect().width, parent: el.parentElement!.getBoundingClientRect().width, labels: [...el.querySelectorAll("small")].map((s) => ({ width: s.clientWidth, scroll: s.scrollWidth, nowrap: getComputedStyle(s).whiteSpace })) }));
    expect(bar.width).toBeGreaterThanOrEqual(bar.parent - 1);
    expect(bar.width).toBeGreaterThan(width === 390 ? 260 : 500);
    expect(bar.labels.every((l) => l.scroll <= l.width && l.nowrap === "nowrap")).toBe(true);
    expect(await move.locator(".arc-card figcaption").evaluateAll((items) => items.every((el) => el.scrollWidth <= el.clientWidth))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(move).toContainText("Enter before");
  await expect(move).toContainText("Settles about");
  await expect(page.locator(".arc-ladder li")).toHaveCount(2);
  await expect(page.locator(".arc-chain")).toHaveCount(0); // one game: no chain to show
  // Club plays tomorrow with six of your cards, every one a starter on Sorare's word: the team to build around, already in Pick teams.
  const club = page.locator(".arc-club").first();
  await expect(club).toContainText("Club");
  await expect(club).toContainText("Sorare: starter");
  await expect(club.getByRole("button")).toHaveText("In Pick teams");
  await club.getByRole("button").click();
  await expect(page.locator(".arc-plan")).toContainText("Pick at least one game.");
  await club.getByRole("button").click();
  await expect(page.locator(".arc-pitch li")).toHaveCount(5);
  // One name per league: Sofix's where it has a board, not Sorare's "LALIGA EA Sports" (9 Nov 2026).
  await expect(page.locator(".arc-ticket small").first()).toHaveText("LaLiga");
  expect(await smallText(page, 11)).toEqual([]);
  if (process.env.ARCADE_PLAN_SHOT) {
    await page.emulateMedia({ reducedMotion: "reduce" }); // still pictures, not mid-animation
    for (const theme of ["light", "dark"]) {
      await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.screenshot({ path: `${process.env.ARCADE_PLAN_SHOT}-${theme}-1440.png`, fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: `${process.env.ARCADE_PLAN_SHOT}-${theme}-390.png`, fullPage: true });
      expect(await smallText(page, 10)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    }
  }
});

test("step one spends four resettable lives and keeps every insurance team identical across move, chain and builder", async ({ page }) => {
  const games = Array.from({ length: 5 }, (_, i) => ({ id: `Game:batch-${i}`, date: new Date(Date.parse(KICKOFF) + (i === 4 ? 4 * 3600000 : 0)).toISOString(), statusTyped: "scheduled", competition: { slug: "laliga-es", displayName: "LaLiga" }, homeTeam: { slug: `club-${i}`, name: `Club ${i}` }, awayTeam: { slug: `rival-${i}`, name: `Rival ${i}` } }));
  const cards = games.flatMap((_, i) => SQUAD.map(([slug, player, name, position]) => ({ slug: `${slug}-${i}`, pictureUrl: null, anyPositions: [position], cardSet: { slug: "glitch" }, skinEdition: { bonus: 1 }, anyPlayer: { slug: `${player}-${i}`, displayName: `${name} ${i}` }, anyTeam: { slug: `club-${i}`, name: `Club ${i}` } })));
  const board = structuredClone(ANSWERS.arcade) as { currentUser: { setBoard: { myCurrentStep: { id: string; level: number }; steps: Record<string, unknown>[] } } };
  board.currentUser.setBoard.myCurrentStep = { id: "s1", level: 1 };
  board.currentUser.setBoard.steps[0] = { ...board.currentUser.setBoard.steps[0], state: "PLAYABLE", engineConfiguration: { captain: 0.5 }, remainingLineupsCount: 4, maxLineupsCount: 4 };
  await page.route("**/api/arcade/chances", (route) => route.fulfill({ json: { chances: {} } }));
  await withExtension(page, { ...ANSWERS, arcade: board,
    "arcade-games": { currentUser: { setBoard: { pickableGames: { nodes: games.map((game) => ({ game })), pageInfo: { hasNextPage: false } } } } },
    "arcade-cards": { currentUser: { cards: { nodes: cards, pageInfo: { hasNextPage: false } } } },
    "arcade-past": { players: cards.map((c) => ({ slug: c.anyPlayer.slug, playerGameScores: [40, 50, 60].map((score) => ({ score, anyPlayerGameStats: { minsPlayed: 90 } })) })) },
    ...Object.fromEntries(games.map((game, i) => [`arcade-projections:${game.id}`, { anyGame: { id: game.id, playerGameScores: cards.filter((c) => c.anyTeam.slug === `club-${i}`).map((c) => ({ projection: { score: 50 }, anyPlayer: c.anyPlayer })) } }])),
  }, "0.4.18");
  await page.goto("/arcade");
  const move = page.locator(".arc-move");
  await expect(move.getByRole("heading", { level: 2 })).toHaveText(`Play 4 lineups ${ON}`);
  await expect(move.locator(".arc-move-why")).toContainText("four fresh lives");
  await expect(move.locator(".arc-split .is-pick")).toContainText("4 lineups");
  // The two shares make 100%, and the larger share has the wider pill.
  // Layout widths (offsetWidth): the pills' scaleX entrance made on-screen widths wrong mid-animation under load (10 Nov 2026).
  const [play, hold] = await move.locator(".arc-split > div > span").evaluateAll((els) => els.map((el) => ({ width: (el as HTMLElement).offsetWidth, share: parseFloat(el.querySelector("b")!.textContent!) / 100 })));
  expect(play!.share + hold!.share).toBeCloseTo(1, 1);
  if (Math.abs(play!.share - hold!.share) > 0.1) expect(play!.width > hold!.width).toBe(play!.share > hold!.share);
  const signature = (selector: string) => page.locator(`${selector} .arc-lineup li`).evaluateAll((items) => items.map((li) => ({ name: li.getAttribute("aria-label"), captain: !!li.querySelector(".arc-captain"), score: li.querySelector(".arc-card-score")?.textContent })));
  const first = await signature(".arc-move");
  await page.locator(".arc-chain-node").first().click();
  expect(await signature(".arc-chain-detail")).toEqual(first);
  await expect(move.locator(".arc-split .is-pick .arc-split-step")).toContainText((await page.locator(".arc-chain-node").first().locator("b").textContent())!);
  // Both outcomes are worked out off the page (the tap itself answers at once) and arrive in the buttons.
  const outcomes = page.getByRole("group", { name: "What comes next" });
  await expect(outcomes.getByRole("button")).toHaveCount(2);
  await expect(outcomes).not.toContainText("working it out", { timeout: 30_000 });
  await move.getByRole("group", { name: "Lineup", exact: true }).getByRole("button").nth(1).click();
  const second = await signature(".arc-move");
  expect(second).not.toEqual(first);
  await page.getByRole("group", { name: "Chain lineup" }).getByRole("button", { name: "Lineup 2", exact: true }).click();
  expect(await signature(".arc-chain-detail")).toEqual(second);
  await move.getByRole("button", { name: "Edit in Pick teams" }).click();
  await page.getByText("Each card's numbers").click();
  expect(await signature(".arc-detail")).toEqual(second);
  await show(page, "Players");
  await show(page, "Play now");
  await expect(move.getByRole("heading", { level: 2 })).toHaveText(`Play 4 lineups ${ON}`);
  await show(page, "Batch");
  const batch = page.getByRole("region", { name: "Batch" });
  for (let i = 0; i < 3; i++) await batch.getByRole("button", { name: "More teams" }).click();
  await expect(batch.locator(".arc-batch-lineup")).toHaveCount(4);
  expect(await signature(".arc-batch-lineup:first-child")).toEqual(first);
  const players = await batch.locator(".arc-lineup > li").evaluateAll(items => items.map(item => item.getAttribute("aria-label")));
  expect(new Set(players).size).toBe(20);
});

test("the chain's Surest switch waits for the window that clears the step most surely, and says by how much", async ({ page }) => {
  // Owner, 10 Nov 2026: "the closest best lineups I can actually play for that step ... sacrificing speed".
  const later = new Date(Date.parse(KICKOFF) + 26 * 3600000).toISOString();
  const games = [KICKOFF, later].map((date, i) => ({ id: `Game:sure-${i}`, date, statusTyped: "scheduled", competition: { slug: "laliga-es", displayName: "LaLiga" }, homeTeam: { slug: `club-${i}`, name: `Club ${i}` }, awayTeam: { slug: `rival-${i}`, name: `Rival ${i}` } }));
  const cards = games.flatMap((_, i) => SQUAD.map(([slug, player, name, position]) => ({ slug: `${slug}-${i}`, pictureUrl: null, anyPositions: [position], cardSet: { slug: "glitch" }, skinEdition: { bonus: 1 }, anyPlayer: { slug: `${player}-${i}`, displayName: `${name} ${i}` }, anyTeam: { slug: `club-${i}`, name: `Club ${i}` } })));
  const board = structuredClone(ANSWERS.arcade) as { currentUser: { setBoard: { myCurrentStep: { id: string; level: number }; steps: Record<string, unknown>[] } } };
  board.currentUser.setBoard.myCurrentStep = { id: "s1", level: 1 };
  board.currentUser.setBoard.steps[0] = { ...board.currentUser.setBoard.steps[0], state: "PLAYABLE", engineConfiguration: { captain: 0.5 }, remainingLineupsCount: 4, maxLineupsCount: 4 };
  await page.route("**/api/arcade/chances", (route) => route.fulfill({ json: { chances: {} } }));
  await withExtension(page, { ...ANSWERS, arcade: board,
    "arcade-games": { currentUser: { setBoard: { pickableGames: { nodes: games.map((game) => ({ game })), pageInfo: { hasNextPage: false } } } } },
    "arcade-cards": { currentUser: { cards: { nodes: cards, pageInfo: { hasNextPage: false } } } },
    "arcade-past": { players: cards.map((c) => ({ slug: c.anyPlayer.slug, playerGameScores: [40, 50, 60].map((score) => ({ score, anyPlayerGameStats: { minsPlayed: 90 } })) })) },
    ...Object.fromEntries(games.map((game, i) => [`arcade-projections:${game.id}`, { anyGame: { id: game.id, playerGameScores: cards.filter((c) => c.anyTeam.slug === `club-${i}`).map((c) => ({ projection: { score: i ? 75 : 46 } , anyPlayer: c.anyPlayer })) } }])),
  }, "0.4.18");
  await page.goto("/arcade");
  const chain = page.locator(".arc-chain");
  const modes = chain.getByRole("group", { name: "Chain" });
  await expect(modes.getByRole("button", { name: "Fastest" })).toHaveAttribute("aria-pressed", "true");
  const node = chain.locator(".arc-chain-node").first();
  await expect(node.locator(".arc-chain-time")).toHaveText(clock(KICKOFF));
  await expect(chain.locator(".arc-chain-gain")).toHaveCount(0);
  await modes.getByRole("button", { name: "Surest" }).click();
  await expect(modes.getByRole("button", { name: "Surest" })).toHaveAttribute("aria-pressed", "true");
  await expect(node.locator(".arc-chain-time")).toHaveText(clock(later));
  const gain = Number((await node.locator(".arc-chain-gain").textContent())!.match(/^\+(\d+) vs fastest$/)![1]);
  expect(gain).toBeGreaterThanOrEqual(15);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect(await smallText(page, width === 390 ? 10 : 11)).toEqual([]);
    if (process.env.ARCADE_PLAN_SHOT) await chain.screenshot({ path: `${process.env.ARCADE_PLAN_SHOT}-surest-${width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await node.click();
  const detail = chain.locator(".arc-chain-detail");
  await expect(detail).toContainText(`+${gain} points over the fastest chain`);
  const names = await detail.locator(".arc-lineup li").evaluateAll((items) => items.map((li) => li.getAttribute("aria-label")));
  expect(names.every((n) => n!.endsWith(" 1"))).toBe(true); // the later game's cards
  const outcomes = page.getByRole("group", { name: "What comes next" });
  await expect(outcomes).not.toContainText("working it out", { timeout: 30_000 });
  await detail.getByRole("button", { name: "Edit in Pick teams" }).click();
  await page.getByText("Each card's numbers").click();
  expect(await page.locator(".arc-detail .arc-lineup li").evaluateAll((items) => items.map((li) => li.getAttribute("aria-label")))).toEqual(names);
  await modes.getByRole("button", { name: "Fastest" }).click();
  await expect(node.locator(".arc-chain-time")).toHaveText(clock(KICKOFF));
  await expect(chain.locator(".arc-chain-detail")).toHaveCount(0);
  // The ladder is the next 7 days, and a tapped step lists its likeliest lineups (owner, 10 Nov 2026).
  const ladder = page.locator(".arc-ladder");
  await expect(ladder).toHaveAttribute("data-caption", "Next 7 days");
  await ladder.locator("li").filter({ hasText: "300" }).getByRole("button").click();
  const best = page.getByRole("region", { name: "Step 2: five likeliest lineups" });
  const options = best.getByRole("group", { name: "Step lineups" }).getByRole("button");
  await expect(options.first()).toBeVisible();
  expect(await options.count()).toBeGreaterThanOrEqual(2); // each game's own, and a span over both
  expect(await options.count()).toBeLessThanOrEqual(5);
  const odds = (await options.allTextContents()).map((t) => Number(t.match(/(\d+)%$/)![1]));
  expect(odds).toEqual([...odds].sort((a, b) => b - a));
  await options.nth(1).click();
  await expect(options.nth(1)).toHaveAttribute("aria-pressed", "true");
  const five = await best.locator(".arc-lineup li").evaluateAll((items) => items.map((li) => li.getAttribute("aria-label")));
  expect(five).toHaveLength(5);
  await best.getByRole("button", { name: "Edit in Pick teams" }).click();
  await expect(page.locator(".arc-plan .arc-aim select")).toHaveValue("2");
  expect(await page.locator(".arc-pitch li img, .arc-pitch li .arc-card-blank").evaluateAll((items) => items.map((el) => el.getAttribute("alt") ?? el.textContent))).toEqual(expect.arrayContaining(five));
  await ladder.locator("li").filter({ hasText: "300" }).getByRole("button").click();
  await expect(best).toHaveCount(0);
  // One aim for Pick teams and Batch (9 Nov 2026: two pickers, two saved values).
  const teamsAim = page.locator(".arc-plan .arc-aim select");
  await teamsAim.selectOption("2");
  await show(page, "Batch");
  const batchAim = page.getByRole("region", { name: "Batch" }).getByLabel("Batch target");
  await expect(batchAim).toHaveValue("2");
  await batchAim.selectOption("1");
  await show(page, "Play now");
  await expect(teamsAim).toHaveValue("1");
  await page.reload();
  await expect(teamsAim).toHaveValue("1");
  await show(page, "Batch");
  await expect(batchAim).toHaveValue("1");
});

/** Fourteen games, one forward of yours in each but the first (Club, the full squad): two pages of tickets. */
function pickerAnswers() {
  const games = Array.from({ length: 14 }, (_, i) => ({ id: i === 0 ? GAME : `Game:picker-${i}`, date: KICKOFF, statusTyped: "scheduled", competition: { slug: "laliga-es", displayName: "LaLiga" }, homeTeam: { slug: i === 0 ? "club" : i === 1 ? "barcelona" : `club-${i}`, name: i === 0 ? "Club" : i === 1 ? "Barcelona" : `Club ${i}` }, awayTeam: { slug: `rival-${i}`, name: `Rival ${i}` } }));
  const singleCards = games.slice(1).map((g, i) => ({ slug: `single-${i}`, pictureUrl: null, anyPositions: ["Forward"], cardSet: { slug: "glitch" }, skinEdition: { bonus: 1 }, anyPlayer: { slug: `single-${i}`, displayName: i === 0 ? "Raphinha" : `Forward ${i}` }, anyTeam: g.homeTeam }));
  const base = ANSWERS["arcade-cards"] as { currentUser: { cards: { nodes: unknown[] } } };
  const answers = { ...ANSWERS,
    "arcade-games": { currentUser: { setBoard: { pickableGames: { nodes: games.map((game) => ({ game })), pageInfo: { hasNextPage: false } } } } },
    "arcade-cards": { currentUser: { cards: { nodes: [...base.currentUser.cards.nodes, ...singleCards], pageInfo: { hasNextPage: false } } } },
    "arcade-past": { players: [...SQUAD.map(([, player]) => ({ slug: player, playingStatus: "STARTER", playerGameScores: [50, 60, 70].map((score) => ({ score, anyPlayerGameStats: { minsPlayed: 90 } })) })), ...singleCards.map((c) => ({ slug: c.anyPlayer.slug, playingStatus: "STARTER", playerGameScores: [50, 60, 70].map((score) => ({ score, anyPlayerGameStats: { minsPlayed: 90 } })) }))] },
    ...Object.fromEntries(games.slice(1).map((g, i) => [`arcade-projections:${g.id}`, { anyGame: { id: g.id, playerGameScores: [{ projection: { score: i === 0 ? 90 : 60 }, anyPlayer: singleCards[i]!.anyPlayer }] } }])),
  };
  return answers;
}

test("Pick teams starts empty, every pick shows across pages, and a tap that leaves the five as they were says so", async ({ page }) => {
  // 9 Nov 2026: the plan's 25 games were picked on pages out of sight, so the owner's taps never changed the team.
  await page.route("**/api/arcade/chances", (route) => route.fulfill({ json: { chances: {} } }));
  await withExtension(page, pickerAnswers(), "0.4.18");
  await page.goto("/arcade");
  const picker = page.locator(".arc-plan");
  const tickets = picker.getByRole("group", { name: "Games to pick from", exact: true });
  await expect(picker).toContainText("Pick at least one game.");
  await expect(tickets.locator(".arc-ticket[aria-pressed=true]")).toHaveCount(0);
  await tickets.getByRole("button", { name: /Club v Rival 0/ }).click();
  await expect(picker.locator(".arc-pitch li")).toHaveCount(5);
  const team = await picker.locator(".arc-pitch li").evaluateAll((els) => els.map((el) => el.textContent));
  await picker.getByRole("button", { name: "Next page" }).click();
  await tickets.getByRole("button", { name: /Club 13 v Rival 13/ }).click(); // a 60-point forward: the squad's are better
  await expect(picker.getByRole("status").filter({ hasText: "Club 13 v Rival 13" })).toContainText("the five stay");
  expect(await picker.locator(".arc-pitch li").evaluateAll((els) => els.map((el) => el.textContent))).toEqual(team);
  await picker.getByRole("button", { name: "Picked (2)", exact: true }).click();
  await expect(tickets.getByRole("button")).toHaveCount(2);
  await expect(tickets.locator(".arc-ticket[aria-pressed=true]")).toHaveCount(2);
  await tickets.getByRole("button", { name: /Club 13 v Rival 13/ }).click();
  await expect(picker.getByRole("status").filter({ hasText: "Club 13 v Rival 13" })).toContainText("the five stay");
  await expect(picker.getByRole("button", { name: "Picked (1)", exact: true })).toBeVisible();
});

test("the club row flanks all teams with arrows while the bigger pitch, compact chances and game matrix remember selections", async ({ page }) => {
  const answers = pickerAnswers();
  await page.route("**/api/arcade/chances", (route) => route.fulfill({ json: { chances: {} } }));
  await withExtension(page, answers, "0.4.18");
  await page.goto("/arcade");
  const clubs = page.locator(".arc-clubs");
  await expect(clubs.locator(".arc-club").filter({ hasText: "Barcelona" })).toContainText("Raphinha");
  const picker = page.locator(".arc-plan");
  await expect(picker.getByRole("button", { name: "Clear", exact: true })).toBeDisabled(); // starts empty
  await picker.getByRole("button", { name: /Club v Rival 0/ }).click();
  await picker.getByRole("button", { name: /Barcelona v Rival 1/ }).click();
  const tickets = picker.getByRole("group", { name: "Games to pick from", exact: true });
  const rail = clubs.getByRole("group", { name: "Teams to build around", exact: true });
  await expect(clubs.locator(".arc-club")).toHaveCount(14);
  await expect(clubs.getByRole("navigation")).toHaveCount(0);
  const first = rail.locator(".arc-rail-item").first();
  const stride = await first.evaluate((el) => el.getBoundingClientRect().width + parseFloat(getComputedStyle(el.parentElement!).columnGap));
  await clubs.getByRole("button", { name: "Next two teams" }).click();
  await expect.poll(() => rail.evaluate((el) => el.scrollLeft)).toBeCloseTo(stride * 2, 0);
  await clubs.getByRole("button", { name: "Previous two teams" }).click();
  await expect.poll(() => rail.evaluate((el) => el.scrollLeft)).toBe(0);
  const before = await clubs.locator(".arc-club button").evaluateAll((els) => els.map((el) => el.getAttribute("aria-pressed")));
  const box = await first.boundingBox();
  await page.mouse.move(box!.x + box!.width - 30, box!.y + 70);
  await page.mouse.down();
  await page.mouse.move(box!.x + 30, box!.y + 70, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => rail.evaluate((el) => el.scrollLeft)).toBeGreaterThan(50);
  expect(await clubs.locator(".arc-club button").evaluateAll((els) => els.map((el) => el.getAttribute("aria-pressed")))).toEqual(before);
  await picker.getByRole("button", { name: "Next page" }).click();
  await expect(tickets.getByRole("button")).toHaveCount(2);
  await picker.getByRole("button", { name: "Previous page" }).click();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const tops = await rail.locator(":scope > li").evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBe(1);
    const gameTops = await tickets.getByRole("button").evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
    expect(new Set(gameTops).size).toBeGreaterThan(1);
    const players = await picker.locator(".arc-pitch li").evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; }));
    expect(players.every((a, i) => players.every((b, j) => i === j || a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom)), JSON.stringify({ width, players })).toBe(true);
    const track = await rail.boundingBox();
    expect(await rail.locator(".arc-rail-item").first().evaluate((el) => el.getBoundingClientRect().width)).toBeLessThanOrEqual(track!.width - 8);
    const left = await clubs.getByRole("button", { name: "Previous two teams" }).boundingBox();
    const right = await clubs.getByRole("button", { name: "Next two teams" }).boundingBox();
    expect(left!.x + left!.width).toBeLessThanOrEqual(track!.x);
    expect(right!.x).toBeGreaterThanOrEqual(track!.x + track!.width);
    // Both arrows in one read: separate reads straddled a sub-pixel shift while the plan finished under load (10 Nov 2026).
    const [leftMid, rightMid] = await clubs.evaluate((el) => [...el.querySelectorAll(".arc-rail-prev, .arc-rail-next")].map((b) => { const r = b.getBoundingClientRect(); return r.top + r.height / 2; }));
    expect(leftMid).toBeCloseTo(rightMid!, 0);
    if (width === 1440) {
      const pitch = await picker.locator(".arc-pitch").boundingBox();
      const list = await tickets.boundingBox();
      expect(pitch!.x + pitch!.width).toBeLessThanOrEqual(list!.x);
      expect(pitch!.width).toBeGreaterThan(750);
      expect(await picker.locator(".arc-pitch .arc-card-blank").first().evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThan(120);
      const scale = await picker.locator(".arc-scale").boundingBox();
      expect(scale!.y).toBeGreaterThanOrEqual(pitch!.y + pitch!.height);
      expect(scale!.x).toBe(pitch!.x);
      expect(scale!.height).toBeLessThan(200);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  await page.reload();
  await expect(picker.locator(".arc-ticket[aria-pressed=true]")).toHaveCount(2);
  await expect(picker.locator(".arc-pitch")).toContainText("Best five from your 2 games");
  await expect(picker.locator(".arc-pitch li").filter({ hasText: "FWD" }).locator(".arc-card-blank")).toHaveText("Raphinha");
  await page.unroute("**/api/arcade/chances");
  await page.route("**/api/arcade/chances", (route) => route.fulfill({ json: { chances: { "Game:picker-1": { "single-0": [0, Math.floor(Date.now() / 1000)] } } } }));
  await page.getByRole("button", { name: "Refresh board and cards", exact: true }).click();
  await expect(picker.locator(".arc-ticket[aria-pressed=true]")).toHaveCount(2);
  await expect(picker.locator(".arc-pitch")).not.toContainText("Raphinha");
  await show(page, "Players");
  await show(page, "Play now");
  await expect(picker.locator(".arc-ticket[aria-pressed=true]")).toHaveCount(2);
  const reopened = await page.context().newPage();
  await offline(reopened);
  await reopened.route("**/api/arcade/chances", (route) => route.fulfill({ json: { chances: {} } }));
  await withExtension(reopened, answers, "0.4.18");
  await reopened.goto("/arcade");
  await expect(reopened.locator(".arc-plan .arc-ticket[aria-pressed=true]")).toHaveCount(2);
  await reopened.close();
  await picker.getByRole("button", { name: "Clear", exact: true }).click();
  await page.reload();
  await expect(picker).toContainText("Pick at least one game.");
});

test("Today filters the game matrix by Madrid midnight without losing selected later games", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-31T10:00:00Z"));
  const games = ["2026-10-31T14:00:00Z", "2026-10-31T23:30:00Z", "2026-10-31T22:30:00Z"].map((date, i) => ({ id: i === 0 ? GAME : `Game:date-${i}`, date, statusTyped: "scheduled", competition: { slug: "laliga-es", displayName: "LaLiga" }, homeTeam: { slug: "club", name: "Club" }, awayTeam: { slug: `rival-${i}`, name: `Rival ${i}` } }));
  await page.route("**/api/arcade/chances", (route) => route.fulfill({ json: { chances: {} } }));
  await withExtension(page, { ...ANSWERS, "arcade-games": { currentUser: { setBoard: { pickableGames: { nodes: games.map((game) => ({ game })), pageInfo: { hasNextPage: false } } } } } }, "0.4.18");
  await page.goto("/arcade");
  const picker = page.locator(".arc-plan");
  const tickets = picker.getByRole("group", { name: "Games to pick from", exact: true });
  await expect(tickets.getByRole("button")).toHaveCount(3);
  await expect(tickets.locator(".arc-ticket[aria-pressed=true]")).toHaveCount(0); // starts empty
  await tickets.getByRole("button", { name: /Club v Rival 0/ }).click();
  await tickets.getByRole("button", { name: /Club v Rival 1/ }).click();
  const team = await picker.locator(".arc-pitch").textContent();
  await picker.getByRole("button", { name: "Today", exact: true }).click();
  await expect(tickets.getByRole("button")).toHaveCount(2);
  await expect(tickets.getByRole("button", { name: /Club v Rival 1/ })).toHaveCount(0);
  await expect(tickets.getByRole("button", { name: /Club v Rival 2/ })).toBeVisible();
  await expect(picker).toContainText("1 selected later");
  expect(await picker.locator(".arc-pitch").textContent()).toBe(team);
  await picker.getByRole("button", { name: "All games", exact: true }).click();
  await expect(tickets.locator(".arc-ticket[aria-pressed=true]")).toHaveCount(2);
  await page.evaluate((game) => { (window as unknown as { __answers: Record<string, unknown> }).__answers = { "arcade-games": { currentUser: { setBoard: { pickableGames: { nodes: [{ game }], pageInfo: { hasNextPage: false } } } } } }; }, games[1]);
  await page.getByRole("button", { name: "Refresh board and cards", exact: true }).click();
  await picker.getByRole("button", { name: "Today", exact: true }).click();
  await expect(picker).toContainText("No games left today.");
  await picker.getByRole("button", { name: "All games", exact: true }).click();
  await expect(tickets.getByRole("button")).toHaveCount(1);
  await expect(tickets.locator(".arc-ticket[aria-pressed=true]")).toHaveCount(1);
});

test("saved team choices discard expired games and cleared targets, and another board starts independently", async ({ page }) => {
  const otherGame = "Game:expired";
  await page.addInitScript(({ game, otherGame }) => localStorage.setItem("sofix-arcade-teams:glitch:b", JSON.stringify({ games: [game, otherGame], aim: 1 })), { game: GAME, otherGame });
  const oldGame = { id: otherGame, date: new Date(Date.now() - 3600000).toISOString(), statusTyped: "scheduled", competition: { slug: "laliga-es", displayName: "LaLiga" }, homeTeam: { slug: "club", name: "Club" }, awayTeam: { slug: "rival", name: "Rival" } };
  await page.route("**/api/arcade/chances", (route) => route.fulfill({ json: { chances: {} } }));
  await withExtension(page, { ...ANSWERS, "arcade-games": { currentUser: { setBoard: { pickableGames: { nodes: [{ game: oldGame }, { game: { ...oldGame, id: GAME, date: KICKOFF } }], pageInfo: { hasNextPage: false } } } } } }, "0.4.18");
  await page.goto("/arcade");
  const picker = page.locator(".arc-plan");
  await expect(picker.locator(".arc-ticket")).toHaveCount(1);
  await expect(picker.locator(".arc-ticket[aria-pressed=true]")).toHaveCount(1);
  await expect(picker.getByRole("combobox", { name: "Aim at" })).toHaveValue("2");
  await picker.getByRole("button", { name: "Clear", exact: true }).click();
  const board = structuredClone(ANSWERS.arcade) as { currentUser: { setBoard: { id: string } } };
  board.currentUser.setBoard.id = "another-board";
  await page.evaluate((board) => { (window as unknown as { __answers: Record<string, unknown> }).__answers = { arcade: board }; }, board);
  await page.getByRole("button", { name: "Refresh board and cards", exact: true }).click();
  await expect(picker).toContainText("Pick at least one game."); // the new board has no picks of yours
  await expect(picker.locator(".arc-ticket[aria-pressed=true]")).toHaveCount(0);
});

test("Gems and packs compares editable mixed options without rereading odds", async ({ page }) => {
  const board = structuredClone(ANSWERS.arcade) as { currentUser: { setBoard: { steps: { level: number; cardPacks?: unknown[] }[] } } };
  const pack = (slug: string, title: string, price: number) => ({ slug, title, effectivePrice: price, currency: "COMMON_GEM", cardsCount: 1, canPurchase: true, competition: null });
  board.currentUser.setBoard.steps.find(s => s.level === 2)!.cardPacks!.push(pack("gold", "Gold", 50), pack("platinum", "Platinum", 60));
  const odds = (slug: string, p: number) => ({ slug, s0: [
    { gameplayTier: "GOAT", probabilityBasisPoint: p * 10_000, playerOdds: [{ probabilityBasisPoint: p * 10_000, player: { slug: "new" }, team: { slug: "club" } }] },
    { gameplayTier: "IMPACT", probabilityBasisPoint: (1 - p) * 10_000, playerOdds: [{ probabilityBasisPoint: (1 - p) * 10_000, player: { slug: "p" }, team: { slug: "club" } }] },
  ] });
  await withExtension(page, { ...ANSWERS, arcade: board, "arcade-pack-odds": { currentUser: { setBoard: { myCurrentStep: { cardPacks: [odds("bronze", 0), odds("silver", 0.05), odds("gold", 0.2), odds("platinum", 0.1)] } } } } }, "0.4.18");
  await page.goto("/arcade");
  await show(page, "Missions & packs");
  const gems = page.getByRole("region", { name: "Gems and packs" });
  await gems.getByRole("group", { name: "Pack calculator mode" }).getByRole("button", { name: "Compare options", exact: true }).click();
  const a = gems.getByRole("region", { name: "Option A", exact: true }), b = gems.getByRole("region", { name: "Option B", exact: true });
  await a.getByLabel("Pack 1", { exact: true }).selectOption("gold");
  await a.getByLabel("Quantity 1", { exact: true }).fill("2");
  await b.getByLabel("Pack 1", { exact: true }).selectOption("platinum");
  await b.getByRole("button", { name: "Add pack", exact: true }).click();
  await b.getByLabel("Pack 2", { exact: true }).selectOption("silver");
  await b.getByLabel("Quantity 2", { exact: true }).fill("4");
  await expect(a.getByTestId("option-goal")).toContainText("Read odds to compare");
  expect(await page.evaluate(() => (window as unknown as { __packReads?: number }).__packReads ?? 0)).toBe(0);
  await gems.getByRole("button", { name: "Read odds", exact: true }).click();
  await expect(a.getByTestId("option-cost")).toHaveText("100 gems");
  await expect(b.getByTestId("option-cost")).toHaveText("100 gems");
  await expect(a.getByTestId("option-goal")).toContainText("36%");
  await expect(b.getByTestId("option-goal")).toContainText("26.7%");
  await expect(a).toContainText("Higher chance");
  const outcomes = gems.getByRole("table", { name: "Compare tier odds" });
  await expect(outcomes.getByRole("row", { name: /^Icon / }).filter({ hasNotText: "Icon or Star" })).toContainText("0.4");
  await gems.getByLabel("Goal", { exact: true }).selectOption("new");
  await expect(a.getByTestId("option-goal")).toContainText("0.36 new players on average");
  await expect(b.getByTestId("option-goal")).toContainText("0.27 new players on average");
  await a.getByLabel("Quantity 1", { exact: true }).fill("0");
  await expect(a.getByLabel("Quantity 1", { exact: true })).toHaveValue("1");
  await expect(a.getByRole("button", { name: "Fewer packs in row 1" })).toBeDisabled();
  await a.getByLabel("Quantity 1", { exact: true }).fill("2");
  await show(page, "Players"); await show(page, "Missions & packs");
  expect(await page.evaluate(() => (window as unknown as { __packReads: number }).__packReads)).toBe(1);
  await page.reload();
  await expect(gems.getByRole("button", { name: "Compare options", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(a.getByLabel("Quantity 1", { exact: true })).toHaveValue("2");
  await expect(b.getByLabel("Quantity 2", { exact: true })).toHaveValue("4");
  expect(await page.evaluate(() => (window as unknown as { __packReads?: number }).__packReads ?? 0)).toBe(0);
  await b.getByRole("button", { name: "Remove pack 2", exact: true }).click();
  await expect(b.getByTestId("option-cost")).toHaveText("60 gems");
  // A newly offered pack has no saved odds: the whole option stays unknown rather than counting its other packs only.
  board.currentUser.setBoard.steps.find(s => s.level === 2)!.cardPacks!.push(pack("unread", "New pack", 20));
  await page.evaluate(board => { (window as unknown as { __answers: Record<string, unknown> }).__answers = { arcade: board }; }, board);
  await page.getByRole("button", { name: "Refresh board and cards", exact: true }).click();
  await b.getByRole("button", { name: "Add pack", exact: true }).click();
  await b.getByLabel("Pack 2", { exact: true }).selectOption("unread");
  await expect(b.getByTestId("option-goal")).toContainText("Odds unavailable");
  await expect(a.getByTestId("option-goal")).toContainText("36%");
  await b.getByLabel("Pack 2", { exact: true }).selectOption("bronze");
  await expect(b.getByTestId("option-cost")).toHaveText("60 gems + 1,000 essence");
  const partial = structuredClone(ANSWERS["arcade-cards"]) as { currentUser: { cards: { pageInfo: { hasNextPage: boolean; endCursor: string | null } } } };
  partial.currentUser.cards.pageInfo = { hasNextPage: true, endCursor: null };
  await page.evaluate(partial => { (window as unknown as { __answers: Record<string, unknown> }).__answers = { "arcade-cards": partial }; }, partial);
  await page.getByRole("button", { name: "Refresh board and cards", exact: true }).click();
  await expect(a.getByTestId("option-goal")).toContainText("Up to");
  await expect(a.getByTestId("option-goal")).toContainText("Collection incomplete");
  await expect(a.getByText("Higher chance", { exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await smallText(page, 10)).toEqual([]);
});

test("Gems and packs saves odds until an explicit read and explains a chosen quantity", async ({ page, context }) => {
  await page.route("**/api/arcade/chances", route => route.fulfill({ json: { chances: {} } }));
  await withExtension(page, ANSWERS, "0.4.18");
  await page.goto("/arcade");
  await show(page, "Missions & packs");
  const gems = page.getByRole("region", { name: "Gems and packs" });
  const reads = () => page.evaluate(() => (window as unknown as { __packReads?: number }).__packReads ?? 0);
  expect(await reads()).toBe(0);
  await expect(gems.getByLabel("Goal", { exact: true })).toBeVisible();
  const table = gems.locator(".arc-pack-outcomes");
  expect(await table.evaluate(t => t.getBoundingClientRect().right <= t.closest(".arc-pack-calculator")!.getBoundingClientRect().right)).toBe(true);
  await expect(gems.getByRole("button", { name: "Icon", exact: true })).toHaveCount(0);
  await gems.getByRole("button", { name: "Read odds", exact: true }).click();
  await expect(gems.getByText(/Saved/)).toBeVisible();
  expect(await reads()).toBe(1);
  await gems.getByLabel("Choose pack").selectOption("silver");
  await gems.getByLabel("Number of packs").fill("10");
  const calculator = gems.getByRole("region", { name: "Pack calculator" });
  await expect(calculator).toContainText("100 gems");
  const icon = calculator.getByRole("row", { name: /^Icon / }).filter({ hasNotText: "Icon or Star" });
  await expect(icon).toContainText("100%");
  await expect(icon).toContainText("10");
  await expect(calculator.getByRole("row", { name: /^Star / })).toContainText("0%");
  await gems.getByLabel("Goal", { exact: true }).selectOption("new");
  await expect(calculator.getByTestId("pack-goal-result")).toContainText("1 new player on average");
  await gems.getByLabel("Number of packs").fill("0");
  await expect(gems.getByLabel("Number of packs")).toHaveValue("1");
  await expect(gems.getByRole("button", { name: "Fewer packs" })).toBeDisabled();
  await gems.getByRole("button", { name: "More packs" }).click();
  await expect(gems.getByLabel("Number of packs")).toHaveValue("2");
  await gems.getByLabel("Gems to spend").fill("100");
  await expect(gems.getByTestId("budget-COMMON_GEM")).toContainText("10 × Silver");
  await expect(gems.getByTestId("budget-COMMON_GEM")).toContainText("1 new player on average");
  await gems.getByLabel("Pack type").selectOption("Bronze");
  await expect(gems.locator(".arc-pack-catalogue li")).toHaveCount(1);
  await show(page, "Players");
  await show(page, "Missions & packs");
  expect(await reads()).toBe(1);
  await page.reload();
  await expect(gems.getByLabel("Number of packs")).toHaveValue("2");
  await expect(calculator.getByTestId("pack-goal-result")).toContainText("1 new player on average");
  expect(await reads()).toBe(0);
  // Closing a tab retains the complete reading in this browser, with no extension available in the new tab.
  const next = await context.newPage();
  await offline(next);
  await next.goto("/arcade");
  await page.close();
  const retained = next.getByRole("region", { name: "Gems and packs" });
  await expect(retained.getByText(/Saved/)).toBeVisible();
  await expect(retained.getByLabel("Number of packs")).toHaveValue("2");
  await retained.getByRole("button", { name: "Read odds again" }).click();
  await expect(retained.getByRole("status")).toContainText("Saved odds kept");
  await expect(retained.getByTestId("pack-goal-result")).toContainText("1 new player on average");
  await next.setViewportSize({ width: 390, height: 844 });
  expect(await next.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await smallText(next, 10)).toEqual([]);
});

test("Gems and packs refreshes explicitly, retains odds after a failure and isolates boards", async ({ page }) => {
  await withExtension(page, ANSWERS, "0.4.18");
  await page.goto("/arcade");
  await show(page, "Missions & packs");
  const gems = page.getByRole("region", { name: "Gems and packs" });
  await gems.getByRole("button", { name: "Read odds", exact: true }).click();
  await gems.getByLabel("Choose pack").selectOption("silver");
  await page.evaluate(() => { (window as unknown as { __failPacks: boolean }).__failPacks = true; });
  await gems.getByRole("button", { name: "Read odds again" }).click();
  await expect(gems.getByRole("status")).toContainText("Saved odds kept");
  await expect(gems.getByRole("row", { name: /^Icon / }).filter({ hasNotText: "Icon or Star" })).toContainText("100%");
  await page.evaluate(() => { (window as unknown as { __failPacks: boolean }).__failPacks = false; });
  const changed = structuredClone(ANSWERS["arcade-pack-odds"]) as { currentUser: { setBoard: { myCurrentStep: { cardPacks: { slug: string; s0: { gameplayTier: string }[] }[] } } } };
  changed.currentUser.setBoard.myCurrentStep.cardPacks.find(p => p.slug === "silver")!.s0[0]!.gameplayTier = "STAR";
  await page.evaluate(changed => { (window as unknown as { __answers: Record<string, unknown> }).__answers = { "arcade-pack-odds": changed }; }, changed);
  await gems.getByRole("button", { name: "Read odds again" }).click();
  await expect(gems.getByRole("status")).toHaveCount(0);
  await expect(gems.getByRole("row", { name: /^Icon / }).filter({ hasNotText: "Icon or Star" })).toContainText("0%");
  await expect(gems.getByRole("row", { name: /^Star / })).toContainText("100%");
  await page.reload();
  await expect(gems.getByRole("row", { name: /^Star / })).toContainText("100%");
  const board = structuredClone(ANSWERS.arcade) as { currentUser: { setBoard: { id: string } } };
  board.currentUser.setBoard.id = "another-board";
  await page.evaluate(board => { (window as unknown as { __answers: Record<string, unknown> }).__answers = { arcade: board }; }, board);
  await page.getByRole("button", { name: "Refresh board and cards", exact: true }).click();
  await expect(gems.getByRole("button", { name: "Read odds", exact: true })).toBeVisible();
  await expect(gems.getByText(/Saved/)).toHaveCount(0);
});

test("a lineup on Sorare that cannot reach its target says it is dead, and cut losses when its cards help the next lineup more", async ({ page }) => {
  await page.route("**/api/arcade/chances", (route) => route.fulfill({ json: { chances: {} } }));
  const yesterday = new Date(Date.now() - 86_400_000).toISOString();
  const appearance = (slug: string, player: string, name: string, score: number, date: string) => ({ captain: false, score, locked: date === yesterday, bonus: 1, anyCard: { slug }, player: { slug: player, displayName: name }, game: { id: date === yesterday ? "Game:00000000-0000-0000-0000-000000000000" : GAME, date } });
  const cards = ANSWERS["arcade-cards"] as { currentUser: { cards: { nodes: Record<string, unknown>[] } } };
  await withExtension(page, {
    ...ANSWERS,
    // One more goalkeeper, free: with the lineup's cards still to play he makes the next lineup possible.
    "arcade-cards": { currentUser: { cards: { ...cards.currentUser.cards, nodes: [...cards.currentUser.cards.nodes, { slug: "c7", pictureUrl: null, anyPositions: ["Goalkeeper"], cardSet: { slug: "glitch" }, skinEdition: { bonus: 1, skinName: "Standard" }, anyPlayer: { slug: "gk2", displayName: "Keeper Seven" }, anyTeam: { slug: "club", name: "Club" } }] } } },
    "arcade-past": { players: [...SQUAD.map(([, player]) => player), "gk2"].map((slug) => ({ slug, playerGameScores: [50, 60, 70].map((score) => ({ score, anyPlayerGameStats: { minsPlayed: 90 } })) })) },
    "arcade-lineups": { currentUser: { setBoard: { steps: [{ id: "Tasks::Task:bf7e7356-70a2-4ff6-864f-112fa18e2bef", myLineups: [{ __typename: "TaskLineup", id: "l1", draft: false, aasmState: "READY", score: 10, forfeitable: true, hasLiveGames: false, updatable: false,
      // The keeper played (10 pts); four still to play, each at most 70 (his best): 10 + 280 = 290, short of 300.
      taskAppearances: [appearance("c2", "gk", "Keeper Two", 10, yesterday), appearance("c3", "d", "Defender Three", 0, KICKOFF), appearance("c4", "m", "Midfielder Four", 0, KICKOFF), appearance("c5", "m2", "Midfielder Five", 0, KICKOFF), appearance("c6", "f2", "Forward Six", 0, KICKOFF)] }] }] } } },
  });
  await page.goto("/arcade");
  const live = page.locator(".arc-race");
  await expect(live).toContainText("Dead");
  await expect(live).toContainText("Even at their best its cards cannot reach 300");
  await expect(live).toContainText("10 scored");
  await expect(live).toContainText("Cut losses");
  await expect(page.locator(".arc-move")).toContainText("Your free cards cannot fill a lineup"); // his cards in that lineup are not planned again
});

test("with extension 0.4.15 Sorare's start % come from the open Sorare tab, every day, without opening a page", async ({ page }) => {
  await page.route("**/api/arcade/chances", (route) => route.fulfill({ json: { chances: {} } }));
  await withExtension(page, { ...ANSWERS, "arcade-bench": { cards: 1, after: null, rows: [{ game: GAME, player: "p", basisPoints: 8500 }] } }, "0.4.15");
  await page.goto("/arcade");
  await page.getByRole("button", { name: "Start percentage read details" }).click();
  await expect(page.locator(".arc-read")).toContainText("Read from your Sorare tab");
  await expect(page.getByRole("button", { name: "Refresh start percentages" })).toBeVisible();
  await show(page, "Players");
  await page.getByRole("searchbox", { name: "Search player or club" }).fill("player one");
  await expect(page.locator(".arc-grid .arc-card-start")).toHaveText("85%");
});

test("% refresh replaces a cached forecast with the exact game's announced eleven and retains it across navigation", async ({ page }) => {
  const kickoff = new Date(Date.now() + 50 * 60_000).toISOString();
  const games = structuredClone(ANSWERS["arcade-games"]) as { currentUser: { setBoard: { pickableGames: { nodes: { game: { date: string } }[] } } } };
  games.currentUser.setBoard.pickableGames.nodes[0]!.game.date = kickoff;
  const person = (slug: string, position = "Defender") => ({ slug, displayName: slug, position });
  const formation = { startingLineupAvailable: true, startingLineup: [[person("gk", "Goalkeeper")], [person("d"), person("a"), person("b"), person("c")], [person("m", "Midfielder"), person("e"), person("f"), person("h")], [person("p", "Forward"), person("j")]], bench: [person("m2", "Midfielder")] };
  const official = { anyGame: { id: GAME, date: kickoff, homeTeam: { slug: "club", name: "Club" }, awayTeam: { slug: "rival", name: "Rival" }, homeFormation: formation, awayFormation: { startingLineupAvailable: false, startingLineup: [], bench: [] } } };
  await page.route("**/api/arcade/chances", (route) => route.fulfill({ json: { chances: {} } }));
  await withExtension(page, { ...ANSWERS, "arcade-games": games, "arcade-bench": { cards: 1, after: null, rows: [{ game: GAME, player: "p", basisPoints: 8500 }] }, "arcade-elevens": { anyGame: { ...official.anyGame, homeFormation: { startingLineupAvailable: false, startingLineup: [], bench: [] } } } }, "0.4.21");
  await page.goto("/arcade");
  await show(page, "Players");
  await page.getByRole("searchbox", { name: "Search player or club" }).fill("player one");
  await expect(page.locator(".arc-grid .arc-card-start")).toHaveText("85%");
  await page.evaluate((data) => { (window as unknown as { __answers: Record<string, unknown> }).__answers = { "arcade-elevens": data }; }, official);
  await page.getByRole("button", { name: "Refresh start percentages" }).click();
  await expect(page.locator(".arc-grid .arc-card-start")).toHaveText("100%");
  await expect(page.locator(".arc-grid .arc-card-start")).toHaveAttribute("title", /announced eleven/i);
  await expect(page.locator(".arc-read")).toContainText("Confirmed lineups for 1 game");
  await expect(page.locator(".arc-read")).not.toContainText("closer to kick-off, so read again then");
  await page.getByRole("searchbox", { name: "Search player or club" }).fill("midfielder five");
  await expect(page.locator(".arc-grid .arc-card-start")).toHaveText("0%");
  await page.reload();
  await page.getByRole("searchbox", { name: "Search player or club" }).fill("player one");
  await expect(page.locator(".arc-grid .arc-card-start")).toHaveText("100%");
});

test("a LaLiga streak mission gets Sofix's best five for its target, and a Decisive Picker your cards by their own record", async ({ page }) => {
  await page.route("**/api/arcade/chances", (route) => route.fulfill({ json: { chances: {} } }));
  const g = (mins: number, goals: number) => ({ anyGame: { date: "2026-10-01T12:00:00Z" }, anyPlayerGameStats: { minsPlayed: mins, gameStarted: true }, detailedScore: goals ? [{ stat: "goals", statValue: goals }] : [] });
  await withExtension(page, {
    ...ANSWERS,
    "arcade-missions": { currentUser: { setPlayTasks: [
      { __typename: "ThresholdsStreakTask", id: "t1", title: "LALIGA EA SPORTS Common", description: "Score 300+ in the LALIGA EA SPORTS Common competition", progress: 2, target: 5, expired: false, rewardConfigs: [] },
      { __typename: "DecisivePlayerPickerTask", id: "t2", title: "Decisive Picker", description: "Pick 2 players to score or assist", maxAppearancesCount: 2, expired: false, startDate: KICKOFF, decisiveStats: [{ name: "goals" }], taskAppearances: [], rewardConfigs: [] },
    ] } },
    // Player One scored in 2 of his 4 games, Forward Six in 1 of 4; the others never, and Keeper Two has played too few games to tell.
    "arcade-decisive": { players: [
      { slug: "p", playerGameScores: [g(90, 1), g(90, 0), g(90, 1), g(80, 0)] },
      { slug: "f2", playerGameScores: [g(90, 1), g(90, 0), g(90, 0), g(90, 0)] },
      { slug: "gk", playerGameScores: [g(90, 0)] },
      ...["d", "m", "m2"].map((slug) => ({ slug, playerGameScores: [] })),
    ] },
  }, "0.4.17");
  await page.goto("/arcade");
  await show(page, "Missions & packs");
  const missions = page.locator(".arc-missions");
  await expect(missions).toContainText("Your best five for it");
  await expect(missions).toContainText("to reach 300");
  await expect(missions.locator(".arc-mring").first()).toHaveAttribute("aria-label", "2 of 5");
  const picks = missions.locator(".arc-alternatives > li");
  await expect(picks).toHaveCount(5);
  await expect(picks.first()).toContainText("Player One");
  await expect(picks.first().locator(".arc-pick-chance")).toHaveText("50%");
  await expect(picks.first().getByRole("img", { name: "Last 4 games: 2 hit" })).toBeVisible();
});

test("a Decisive Player Picker already filled shows your pick's chance, and five separate alternatives", async ({ page }, testInfo) => {
  await page.route("**/api/arcade/chances", (route) => route.fulfill({ json: { chances: {} } }));
  const g = (mins: number, goals: number) => ({ anyGame: { date: "2026-10-01T12:00:00Z" }, anyPlayerGameStats: { minsPlayed: mins, gameStarted: true }, detailedScore: goals ? [{ stat: "goals", statValue: goals }] : [] });
  await withExtension(page, {
    ...ANSWERS,
    "arcade-missions": { currentUser: { setPlayTasks: [
      { __typename: "DecisivePlayerPickerTask", id: "t2", title: "Decisive Player Picker", description: "", maxAppearancesCount: 1, expired: false, startDate: KICKOFF,
        decisiveStats: [{ name: "goals" }], taskAppearances: [{ locked: false, anyPlayer: { slug: "f2" } }], rewardConfigs: [] },
    ] } },
    // Player One scored in 2 of his 4 games, Forward Six (your pick) in 1 of 4.
    "arcade-decisive": { players: [
      { slug: "p", playerGameScores: [g(90, 1), g(90, 0), g(90, 1), g(80, 0)] },
      { slug: "f2", playerGameScores: [g(90, 1), g(90, 0), g(90, 0), g(90, 0)] },
      ...["gk", "d", "m", "m2"].map((slug) => ({ slug, playerGameScores: [] })),
    ] },
  }, "0.4.17");
  await page.goto("/arcade");
  await show(page, "Missions & packs");
  const missions = page.locator(".arc-missions");
  await expect(missions.getByRole("heading", { name: "Today's missions" })).toBeVisible();
  await expect(missions.locator(".arc-own > li")).toHaveCount(1);
  await expect(missions.locator(".arc-alternatives > li")).toHaveCount(5);
  await expect(missions.locator(".arc-own .arc-pick-chance")).toHaveText("25%");
  await page.getByRole("button", { name: "L40", exact: true }).click();
  await expect(page.getByRole("button", { name: "L40", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(missions.locator(".arc-alternatives > li")).toHaveCount(5);
  await expect(missions.locator(".arc-picks li.is-yours")).toContainText("Your pick");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await missions.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await missions.screenshot({ path: testInfo.outputPath(`mission-picker-${width}.png`) });
  }
});


test("cold mission picks do not wait for projections and one window changes every mission", async ({ page }) => {
  const missions = ["first", "second"].map((id) => ({ __typename: "DecisivePlayerPickerTask", id, title: `Picker ${id}`, maxAppearancesCount: 1, expired: false, startDate: KICKOFF, decisiveStats: [{ name: "goals" }], taskAppearances: id === "first" ? [{ anyPlayer: { slug: "f2" }, locked: true }] : [], rewardConfigs: [] }));
  const players = SQUAD.map(([,slug], k) => ({ slug, allPlayerGameScores: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: Array.from({ length: 40 }, (_, i) => ({ scoreStatus: "FINAL", anyGame: { date: new Date(Date.parse(KICKOFF) - (i + 1) * 86400000).toISOString() }, anyPlayerGameStats: { minsPlayed: 90, gameStarted: true }, detailedScore: (i + k) % 3 ? [] : [{ stat: "goals", statValue: 1 }] })) } }));
  await withExtension(page, { ...ANSWERS, "arcade-missions": { currentUser: { setPlayTasks: missions } }, "arcade-decisive": { players } }, "0.4.17", true);
  await page.goto("/arcade");
  await show(page, "Missions & packs");
  const section = page.locator(".arc-missions");
  await expect(section.locator(".arc-own")).toContainText("Locked");
  await expect(section.locator(".arc-alternatives > li")).toHaveCount(10);
  await expect(section.locator(".arc-mission-status")).toHaveText(["", ""]);
  await page.getByRole("button", { name: "L5", exact: true }).click();
  await expect(section.locator(".mx-dots i")).toHaveCount(55);
  await page.getByRole("button", { name: "L40", exact: true }).click();
  await expect(section.locator(".mx-dots i")).toHaveCount(440);
  await expect(section.getByRole("group", { name: "Mission history window" })).toHaveCount(1);
  const reopened = await page.context().newPage();
  await page.close();
  await reopened.goto("/arcade");
  await expect(reopened.locator(".arc-own .arc-pick-chance")).toHaveText("30%");
});

test("coming back to the tab after opening packs reads your cards again, at most every 3 minutes; a Limited or another set's card never counts", async ({ page }) => {
  await page.clock.install();
  await withExtension(page);
  await page.goto("/arcade");
  await expect(page.locator(".arc-wallet")).toContainText("6");
  const cards = (ANSWERS["arcade-cards"] as { currentUser: { cards: { nodes: Record<string, unknown>[] } } }).currentUser.cards;
  const pack = { ...cards, nodes: [
    { ...cards.nodes[0], slug: "new-card", anyPlayer: { slug: "n", displayName: "Packed Player" } }, // a card from today's pack
    { ...cards.nodes[0], slug: "old-set", cardSet: { slug: "older" }, anyPlayer: { slug: "o", displayName: "Old Set Player" } },
    ...cards.nodes,
  ], totalCount: 8 };
  await page.evaluate((c) => { (window as unknown as { __answers: unknown }).__answers = { "arcade-cards": { currentUser: { cards: c } } }; }, pack);
  const back = () => page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await back(); // under 3 minutes: no new read
  await page.waitForTimeout(300);
  await expect(page.locator(".arc-wallet")).not.toContainText("7");
  await page.clock.fastForward("03:01");
  await back();
  await expect(page.locator(".arc-wallet")).toContainText("7"); // the packed card counts; the other set's does not
  await show(page, "Players");
  await page.getByRole("searchbox", { name: "Search player or club" }).fill("packed");
  await expect(page.locator(".arc-count")).toHaveText("1–1 of 1");
  await page.getByRole("searchbox", { name: "Search player or club" }).fill("old set");
  await expect(page.locator(".arc-count")).toHaveText("No card matches");
});
