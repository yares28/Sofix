import { expect, test, type Page } from "@playwright/test";
import { offline, resetBackend, smallText } from "./helpers";

const GAME = "Game:11111111-2222-3333-4444-555555555555";
const KICKOFF = new Date(Date.now() + 86_400_000).toISOString(); // tomorrow, inside the days Sorare projects
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
    cardSet: { currentSet: { slug: "glitch", name: "HyperGlitch", startDate: null, endDate: "2026-10-27T16:00:00Z", availableCompetitions: [] } },
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
  "arcade-games": { currentUser: { setBoard: { pickableGames: { nodes: [{ game: { id: GAME, date: KICKOFF, statusTyped: "scheduled",
    competition: { slug: "laliga-es", displayName: "LALIGA EA Sports" }, homeTeam: { slug: "club", name: "Club" }, awayTeam: { slug: "rival", name: "Rival" } } }],
    pageInfo: { hasNextPage: false, endCursor: null } } } } },
  "arcade-cards": { currentUser: { cards: { nodes: SQUAD.map(([slug, player, name, position, bonus]) => ({ slug, pictureUrl: null, anyPositions: [position], cardSet: { slug: "glitch" },
    skinEdition: { bonus, skinName: bonus > 1 ? "Holo" : "Standard" }, anyPlayer: { slug: player, displayName: name }, anyTeam: { slug: "club", name: "Club" } })), pageInfo: { hasNextPage: false, endCursor: null } } } },
  // Step 3: one card per club is asked for its club bonus; past scores; the game's projections (Player One has none: his average stands in).
  "arcade-bonuses": { currentUser: { setBoard: { b0: [{ key: "collection", bonusBasisPoints: 400 }] } } },
  "arcade-past": { players: SQUAD.map(([, player]) => ({ slug: player, playerGameScores: [50, 60, 70].map((score) => ({ score, anyPlayerGameStats: { minsPlayed: 90 } })) })) },
  "arcade-pack-odds": { currentUser: { setBoard: { myCurrentStep: { cardPacks: [
    { slug: "bronze", cardsCount: 1, s0: [{ playerOdds: [{ probabilityBasisPoint: 5000, player: { slug: "p" } }, { probabilityBasisPoint: 5000, player: { slug: "new" } }] }] },
    { slug: "silver", cardsCount: 1, s0: [{ playerOdds: [{ probabilityBasisPoint: 10000, player: { slug: "new" } }] }] },
  ] } } } },
  "arcade-projections": { anyGame: { id: GAME, playerGameScores: SQUAD.slice(1).map(([, player]) => ({ projection: { score: 60 }, anyPlayer: { slug: player } })) } },
};

test.beforeEach(async ({ page, request }) => {
  await resetBackend(request);
  await offline(page);
});

const withExtension = (page: Page, answers: Record<string, unknown> = ANSWERS, version = "0.4.14", holdPast = false) => page.addInitScript(([answers, version, holdPast]) => {
  Object.defineProperty(window, "chrome", { configurable: true, value: { runtime: { sendMessage(_id: string, message: { type: string; step?: string }, reply: (answer: unknown) => void) {
    if (message.type === "ping") return reply({ ok: true, version, sorareUser: "owner", appReachable: true });
    if (message.type === "read-arcade") return reply({ ok: true, state: "ok", players: 1, games: 1 });
    if (holdPast && message.step === "arcade-past") return;
    reply({ ok: true, state: "ok", step: message.step, data: answers[message.step ?? ""] });
  } } } });
}, [answers, version, holdPast] as const);

test("Arcade shows the step you are on, its target, reward and lineups left, your gems, essence and set cards", async ({ page }) => {
  await withExtension(page);
  await page.goto("/arcade");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Step 2 of 2 · 300 pts");
  const step = page.locator(".arc-floor.is-current"); // the tower, once predictions are read
  await expect(step).toContainText("300");
  await expect(step).toContainText("10 gems");
  await expect(page.locator(".arc-headline")).toContainText("3 lives on step 2");
  await expect(page.locator(".arc-wallet")).toContainText("3,200");
  await expect(page.locator(".arc-grid .arc-card-name").first()).toHaveText("Defender Three");
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

test("the next visit shows the last read board at once, and says when Sorare cannot be read now", async ({ page, context }) => {
  await withExtension(page);
  await page.goto("/arcade");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Step 2 of 2 · 300 pts");
  const later = await context.newPage(); // same browser, no extension this time
  await later.goto("/arcade");
  await expect(later.getByRole("heading", { level: 1 })).toHaveText("Step 2 of 2 · 300 pts");
  await expect(later.locator(".arc-grid .arc-card-name").first()).toHaveText("Defender Three");
  await expect(later.getByText(/Your board as read .*can't reach the Sofix extension/)).toBeVisible();
});

test("on a phone Arcade fits the width and keeps text readable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await withExtension(page);
  await page.goto("/arcade");
  await expect(page.locator(".arc-grid .arc-card-name").first()).toHaveText("Defender Three");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(await smallText(page, 10)).toEqual([]);
  if (process.env.ARCADE_SHOT) await page.screenshot({ path: process.env.ARCADE_SHOT, fullPage: true });
});

test("each card shows Sorare's start % for its next game, and the read button reports what Sorare's page gave", async ({ page }) => {
  let saved = false;
  await page.route("**/api/arcade/chances", (route) => route.fulfill({ json: { chances: saved ? { [GAME]: { p: [9000, 1792579200] } } : {} } }));
  await withExtension(page);
  await page.goto("/arcade");
  await page.getByRole("searchbox", { name: "Search player or club" }).fill("player one");
  await expect(page.locator(".arc-chance")).toContainText("no start % yet");
  await expect(page.locator(".arc-chance")).toContainText("v Rival");
  saved = true; // as if the walk saved Sorare's reading
  await page.getByRole("button", { name: "Read Arcade's start %" }).click();
  await expect(page.locator(".arc-read")).toContainText("Read 1 players in 1 games.");
  await expect(page.locator(".arc-grid .arc-chance")).toContainText("90% start");
  await expect(page.locator(".arc-read")).toContainText("Sorare's start % for 1 of 6 cards");
});

test("each card shows its predicted score, and Pick teams builds the best lineup from the games picked with its chance at every step", async ({ page }) => {
  await page.route("**/api/arcade/chances", (route) => route.fulfill({ json: { chances: { [GAME]: { p: [5000, 1792579200] } } } }));
  await withExtension(page);
  await page.goto("/arcade");
  // Player One: no projection, so his played average (60) × 50% start × (1 + 10% Holo + 4% club) = 34.
  await page.getByRole("searchbox", { name: "Search player or club" }).fill("player one");
  await expect(page.locator(".arc-grid .arc-pred b")).toHaveText("34");
  await page.getByRole("group", { name: "Plan by" }).getByRole("button", { name: "Pick teams" }).click();
  await expect(page.locator(".arc-pitch li")).toHaveCount(5); // the five on the pitch
  await expect(page.locator(".arc-scale-tick.is-aim")).toContainText("Step 2");
  await page.getByText("Each card's numbers").click();
  const lineup = page.locator(".arc-detail .arc-lineup li");
  await expect(lineup).toHaveCount(5);
  await expect(page.locator(".arc-detail .arc-lineup .arc-slot")).toHaveText([/^Goalkeeper/, /^Defender/, /^Midfielder/, /^Forward/, /^Extra/]);
  await expect(page.locator(".arc-detail .arc-lineup .arc-captain")).toHaveCount(1);
  await expect(lineup.filter({ hasText: "Keeper Two" })).toContainText("no start % yet");
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

test("Pick a day plans the day's lineups at the step they land on, no card twice, and says whether to spend a life", async ({ page }) => {
  await page.route("**/api/arcade/chances", (route) => route.fulfill({ json: { chances: {} } }));
  await withExtension(page);
  await page.goto("/arcade");
  await expect(page.getByRole("group", { name: "Plan by" }).getByRole("button", { name: "Pick a day" })).toHaveAttribute("aria-pressed", "true");
  const departures = page.locator(".arc-dep-rows li");
  await expect(departures).toHaveCount(1); // six cards make one lineup
  await expect(departures).toContainText("Lineup 1");
  await expect(departures).toContainText("Step 2");
  await expect(page.locator(".arc-departures .arc-advice")).toContainText("Play 1 lineup on step 2");
  await expect(page.locator(".arc-headline")).toContainText("step 2");
  await expect(page.locator(".arc-deck .arc-lineup li")).toHaveCount(5); // on deck: its five cards
  // Both outcomes of the day are named: step 2 is the board's top, and with one game there is no day after it.
  const outcomes = page.getByRole("group", { name: "What comes next" });
  await expect(outcomes.getByRole("button", { name: /If it clears/ })).toContainText("step 2 cleared: the top of the board");
  await expect(outcomes.getByRole("button", { name: /If it misses/ })).toContainText("2 lives left on step 2");
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

test("Packs: on a click, the pack you can afford with the most players you do not have yet, on Sorare's odds", async ({ page }) => {
  await page.route("**/api/arcade/chances", (route) => route.fulfill({ json: { chances: {} } }));
  await withExtension(page);
  await page.goto("/arcade");
  await page.getByRole("button", { name: "Work out the best pack" }).click();
  // Silver always gives "new" (1.0); Bronze gives him half the time (0.5) and needs 1,000 essence, of 3,200.
  await expect(page.locator(".arc-open")).toContainText("Open next");
  await expect(page.locator(".arc-open")).toContainText("Silver");
  await expect(page.locator(".arc-open")).toContainText("1.0 players you do not have yet, on Sorare's odds, for 10 gems");
  await expect(page.locator(".arc-packs-list li")).toHaveCount(2);
  // The Bronze filter keeps Bronze packs only, and Open next follows it.
  await page.getByRole("group", { name: "Pack type" }).getByRole("button", { name: "Bronze (1)" }).click();
  await expect(page.locator(".arc-packs-list li")).toHaveCount(1);
  await expect(page.locator(".arc-open")).toContainText("0.5 players you do not have yet, on Sorare's odds, for 1,000 essence");
  await expect(page.getByRole("group", { name: "Pack type" }).getByRole("button", { name: "Gold (0)" })).toBeDisabled();
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
  await expect(page.locator(".arc-plan")).toContainText("cannot fill a lineup from your free cards"); // his cards in that lineup are not planned again
});

test("with extension 0.4.15 Sorare's start % come from the open Sorare tab, every day, without opening a page", async ({ page }) => {
  await page.route("**/api/arcade/chances", (route) => route.fulfill({ json: { chances: {} } }));
  await withExtension(page, { ...ANSWERS, "arcade-bench": { cards: 1, after: null, rows: [{ game: GAME, player: "p", basisPoints: 8500 }] } }, "0.4.15");
  await page.goto("/arcade");
  await expect(page.locator(".arc-read")).toContainText("Read from your Sorare tab");
  await expect(page.getByRole("button", { name: "Read start % again" })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search player or club" }).fill("player one");
  await expect(page.locator(".arc-grid .arc-chance")).toContainText("85% start");
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
