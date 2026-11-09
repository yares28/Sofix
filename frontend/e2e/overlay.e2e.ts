import { readFileSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * The sorare.com overlay, against a Sorare that is not there (plans/overlay.md, O5).
 *
 * The real extension scripts run unchanged (core.js, bridge.js, content.js, overlay.js and overlay.css) on a page
 * that draws the same card pictures Sorare does, at every size it does, and asks a GraphQL endpoint of the same
 * shape which card is which. Only the two things a test cannot have are faked: the browser's `chrome.*` (with the
 * app's answers scripted) and the network. So a change to how a card is found, named, sized or drawn fails here
 * rather than on the owner's lineup page.
 */

const EXTENSION = path.join(__dirname, "..", "..", "extension");
const FIXTURE = readFileSync(path.join(__dirname, "fixtures", "sorare-cards.html"), "utf8");
const PAGE_URL = "https://sorare.com/football/e2e/cards";
// Your gallery (B2): the overlay draws prices only on the gallery of the account Sofix reads ("yares").
const GALLERY = readFileSync(path.join(__dirname, "fixtures", "sorare-gallery.html"), "utf8");
const MY_GALLERY = "https://sorare.com/football/my-club/yares/cards/limited";
const WORTH = {
  user: "yares", at: "2026-10-21T06:00:00Z", paid: 268, worth: 312, profit: 44, bought: 30,
  cards: { "unai-simon-2026-limited-12": [3.02, 3.4], "pau-cubarsi-2026-rare-3": [null, 2.1], "lionel-messi-2026-limited-77": [5, 4] }, // Havertz: Sorare values him at nothing
};

// A player's Sorare page (B3): Sofix's line on him, as the app answers it (lib/overlay.ts, overlayProfile). Oblak is outside the answer.
const PLAYER = readFileSync(path.join(__dirname, "fixtures", "sorare-player.html"), "utf8");
const crest = (n: number) => `https://crests.football-data.org/${n}.png`;
const PROFILES = {
  pedri: {
    name: "Pedri", score: 63, ifStarts: true, pStart: 0.85, startSource: "futbolfantasy", sources: { futbolfantasy: 0.85, sorare: 0.8 },
    yours: false, inPlan: [], verdict: { kind: "up", value: "+6", note: "on your MID" }, at: "2026-10-21T06:00:00Z",
    next: [
      { opponent: "Getafe", code: "GET", crest: crest(82), venue: "H", kickoff: "2026-10-24T16:30:00Z", label: "Very favourite", bucket: 1 },
      { opponent: "Real Betis", code: "BET", crest: crest(90), venue: "A", kickoff: "2026-11-01T16:30:00Z", label: "Favourite", bucket: 2 },
      { opponent: "Real Madrid", code: "RMA", crest: crest(86), venue: "H", kickoff: "2026-11-08T20:00:00Z", label: "Underdog", bucket: 4 },
      { opponent: "Alavés", code: "ALA", crest: crest(263), venue: "H", kickoff: "2026-11-22T15:15:00Z", label: "Very favourite", bucket: 1 },
      { opponent: "Atlético Madrid", code: "ATL", crest: null, venue: "A", kickoff: "2026-11-29T20:00:00Z", label: "Even", bucket: 3 },
    ],
  },
  "unai-simon": {
    name: "Unai Simón", score: 58, ifStarts: true, pStart: 0.9, startSource: "futbolfantasy", sources: { futbolfantasy: 0.9 },
    yours: true, inPlan: ["Arena · Limited"], verdict: { kind: "own", value: "In your squad", note: "you have him" }, at: "2026-10-21T06:00:00Z", next: [],
  },
};

const uuid = (n: number) => `11111111-aaaa-4aaa-8aaa-00000000000${n}`;
const picture = (n: number) => `https://assets.sorare.com/card/${uuid(n)}/picture/tinified-x.png`;

/** The defenders of a "Select your Defender" list, best expected score first, and three forwards under "Select your Forward". */
const PICKS = [70, 65, 60, 55, 50, 45].map((x, i) => ({ n: i + 1, x, slug: `pick-${i + 1}`, card: `pick-${i + 1}-2026-limited-1`, pic: picture(11 + i) }));
const FORWARDS = [1, 2, 3].map((n) => ({ n, slug: `fwd-${n}`, card: `fwd-${n}-2026-limited-1`, pic: picture(30 + n) }));
const EXTRA_CARDS = [
  ...PICKS.map((p) => ({ slug: p.card, pictureUrl: p.pic, anyPlayer: { slug: p.slug, displayName: `Pick ${p.n}` } })),
  ...FORWARDS.map((p) => ({ slug: p.card, pictureUrl: p.pic, anyPlayer: { slug: p.slug, displayName: `Fwd ${p.n}` } })),
  { slug: "ivan-over-2026-limited-1", pictureUrl: picture(20), anyPlayer: { slug: "ivan-over", displayName: "Ivan Over" } },
  { slug: "olga-old-2026-limited-1", pictureUrl: picture(21), anyPlayer: { slug: "olga-old", displayName: "Olga Old" } },
  { slug: "dan-double-2026-limited-1", pictureUrl: picture(40), anyPlayer: { slug: "double-dan", displayName: "Dan Double" } },
];

/** What Sorare's own page would learn from its GraphQL answers: which card each picture is. */
const IDENTITY = {
  data: {
    cards: [
      { slug: "unai-simon-2026-limited-12", pictureUrl: picture(1), anyPlayer: { slug: "unai-simon", displayName: "Unai Simón" } },
      { slug: "pau-cubarsi-2026-rare-3", pictureUrl: picture(2), anyPlayer: { slug: "pau-cubarsi", displayName: "Pau Cubarsí" } },
      { slug: "lionel-messi-2026-limited-9", pictureUrl: picture(3), anyPlayer: { slug: "lionel-messi", displayName: "Lionel Messi" } },
      { slug: "unai-simon-2023-super_rare-2", pictureUrl: picture(4), anyPlayer: { slug: "unai-simon", displayName: "Unai Simón" } },
      { slug: "someone-else-2026-limited-1", pictureUrl: picture(5), anyPlayer: { slug: "someone-else", displayName: "Someone Else" } },
      { slug: "lionel-messi-2026-rare-4", pictureUrl: picture(7), anyPlayer: { slug: "lionel-messi", displayName: "Lionel Messi" } },
      { slug: "kai-havertz-2026-limited-2", pictureUrl: picture(8), anyPlayer: { slug: "kai-havertz", displayName: "Kai Havertz" } },
      ...EXTRA_CARDS,
      // Card 6 is never named by an answer: the page's own link (?card=…) is all that says which card it is.
    ],
    // Sorare's own start chance for Messi, as the page receives it (the badge at a card's foot): Sofix's answer has no SO for him.
    games: [
      {
        id: "Game:22222222-bbbb-4bbb-8bbb-000000000001",
        playerGameScores: [{ anyPlayer: { slug: "lionel-messi" }, anyPlayerGameStats: { footballPlayingStatusOdds: { starterOddsBasisPoints: 3000 } } }],
      },
    ],
  },
};

const LINEUPS = readFileSync(path.join(__dirname, "fixtures", "sorare-arcade-lineups.html"), "utf8");
const LINEUPS_URL = "https://sorare.com/football/series/hot-streak-step-2/lineups";
const LINEUPS_THREE = readFileSync(path.join(__dirname, "fixtures", "sorare-arcade-lineups-three.html"), "utf8");
/** A lineup builder: crests are drawn there and on lineup pages only (owner, 4 Nov 2026). */
const BUILDER_URL = "https://sorare.com/football/play/classic/compose/all-star";
const gameId = (n: number) => `Game:22222222-bbbb-4bbb-8bbb-0000000000${String(n).padStart(2, "0")}`;

// The crest's island (plans/overlay-v2.md step 2): each game as the app answers it, with both sides and the week's tones.
const inHours = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();
const islandGame = (over: Record<string, unknown> = {}) => ({
  id: "Game:aaaa", kickoff: inHours(30), venue: "H", competition: "laliga-es", team: "Athletic Club", teamCrest: "https://crests.football-data.org/77.png",
  opponent: "Getafe CF", opponentCrest: "https://crests.football-data.org/82.png", opponentCode: "GET", opponentColor: "#004fa3",
  game: { win: 0.46, cleanSheet: 0.33, goalsFor: 1.42, goalsAgainst: 0.88, difficulty: 45.2, bucket: 2, label: "Favourite", source: "model" },
  tones: { win: 4, cleanSheet: 3, goalsFor: 4, goalsAgainst: 5 },
  ...over,
});

const ELEVEN_HOURS_AGO = new Date(Date.now() - 11 * 3600_000).toISOString();
const FORTY_HOURS_AGO = new Date(Date.now() - 40 * 3600_000).toISOString();

/**
 * What the app answers (frontend/lib/overlay.ts): the two scores and the chances, his position, the game's odds. Sofix has
 * nothing on `someone-else`. Unai Simón is a keeper on a LaLiga game (the board's own model), Pau Cubarsí a defender who starts
 * only 31% of the time, Messi a forward with an xG on a national-team game (Sorare's odds), and Pedri a midfielder whose game
 * nobody has priced yet.
 */
const NUMBERS = {
  players: {
    "unai-simon": {
      x: 53.4, p: 0.88, average: 55, pos: "GK", laliga: true, at: ELEVEN_HOURS_AGO, start: 53.4, bench: 1.2, on: 42, pStart: 0.88, pOn: 0.01,
      startSource: "sorare", sources: { sorare: 0.88, sofix: 0.7 },
      game: { win: 0.46, cleanSheet: 0.33, difficulty: 45.2, bucket: 2, label: "Favourite", source: "model" },
      island: [islandGame()],
    },
    "pau-cubarsi": {
      x: 47.2, p: 0.31, average: 50, pos: "DEF", at: ELEVEN_HOURS_AGO, start: 52.6, bench: 8.4, pStart: 0.31, pOn: 0.3,
      startSource: "futbolfantasy", startAt: "2026-10-09T14:56:00Z", ffStatus: { kind: "doubt", since: "Desde 12/09 (18 días)" },
      sources: { futbolfantasy: 0.31, sorare: 0.4, sofix: 0.35 },
      ffMatch: { id: 22502, url: "https://www.futbolfantasy.com/partidos/22502-real-sociedad-deportivo" }, ffPlayer: "2802", benchedOn: 0.435,
      // His last ten games as Abdul Mumin's stood on 2 Nov 2026 (plans/overlay-v2.md 1.6): 0 started, 7 came on (22 min), 3 unused.
      benchRecord: { started: 0, on: 7, unused: 3, minsOn: 22, games: "UOOOOOUUOO", mins: [0, 12, 8, 6, 24, 5, 0, 0, 31, 69] },
      xd: 0.18, decisive: 0.21,
      game: { win: 0.38, cleanSheet: 0.22, difficulty: 58.4, bucket: 3, label: "Even", source: "sorare" },
      island: [islandGame({ id: "Game:live", kickoff: inHours(-0.5), team: "FC Barcelona", opponent: "Real Sociedad" })],
    },
    "lionel-messi": {
      x: 61.3, p: 0.9, average: 70, pos: "FWD", laliga: false, at: ELEVEN_HOURS_AGO, start: 64.2, bench: 20.1, on: 45.2, pStart: 0.82, pOn: 0.08, xg: 0.38,
      shape: { p: 0.28, dec: 84, plain: 51, sdDec: 9, sdPlain: 15, low: 41, high: 80, why: [["Form", 7], ["Attack", 5], ["Home", 1]] },
      onShape: { p: 0.07, dec: 70, plain: 43, sdDec: 8, sdPlain: 7, low: 33, high: 62, why: [["Minutes", -19]] },
      startSource: "sofix", sources: { sofix: 0.82 },
      price: { eur: 40, perPoint: 0.65, third: "mid", similar: 40 }, // a Limited price: his rare card says nothing of it
      game: { win: 0.65, cleanSheet: 0.29, difficulty: 30.4, bucket: 1, label: "Very favourite", source: "sorare" },
      island: [
        islandGame({ id: "Game:arg1", competition: "fifa-world-cup-qualifiers", team: "Argentina", opponent: "Brazil", venue: "A" }),
        islandGame({ id: "Game:arg2", kickoff: inHours(100), competition: "fifa-world-cup-qualifiers", team: "Argentina", opponent: "Chile", opponentCrest: "https://crests.football-data.org/1.png" }),
      ],
    },
    // A forward at a club Understat does not cover, with a priced game: he has odds but no xG.
    "kai-havertz": {
      x: 55.1, p: 0.85, average: 58, pos: "FWD", at: ELEVEN_HOURS_AGO, start: 58.4, bench: 9.1, pStart: 0.8, pOn: 0.05,
      sources: { sorare: 0.35 }, // Sofix 80%, Sorare 35%: they disagree on whether he starts (B1)
      game: { win: 0.52, cleanSheet: 0.31, difficulty: 38.7, bucket: 2, label: "Favourite", source: "model" },
      island: [islandGame({ id: "Game:fen", competition: "uefa-europa-league", opponent: "Fenerbahçe", opponentCrest: null, opponentCode: "FEN", opponentColor: "#16233f", game: null, tones: {} })],
    },
    ...Object.fromEntries(
      PICKS.map((p) => [
        p.slug,
        {
          x: p.x, p: 0.9, average: 55, pos: "DEF", at: ELEVEN_HOURS_AGO, start: p.x, bench: 5, pStart: 0.9, pOn: 0.03,
          game: { win: 0.5, cleanSheet: 0.3, difficulty: 44, bucket: 2, label: "Favourite", source: "model" },
          // The best plan uses the second and fourth of them, and captains the fourth.
          // The last of them is out, as Futbol Fantasy says: a red row on his tile.
          ...(p.n === 6 ? { pStart: 0.05, startSource: "futbolfantasy", startAt: "2026-10-09T14:56:00Z", ffStatus: { kind: "out" }, sources: { futbolfantasy: 0 }, island: [islandGame()] } : {}),
          ...(p.n === 2 ? { inPlan: { [p.card]: { lineup: "All Star", captain: false } } } : {}),
          // What a point costs (lib/overlay.ts, priceOf): the first cheap, the second dear, the third with too few like him to say.
          ...(p.n === 1 ? { price: { eur: 9.8, perPoint: 0.14, third: "cheap", similar: 120 } } : {}),
          ...(p.n === 2 ? { price: { eur: 74.1, perPoint: 1.14, third: "dear", similar: 120 } } : {}),
          ...(p.n === 3 ? { price: { eur: 30, perPoint: 0.5, third: null, similar: 3 } } : {}),
          ...(p.n === 4 ? { inPlan: { [p.card]: { lineup: "All Star", captain: true } } } : {}),
        },
      ]),
    ),
    ...Object.fromEntries(
      FORWARDS.map((p) => [
        p.slug,
        { x: 60 - p.n, p: 0.9, average: 55, pos: "FWD", at: ELEVEN_HOURS_AGO, start: 60 - p.n, bench: 5, pStart: 0.9, pOn: 0.03, game: null },
      ]),
    ),
    // His game has kicked off, and a gameweek published two days ago: numbers that no longer hold.
    "ivan-over": { x: 58, p: 0.9, average: 55, pos: "MID", at: ELEVEN_HOURS_AGO, over: true, start: 58, bench: 5, pStart: 0.9, pOn: 0.03, game: null },
    "olga-old": { x: 58, p: 0.9, average: 55, pos: "MID", at: FORTY_HOURS_AGO, start: 58, bench: 5, pStart: 0.9, pOn: 0.03, game: null },
    // Two games in the gameweek (a national team in an international week): his tile says so, and his panel lists both.
    "double-dan": {
      x: 61, p: 0.93, average: 55, pos: "MID", at: ELEVEN_HOURS_AGO, start: 58, bench: 14, pStart: 0.7, pOn: 0.2, game: null,
      fixtures: [
        { opponent: "Slovenia", venue: "H", kickoff: new Date(Date.now() + 26 * 3600_000).toISOString(), competition: "uefa-nations-league" },
        { opponent: "Macedonia", venue: "A", kickoff: new Date(Date.now() + 98 * 3600_000).toISOString(), competition: "uefa-nations-league" },
      ],
    },
  },
  cards: {
    "pedri-2026-limited-7": { x: 61.2, p: 0.9, average: 65, pos: "MID", at: ELEVEN_HOURS_AGO, start: 62.3, bench: 15, pStart: 0.9, pOn: 0.04, game: null },
  },
};

/** What the app answers for the dock: the gameweek's plan and its lineups, likeliest to pay first (lib/overlay.ts, overlayPlan). */
const row = (comp: string, board: string, x: number, need: number, p: number, ess: number, cards: { slug: string; pic: string; name: string; s: number; slot: string }[], captain: string) => ({
  comp, board, boardId: `Board:${board}`, when: "Sat", x, need, p, ess,
  cards: cards.map((card) => ({ ...card, captain: card.slug === captain, sub: false })),
  appearances: cards.map((card, index) => ({ cardSlug: card.slug, captain: card.slug === captain, index })),
});
const PLAN = {
  state: "ready", week: 17, lineups: 2, x: 417, comp: "All Star", pics: [1, 2, 3, 4, 7].map(picture), pAny: 0.16, likely: "250 essence", cardsUsed: 9, cardsAvailable: 87,
  lock: new Date(Date.now() + 5 * 3600_000).toISOString(),
  rows: [
    row("All Star", "all-star", 218, 260, 0.16, 40, PICKS.slice(0, 5).map((p, i) => ({ slug: p.card, pic: p.pic, name: `Pick ${p.n}`, s: p.x, slot: ["GK", "DEF", "MID", "FWD", "EXT"][i]! })), PICKS[0]!.card),
    row("Limited", "limited", 199, 300, 0.05, 10, [{ slug: "unai-simon-2026-limited-12", pic: picture(1), name: "Unai Simón", s: 53, slot: "GK" }], "unai-simon-2026-limited-12"),
  ],
};
/** Today's missions as the app sums them up for the dock: one swap Sofix would make, and one mission you picked as it would. */
const pick = (n: number, chance: number) => ({ slug: `fwd-${n}`, name: `Fwd ${n}`, pic: picture(30 + n), chance });
const MISSIONS = {
  status: "today", seenAt: new Date(Date.now() - 3600_000).toISOString(), rarity: "limited",
  missions: [
    { id: "t1", title: "Decisive Picker", reward: "200 XP", picks: 2, yours: [pick(1, 0.29), pick(3, 0.45)], sofix: [pick(3, 0.45), pick(2, 0.39)], swaps: [{ out: pick(1, 0.29), in: pick(2, 0.39) }] },
    { id: "t2", title: "Tackle · Champions League", reward: "50 All-Star essence", picks: 1, yours: [pick(3, 0.22)], sofix: [pick(3, 0.22)], swaps: [] },
  ],
};
/** What Sorare answers each Apply step from the dock, as the page bridge passes it on: nothing entered yet, and each step done. */
const SORARE_STEPS: Record<string, unknown> = {
  entered: { state: "ok", data: { so5: { so5Leaderboard: { mySo5Lineups: [] } } } },
  check: { state: "ok", data: { so5: { so5Leaderboard: { previewSo5Lineup: { rewardMultiplier: 1, feedbackRules: [] } } } } },
  draft: { state: "ok", data: { createOrUpdateSo5Lineup: { errors: [], so5Lineup: { id: "L-1", draft: true } } } },
  enter: { state: "ok", data: { confirmSo5Lineups: { errors: [], so5Lineups: [{ id: "L-1", draft: false }] } } },
};

type Mode = "ok" | "auth" | "unreachable";
type Live = Record<string, { at: string; players: Record<string, { p: number; lesion: number }> }>;
type Probe = { sent: { type: string; cards?: string[]; players?: string[]; fixture?: string | null }[]; opened: string[]; setOverlay: (value: boolean) => void };

/** The gameweek Sofix is planning, as a page would name it in its address; any other gameweek has no numbers in these tests. */
const THIS_WEEK = "football-25-29-sep-2026";
const OLD_WEEK = "football-18-22-sep-2026";

async function openPage(
  page: Page,
  options: { mode?: Mode; overlay?: boolean; delay?: number; viewport?: { width: number; height: number }; query?: string; live?: Live; plan?: unknown; steps?: Record<string, unknown>; url?: string; html?: string; need?: unknown; team?: unknown } = {},
) {
  const mode = options.mode ?? "ok";
  if (options.viewport) await page.setViewportSize(options.viewport);

  // The page answers at its address whatever the query is, as Sorare's does.
  const pageUrl = options.url ?? PAGE_URL;
  await page.route((url) => url.origin + url.pathname === pageUrl, (route) => route.fulfill({ contentType: "text/html", body: options.html ?? FIXTURE }));
  await page.route("https://crests.football-data.org/**", (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#d33"/></svg>' }));
  await page.route("https://assets.sorare.com/**", (route) => {
    if (/\.webm/.test(route.request().url())) return route.fulfill({ status: 200, contentType: "video/webm", body: "" });
    const art =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 452"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#f7c948"/><stop offset="1" stop-color="#b87a08"/></linearGradient></defs>' +
      '<rect width="320" height="452" fill="url(#g)"/><circle cx="160" cy="190" r="74" fill="#2b2b30"/><rect x="64" y="310" width="192" height="30" rx="6" fill="#2b2b30"/></svg>';
    return route.fulfill({ contentType: "image/svg+xml", body: art });
  });
  await page.route("https://api.sorare.com/graphql", (route) => {
    const operation = (route.request().postDataJSON() as { operationName?: string } | null)?.operationName;
    const body = operation === "LineupQuery" ? IDENTITY : { data: { currentUser: null } };
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });

  // The browser's extension API, with the app's answers scripted. Everything else is the real thing.
  await page.addInitScript(
    (config) => {
      const listeners: ((changes: unknown, area: string) => void)[] = [];
      const probe = {
        sent: [] as unknown[],
        opened: [] as string[],
        overlay: config.overlay,
        setOverlay(value: boolean) {
          probe.overlay = value;
          listeners.forEach((listener) => listener({ overlay: { newValue: value } }, "sync"));
        },
      };
      (window as unknown as { __sfx: unknown }).__sfx = probe;
      const answer = (message: { type: string; cards?: string[]; players?: string[]; fixture?: string | null }) => {
        // What the worker answers for Futbol Fantasy read live: nothing unless a test gives it a reading.
        if (message.type === "ff-live") return config.mode === "ok" ? { state: "ok", live: config.live } : { state: config.mode };
        if (message.type === "overlay-plan") {
          if (config.mode !== "ok") return { state: config.mode };
          // What the app does for a page about a gameweek it holds nothing on: says so, in words.
          if (message.fixture && message.fixture !== config.thisWeek) return { state: "ok", plan: { state: "none", week: 0, note: "Sofix holds nothing on this gameweek." }, missions: config.missions };
          return { state: "ok", plan: config.plan, missions: config.missions };
        }
        if (message.type === "overlay-profile") {
          if (config.mode !== "ok") return { state: config.mode };
          return { state: "ok", profile: (config.profiles as Record<string, unknown>)[(message as unknown as { slug: string }).slug] ?? null };
        }
        if (message.type === "overlay-worth") return config.mode === "ok" ? { state: "ok", worth: config.worth } : { state: config.mode };
        if (message.type === "dock-step") return config.steps[(message as unknown as { step: string }).step];
        if (message.type === "need-data") return config.need;
        if (message.type === "pro-rebuild") return { success: true, data: { games: 2, starters: 4, bench: 1 }, error: null };
        if (message.type !== "overlay-numbers") return undefined;
        if (config.mode !== "ok") return { state: config.mode };
        const out = { state: "ok", cards: {} as Record<string, unknown>, players: {} as Record<string, unknown> };
        // What the app does: a page that names a gameweek is answered for that week, and only this week has numbers here.
        if (message.fixture && message.fixture !== config.thisWeek) return out;
        if (config.team && (message as { board?: string }).board) (out as Record<string, unknown>).team = config.team;
        for (const slug of message.cards ?? []) if (slug in config.numbers.cards) out.cards[slug] = (config.numbers.cards as Record<string, unknown>)[slug];
        for (const slug of message.players ?? []) if (slug in config.numbers.players) out.players[slug] = (config.numbers.players as Record<string, unknown>)[slug];
        return out;
      };
      (window as unknown as { chrome: unknown }).chrome = {
        runtime: {
          id: "e2e",
          lastError: undefined,
          onMessage: { addListener() {} },
          sendMessage(message: { type: string; path?: string }, reply?: (response: unknown) => void) {
            probe.sent.push(message);
            if (message.type === "open-app") probe.opened.push(String(message.path));
            if (reply) setTimeout(() => reply(answer(message)), config.delay);
          },
        },
        storage: {
          sync: { get: async (defaults: Record<string, unknown>) => ({ ...defaults, overlay: probe.overlay }) },
          local: {
            get: async (key: string) => ({ [key]: JSON.parse(localStorage.getItem(`chrome:${key}`) ?? "null") ?? undefined }),
            set: async (items: Record<string, unknown>) => {
              for (const [key, value] of Object.entries(items)) localStorage.setItem(`chrome:${key}`, JSON.stringify(value));
            },
          },
          onChanged: { addListener: (listener: (changes: unknown, area: string) => void) => listeners.push(listener) },
        },
      };
    },
    { mode, overlay: options.overlay ?? true, numbers: NUMBERS, plan: options.plan ?? PLAN, missions: MISSIONS, steps: options.steps ?? SORARE_STEPS, delay: options.delay ?? 15, thisWeek: THIS_WEEK, live: options.live ?? {}, worth: WORTH, profiles: PROFILES, need: options.need ?? null, team: options.team ?? null },
  );
  for (const file of ["core.js", "bridge.js", "content.js", "overlay.js", "dock.js"]) await page.addInitScript({ path: path.join(EXTENSION, file) });

  await page.goto(pageUrl + (options.query ?? ""));
  await page.addStyleTag({ path: path.join(EXTENSION, "overlay.css") });
}

const probe = (page: Page) => page.evaluate(() => (window as unknown as { __sfx: Probe }).__sfx as unknown as { sent: Probe["sent"]; opened: string[] });
const ribs = (page: Page, id: string) => page.locator(`#${id} .sfx-ribs`);
const tileOf = (page: Page, id: string) => page.locator(`#${id} [data-sfx] .sfx-tile`);
/** What a card says, in reading order: the tile's xScore and FDR, then the start % under Sorare's grade. */
const text = (page: Page, id: string) =>
  page.locator(`#${id}`).evaluate((el) => [...el.querySelectorAll(".sfx-tile .sfx-score, .sfx-tile .sfx-fdr, .sfx-start b")].map((part) => part.textContent));
const startOf = (page: Page, id: string) => page.locator(`#${id} .sfx-start`);
type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number };
const box = (page: Page, selector: string): Promise<Box> =>
  page.evaluate((query) => {
    const r = document.querySelector(query)!.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  }, selector);
const tile = (page: Page, id: string) => box(page, `#${id} [data-sfx] .sfx-tile`);
const art = (page: Page, id: string) => box(page, `#${id} img, #${id} video`);
const meets = (a: Box, b: Box) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
const panel = (page: Page) => page.getByRole("dialog", { name: "Sofix details" });

/**
 * Cards wait their turn until they are near the screen, as on the real site, so the page has settled once each kind
 * has been scrolled to and drawn. What is drawn stays drawn, so the tests then read the whole page.
 */
async function settled(page: Page) {
  for (const id of ["slot-a", "badged", "midchip", "linked", "noxg", "over", "old", "doubtful", "composecard", "pinnedcard", "realcard", "scrolled", "big", "pick-1", "pick-6", "fwd-1"]) {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
    await expect(ribs(page, id)).toBeVisible();
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(250);
}

test.describe("the sorare.com overlay", () => {
  test("draws each card at the size it is drawn, from the right numbers", async ({ page }, testInfo) => {
    await openPage(page);
    await settled(page);

    // A gallery or player page (plans/overlay-v2.md 1.2): the xScore chip, then "45 FDR", black on Sorare's own colours (the
    // page's tokens, not the extension's fallbacks: the fixture's 53 differs by a digit); his start % under Sorare's grade.
    expect(await text(page, "big")).toEqual(["53", "45", "88%"]);
    await expect(tileOf(page, "big")).toHaveCount(1);
    await expect(tileOf(page, "big").locator(".sfx-score")).toHaveCSS("background-color", "rgb(183, 255, 27)");
    await expect(tileOf(page, "big").locator(".sfx-score")).toHaveCSS("color", "rgb(14, 14, 14)");
    await expect(tileOf(page, "big").locator(".sfx-chip--fdr")).toHaveCSS("background-color", "rgb(37, 237, 54)"); // band 2 of 5
    await expect(tileOf(page, "big").locator(".sfx-chip--fdr")).toHaveText("45FDR");
    // Drawn like Sorare's start badge, mirrored for the left: 16 px tall, 12 px text, 4 px corners but the bottom left.
    for (const chip of [".sfx-score", ".sfx-chip--fdr"]) {
      await expect(tileOf(page, "big").locator(chip)).toHaveCSS("height", "16px");
      await expect(tileOf(page, "big").locator(chip)).toHaveCSS("font-size", "12px");
      await expect(tileOf(page, "big").locator(chip)).toHaveCSS("border-radius", "4px 4px 4px 0px");
    }
    await expect(tileOf(page, "big")).toHaveAttribute("aria-label", "Sofix: 53 if he starts. Difficulty 45 of 100, favourite. He starts 88% of the time (SO).");
    await expect(tileOf(page, "big")).toHaveAttribute("aria-haspopup", "dialog");
    await expect(ribs(page, "big")).toHaveClass(/sfx-ribs--full/);

    // Another copy of the same player is the same numbers: the score belongs to the player, not the card.
    expect(await text(page, "copy")).toEqual(["53", "45", "88%"]);

    // A lineup slot: the xScore chip alone and his start %, whose hover names its own source; a thumbnail: the smallest chip only.
    expect(await text(page, "slot-a")).toEqual(["53", "88%"]);
    await expect(startOf(page, "slot-a")).toHaveAttribute("title", "Sorare 88%");
    await expect(startOf(page, "big")).toHaveAttribute("title", "Sorare 88%");
    expect(await text(page, "thumb")).toEqual(["53"]);
    await expect(ribs(page, "slot-a")).toHaveClass(/sfx-ribs--compact/);
    await expect(tileOf(page, "slot-a")).not.toHaveClass(/sfx-tile--tiny/);
    await expect(tileOf(page, "thumb")).toHaveClass(/sfx-tile--tiny/);

    // A video is a card too.
    expect(await text(page, "clip")).toEqual(["53", "45", "88%"]);

    // A forward has the same two chips (the owner, 2 Nov 2026: xScore then FDR on every card), the score painted for a 64.
    expect(await text(page, "abroad")).toEqual(["64", "30", "82%"]);
    await expect(tileOf(page, "abroad").locator(".sfx-score")).toHaveCSS("background-color", "rgb(37, 237, 54)");
    await expect(tileOf(page, "abroad")).toHaveAttribute("aria-label", "Sofix: 64 if he starts. Difficulty 30 of 100, very favourite. He starts 82% of the time (SF). Sorare says 30%: they disagree.");

    // A defender Futbol Fantasy calls a doubt, at 31%: his score if he starts is still shown; his start % is Sorare's red for 31%.
    expect(await text(page, "doubtful")).toEqual(["53", "58", "31%"]);
    await expect(startOf(page, "doubtful")).toHaveClass(/sfx-start--doubt/);
    await expect(startOf(page, "doubtful")).toHaveCSS("background-color", "rgb(255, 90, 90)");
    await expect(startOf(page, "doubtful").locator(".sfx-src--futbolfantasy")).toHaveCount(1);
    await expect(tileOf(page, "doubtful")).toHaveAttribute("aria-label", /He starts only 31% of the time \(FF\)\./);
    await expect(startOf(page, "slot-b")).toHaveClass(/sfx-start--doubt/);

    // A game nobody has priced: the xScore chip alone, never an invented number or a "No odds" row.
    expect(await text(page, "noxg")).toEqual(["58", "39", "80%"]);
    expect(await text(page, "linked")).toEqual(["62", "90%"]);
    await expect(tileOf(page, "linked")).toHaveAttribute("aria-label", "Sofix: 62 if he starts. He starts 90% of the time.");

    // Nothing about the game's teams or kickoff: Sorare's own card draws those.
    expect(await page.locator("[data-sfx]").evaluateAll((all) => all.some((el) => /\(H\)|\(A\)|Sat 10 Oct|kickoff/i.test(el.textContent ?? "")))).toBe(false);

    // Nothing for what is not a card, or what Sofix has nothing on.
    await expect(ribs(page, "stranger")).toHaveCount(0);
    await expect(ribs(page, "face")).toHaveCount(0);
    await expect(ribs(page, "mini")).toHaveCount(0);

    await page.screenshot({ path: testInfo.outputPath("overlay-desktop.png"), fullPage: true });
    await page.locator("#frame").screenshot({ path: testInfo.outputPath("overlay-compose.png") });
  });

  test("asks the app only for slugs, once each, and only for what a card names", async ({ page }) => {
    await openPage(page);
    await settled(page);
    await page.waitForTimeout(300);
    const asked = (await probe(page)).sent.filter((message) => message.type === "overlay-numbers");
    const players = asked.flatMap((message) => message.players ?? []);
    const cards = asked.flatMap((message) => message.cards ?? []);
    // Six pictures show him, and he is asked about once. The linked card only has a card slug, so that is what is sent.
    expect(players.filter((slug) => slug === "unai-simon")).toHaveLength(1);
    expect(players.sort()).toEqual(
      ["double-dan", "fwd-1", "fwd-2", "fwd-3", "ivan-over", "kai-havertz", "lionel-messi", "olga-old", "pau-cubarsi", ...PICKS.map((p) => p.slug), "someone-else", "unai-simon"].sort(),
    );
    expect(cards).toEqual(["pedri-2026-limited-7"]);
    for (const message of asked) expect((message.players?.length ?? 0) + (message.cards?.length ?? 0)).toBeLessThanOrEqual(120);
    // Nothing but slugs leaves the page: no picture addresses, no names, no prices.
    expect(JSON.stringify(asked)).not.toMatch(/https?:|Unai|assets\.sorare/);
  });

  test("answers each card of a lineup for the game Sorare put it in, games of two gameweeks in one lineup", async ({ page }) => {
    // The owner's Hot Streak lineup (2 Nov 2026): two cards drawn in GW28 games, three in GW29. Each is asked about with its own game.
    const soon = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
    const cards = [
      ["unai-simon-2026-limited-12", 1, 1], ["pau-cubarsi-2026-rare-3", 2, 1], ["lionel-messi-2026-limited-9", 3, 4],
      ["kai-havertz-2026-limited-2", 4, 4], ["pick-1-2026-limited-1", 5, 4],
    ] as const;
    const need = {
      arcade: { steps: { s2: { target: 300 } } },
      arcadeLineups: [{ id: "l1", kind: "arcade", step: "s2", cards: cards.map(([slug, n, days]) => ({ slug, score: null, bonus: 1, captain: false, kickoff: soon(days), game: gameId(n) })) }],
    };
    await openPage(page, { url: LINEUPS_URL, html: LINEUPS, need });
    for (const id of ["l-simon", "l-cubarsi", "l-messi", "l-havertz", "l-pick"]) await expect(tileOf(page, id)).toHaveCount(1);
    const games = async () =>
      Object.assign({}, ...((await probe(page)).sent.filter((m) => m.type === "overlay-numbers") as { games?: Record<string, string> }[]).map((m) => m.games ?? {}));
    await expect.poll(games).toEqual({
      "p:unai-simon": gameId(1), "p:pau-cubarsi": gameId(2), "p:lionel-messi": gameId(3), "p:kai-havertz": gameId(4), "p:pick-1": gameId(5),
    });
    for (const id of ["l-simon", "l-cubarsi", "l-messi", "l-havertz", "l-pick"]) await expect(tileOf(page, id)).toHaveCount(1); // and drawn from those answers
  });

  test("on a lineup page, draws only the cards still to play or playing, and nothing on a lineup no longer in play", async ({ page }) => {
    // The owner, 3 Nov 2026: a settled score needs nothing from Sofix; with four cards finished, only the last one's pill matters.
    const at = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();
    const cards = [
      ["unai-simon-2026-limited-12", 1, -5, 60], ["pau-cubarsi-2026-rare-3", 2, -5, 55], ["lionel-messi-2026-limited-9", 3, -4, 70],
      ["kai-havertz-2026-limited-2", 4, -4, 45], ["pick-1-2026-limited-1", 5, 20, null],
    ] as const;
    const need = {
      arcade: { steps: { s2: { target: 300 } } },
      arcadeLineups: [{ id: "l1", kind: "arcade", step: "s2", cards: cards.map(([slug, n, hours, score]) => ({ slug, score, bonus: 1, captain: false, kickoff: at(hours), game: gameId(n) })) }],
    };
    await openPage(page, { url: LINEUPS_URL, html: LINEUPS, need });
    await expect(tileOf(page, "l-pick")).toHaveCount(1);
    await expect(page.locator("#l-pick .sfx-need")).toHaveText("70"); // 300 - 230 already scored: the one card left needs 70
    await page.waitForTimeout(800);
    for (const id of ["l-simon", "l-cubarsi", "l-messi", "l-havertz"]) {
      await expect(tileOf(page, id)).toHaveCount(0);
      await expect(page.locator(`#${id} .sfx-need`)).toHaveCount(0);
    }
  });

  test("on a lineup page, one card the page never named does not blank the rest of its lineup (9 Nov 2026)", async ({ page }) => {
    const at = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();
    const slugs = ["unai-simon-2026-limited-12", "pau-cubarsi-2026-rare-3", "lionel-messi-2026-limited-9", "kai-havertz-2026-limited-2", "mystery-2026-limited-1"];
    const need = {
      arcade: { steps: { s2: { target: 300 } } },
      arcadeLineups: [{ id: "l1", kind: "arcade", step: "s2", cards: slugs.map((slug, i) => ({ slug, score: null, bonus: 1, captain: false, kickoff: at(20), game: gameId(i + 1) })) }],
    };
    // Pick 1's picture swapped for one no answer of the page names, and no link around it.
    const html = LINEUPS.replace(/alt="Pick 1 - limited" src="[^"]+"/, 'alt="Mystery Man - limited" src="https://assets.sorare.com/card/11111111-aaaa-4aaa-8aaa-000000000099/picture/tinified-x.png"');
    await openPage(page, { url: LINEUPS_URL, html, need });
    for (const id of ["l-simon", "l-cubarsi", "l-messi", "l-havertz"]) await expect(tileOf(page, id)).toHaveCount(1);
  });

  test("on an Arcade step's lineups page, the lineup in progress says its chance to clear the target; missed ones say nothing", async ({ page }, testInfo) => {
    const at = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();
    const card = (slug: string, n: number, hours: number, score: number | null) => ({ slug, score, bonus: 1, captain: false, kickoff: at(hours), game: gameId(n) });
    const need = {
      arcade: { steps: { s2: { target: 300 } } },
      arcadeLineups: [
        // In progress: 60 + 55 banked, three cards still to play (Messi, Havertz, Pick 1).
        { id: "w", kind: "arcade", step: "s2", cards: [card("unai-simon-2026-limited-12", 1, -5, 60), card("pau-cubarsi-2026-rare-3", 2, -5, 55), card("lionel-messi-2026-limited-9", 3, 20, null), card("kai-havertz-2026-limited-2", 4, 20, null), card("pick-1-2026-limited-1", 5, 20, null)] },
        // Missed: every game over, under the target.
        { id: "m1", kind: "arcade", step: "s2", cards: [2, 3, 4, 5, 6].map((n) => card(`pick-${n}-2026-limited-1`, 10 + n, -30, 40)) },
        { id: "m2", kind: "arcade", step: "s2", cards: [card("fwd-1-2026-limited-1", 21, -30, 40), card("fwd-2-2026-limited-1", 22, -30, 40), card("fwd-3-2026-limited-1", 23, -30, 40), card("unai-simon-2023-super_rare-2", 24, -30, 40), card("lionel-messi-2026-rare-4", 25, -30, 40)] },
      ],
    };
    await openPage(page, { url: LINEUPS_URL, html: LINEUPS_THREE, need });
    const pill = page.locator("#b-waiting .sfx-clear");
    await expect(pill).toHaveText(/^(\d+%|<1%|>99%) to clear$/);
    await expect(pill).toHaveAttribute("title", /reaches 300 \(115 so far, 3 cards still to score\)/);
    // Beside the ribbon's word, on its line.
    const [word, ours] = [await box(page, "#b-waiting .ribbon span"), await box(page, "#b-waiting .sfx-clear")];
    expect(ours.left).toBeGreaterThanOrEqual(word.right);
    expect(Math.abs(ours.top + ours.height / 2 - (word.top + word.height / 2))).toBeLessThan(6);
    await expect(page.locator("#b-missed-1 .sfx-clear, #b-missed-2 .sfx-clear")).toHaveCount(0);
    await expect(page.locator(".sfx-clear")).toHaveCount(1);
    expect(await pill.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(11);
    await page.screenshot({ path: testInfo.outputPath("overlay-clear.png") });
    // The overlay off: nothing of Sofix's on the page.
    await page.evaluate(() => (window as unknown as { __sfx: { setOverlay: (v: boolean) => void } }).__sfx.setOverlay(false));
    await expect(page.locator(".sfx-clear")).toHaveCount(0);
  });

  test("on a card that lets things show past its edge, the start % hangs out like Sorare's badge, in one column with it", async ({ page }) => {
    // 3 Nov 2026, the builder's pitch (the owner's screenshot): Sorare's start badge 4 px past the card's right edge, 8 px down, its
    // grade under it, the captain's round button on the corner. Sofix's start % joins that column, under the grade.
    await openPage(page);
    await settled(page);
    await page.evaluate(() => {
      const card = document.querySelector<HTMLElement>("#graded")!;
      card.style.overflow = "visible";
      card.style.margin = "0 24px";
      Object.assign(document.querySelector<HTMLElement>("#sostart")!.style, { right: "-4px", top: "8px", height: "16px", padding: "2px 4px" });
      Object.assign(document.querySelector<HTMLElement>("#grade")!.style, { right: "-4px", top: "28px" });
      const cap = Object.assign(document.createElement("button"), { id: "socap", textContent: "C" });
      cap.style.cssText = "position:absolute;z-index:2;right:-16px;top:-16px;width:32px;height:32px;border-radius:50%";
      card.append(cap);
      card.dispatchEvent(new Event("resize"));
    });
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    await page.locator("#graded").scrollIntoViewIfNeeded();
    await expect
      .poll(async () => {
        const [chip, so, grade] = [await box(page, "#graded .sfx-start"), await box(page, "#sostart"), await box(page, "#grade")];
        return [Math.round(chip.right - so.right) || 0, Math.round(chip.top - grade.bottom) || 0];
      })
      .toEqual([0, 4]);
    // With no badge of Sorare's, it takes the badge's own place: 4 px out, 8 px down.
    await page.evaluate(() => ["#sostart", "#grade", "#socap"].forEach((id) => document.querySelector(id)!.remove()));
    await page.evaluate(() => document.querySelector("#graded")!.append(document.createElement("i"))); // a page change: look again
    await expect
      .poll(async () => {
        const [chip, card] = [await box(page, "#graded .sfx-start"), await art(page, "graded")];
        return [Math.round(chip.right - card.right) || 0, Math.round(chip.top - card.top) || 0];
      })
      .toEqual([4, 8]);
    // The tile mirrors it on the left: 4 px out past the left edge, 8 px down.
    const [t, card] = [await tile(page, "graded"), await art(page, "graded")];
    expect([Math.round(card.left - t.left), Math.round(t.top - card.top)]).toEqual([4, 8]);
  });

  test("a card that cuts at its own edge inside a box of its size still has its pills hanging out (Sorare's builder list)", async ({ page }) => {
    // 3 Nov 2026: Sorare's list cards sit in a wrapper with `contain: content`, which cut ours at the card's edge; Sorare's badge
    // lives one box up. Ours go there too.
    await openPage(page);
    await settled(page);
    await page.evaluate(() => {
      const card = document.querySelector<HTMLElement>("#graded")!;
      card.style.contain = "content";
      const holder = document.createElement("div");
      holder.style.cssText = "position:relative;width:163px;margin:0 24px";
      card.before(holder);
      holder.append(card);
      ["#sostart", "#grade"].forEach((id) => document.querySelector(id)!.remove());
    });
    // Drawn afresh, as on a page that had the wrapper from the start.
    await page.evaluate(() => (window as unknown as { __sfx: { setOverlay: (v: boolean) => void } }).__sfx.setOverlay(false));
    await page.evaluate(() => (window as unknown as { __sfx: { setOverlay: (v: boolean) => void } }).__sfx.setOverlay(true));
    await page.locator("#graded").scrollIntoViewIfNeeded();
    await expect
      .poll(async () => {
        const [chip, card] = [await box(page, "#graded + .sfx-start, #graded ~ .sfx-start"), await art(page, "graded")];
        return [Math.round(chip.right - card.right) || 0, Math.round(chip.top - card.top) || 0];
      })
      .toEqual([4, 8]);
    const [t, card] = [await box(page, "#graded ~ .sfx-ribs"), await art(page, "graded")];
    expect(Math.round(card.left - t.left)).toBe(4);
  });

  test("finds Sorare's start badge and grade even when they let clicks through, and goes under them (4 Nov 2026: ours covered its 100%)", async ({ page }) => {
    await page.addInitScript(() => {
      const style = document.createElement("style");
      style.textContent = "#sostart, #grade { pointer-events: none; }";
      document.addEventListener("DOMContentLoaded", () => document.head.append(style));
    });
    await openPage(page);
    await settled(page);
    await page.locator("#graded").scrollIntoViewIfNeeded();
    await expect
      .poll(async () => {
        const [chip, so, grade] = [await box(page, "#graded .sfx-start"), await box(page, "#sostart"), await box(page, "#grade")];
        return !meets(chip, so) && chip.top >= grade.bottom;
      })
      .toBe(true);
  });

  test("on a narrow full card the chips are tighter, and the start % never lies over the tile", async ({ page }) => {
    // 3 Nov 2026, Sorare's builder list: 118 x 191 px cards, a badge of theirs pushing the tile down into the start % row.
    await openPage(page);
    await settled(page);
    await page.evaluate(() => {
      const card = document.querySelector<HTMLElement>("#graded")!;
      card.style.width = "118px";
      card.querySelector("img")!.style.cssText = "height:191px;aspect-ratio:auto"; // Sorare's builder card, measured 3 Nov
      document.querySelector<HTMLElement>("#grade")!.style.top = "20px";
      const theirs = Object.assign(document.createElement("span"), { className: "theirs", textContent: "1" });
      theirs.style.top = "22px";
      card.prepend(theirs);
    });
    await page.locator("#graded").scrollIntoViewIfNeeded();
    await expect(tileOf(page, "graded")).toHaveClass(/sfx-tile--narrow/);
    await expect
      .poll(async () => {
        const [t, chip] = [await tile(page, "graded"), await box(page, "#graded .sfx-start")];
        return !meets(t, chip) && t.height === 36;
      })
      .toBe(true);
  });

  test("on a lineup page, the points-needed pill sits above Sorare's start badge, or beside it with no room above", async ({ page }) => {
    // plans/overlay-v2.md 1.2: the pill stays top right, above Sorare's start badge; Sofix's start % goes under the badge.
    const at = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();
    const need = {
      arcade: { steps: { s2: { target: 300 } } },
      arcadeLineups: [
        {
          id: "l1",
          kind: "arcade",
          step: "s2",
          cards: (["unai-simon-2026-limited-12", "pau-cubarsi-2026-rare-3", "lionel-messi-2026-limited-9", "kai-havertz-2026-limited-2", "pick-1-2026-limited-1"] as const).map((slug, i) => ({
            slug, score: i < 4 ? 50 : null, bonus: 1, captain: false, kickoff: at(i < 4 ? -0.5 : 20), game: gameId(i + 1),
          })),
        },
      ],
    };
    const badge = (top: number) =>
      page.evaluate((y) => {
        document.querySelector("#sostart")?.remove();
        const el = Object.assign(document.createElement("span"), { id: "sostart", textContent: "80%" });
        el.style.cssText = `position:absolute;z-index:2;right:6px;top:${y}px;height:18px;padding:2px 4px;background:#00f3eb;color:#000;font:700 12px/14px sans-serif;border-radius:4px`;
        document.querySelector("#l-pick")!.append(el);
      }, top);
    await openPage(page, { url: LINEUPS_URL, html: LINEUPS, need });
    await expect(page.locator("#l-pick .sfx-need")).toBeVisible();
    await badge(32);
    await expect
      .poll(async () => {
        const [pill, so] = [await box(page, "#l-pick .sfx-need"), await box(page, "#sostart")];
        return pill.bottom <= so.top && so.top - pill.bottom < 6;
      })
      .toBe(true);
    // Sorare's badge right at the top: no room above it, so the pill goes beside it.
    await badge(6);
    await expect
      .poll(async () => {
        const [pill, b] = [await box(page, "#l-pick .sfx-need"), await box(page, "#sostart")];
        return pill.right <= b.left && Math.abs(pill.top - b.top) < 2;
      })
      .toBe(true);
  });

  test("on a lineup page, a lineup no longer in play shows no tiles", async ({ page }) => {
    await openPage(page, { url: LINEUPS_URL, html: LINEUPS, need: { arcade: { steps: {} }, arcadeLineups: [] } });
    await page.waitForTimeout(2500);
    await expect(page.locator("#lineup [data-sfx] .sfx-tile")).toHaveCount(0);
    expect((await probe(page)).sent.some((m) => m.type === "need-data")).toBe(true); // it did look: none of them is in play
  });

  test("draws no crest on the gallery, the market or any other list, only on a lineup builder or lineup page", async ({ page }) => {
    for (const url of [PAGE_URL, MY_GALLERY, "https://sorare.com/football/market"]) {
      await openPage(page, { url, ...(url === MY_GALLERY ? { html: GALLERY } : {}) });
      await expect(page.locator(".sfx-tile").first()).toBeVisible();
      await page.waitForTimeout(600);
      await expect(page.locator(".sfx-crest")).toHaveCount(0);
      await page.unrouteAll({ behavior: "ignoreErrors" });
    }
    await openPage(page, { url: BUILDER_URL });
    await expect(page.locator(".sfx-crest").first()).toBeAttached();
  });

  test("a scroll moves only the crests: a pass at most every 400 ms while it lasts, each crest on its card's top edge, none over a sticky header", async ({ page }) => {
    await openPage(page, { url: BUILDER_URL });
    await settled(page);
    await page.locator("#big").scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    type Perf = { passes: number; discovers: number; moves: number; slowest: number; slowestMove: number };
    const perf = () => page.evaluate(() => ({ ...(globalThis as unknown as { __sofixPerf: Perf }).__sofixPerf }));
    const crestOffset = () =>
      page.evaluate(() => {
        const art = document.querySelector("#big img")!.getBoundingClientRect();
        const crest = [...document.querySelectorAll<HTMLElement>(".sfx-crests .sfx-crest")].find((c) => {
          const r = c.getBoundingClientRect();
          return r.left < art.right && r.right > art.left && Math.abs(r.top + r.height / 2 - art.top) < 40;
        });
        if (!crest) return null;
        const r = crest.getBoundingClientRect();
        return { dy: r.top + r.height / 2 - art.top, hidden: getComputedStyle(crest).visibility === "hidden" };
      });
    expect(await crestOffset()).toMatchObject({ hidden: false });
    const before = await perf();
    // Twenty scroll frames, down then up: the crests follow on each frame, and nothing else runs.
    const during = await page.evaluate(async () => {
      const passes: number[] = [];
      for (let i = 0; i < 20; i += 1) {
        window.scrollBy(0, i < 10 ? 6 : -6);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        passes.push((globalThis as unknown as { __sofixPerf: { passes: number } }).__sofixPerf.passes);
      }
      return passes;
    });
    expect(during.at(-1)! - before.passes).toBeLessThanOrEqual(2); // twenty frames (about a third of a second): at most two passes
    const after = await perf();
    expect(after.moves).toBeGreaterThanOrEqual(before.moves + 10);
    expect(after.discovers).toBe(before.discovers);
    expect(Math.abs((await crestOffset())!.dy)).toBeLessThan(2); // still on its card's top edge
    await page.waitForTimeout(400);
    expect((await perf()).passes).toBeGreaterThan(before.passes); // one pass once the scroll has stopped

    // A sticky bar of the page's over the card's top edge: the crest hides rather than ride over it, and comes back after.
    await page.evaluate(() => {
      const art = document.querySelector("#big img")!.getBoundingClientRect();
      const bar = document.createElement("div");
      bar.id = "stickybar";
      bar.style.cssText = `position:fixed;left:0;right:0;top:${art.top - 30}px;height:60px;background:#222;z-index:5`;
      document.body.append(bar);
      window.scrollBy(0, 1);
    });
    await expect.poll(async () => (await crestOffset())?.hidden).toBe(true);
    await page.evaluate(() => {
      document.getElementById("stickybar")!.remove();
      window.scrollBy(0, -1);
    });
    await expect.poll(async () => (await crestOffset())?.hidden).toBe(false);
    // The budget, loosely on a test machine: a pass well under 50 ms, a crest move under 8.
    const end = await perf();
    expect(end.slowest).toBeLessThan(50);
    expect(end.slowestMove).toBeLessThan(8);
  });

  test("puts the opponent's crest on each card's top edge, half outside, in each of its states", async ({ page }) => {
    await openPage(page, { url: BUILDER_URL });
    await settled(page);
    const read = (id: string) =>
      page.evaluate((cardId) => {
        const art = document.querySelector(`#${cardId} img, #${cardId} video`)!.getBoundingClientRect();
        const near = [...document.querySelectorAll<HTMLElement>(".sfx-crests .sfx-crest")].find((c) => {
          const r = c.getBoundingClientRect();
          return Math.abs(r.top + r.height / 2 - art.top) < 3 && r.left < art.right && r.right > art.left;
        });
        if (!near) return null;
        const r = near.getBoundingClientRect();
        return { cx: r.left + r.width / 2 - (art.left + art.width / 2), cy: r.top + r.height / 2 - art.top, kind: near.className, text: near.textContent, imgs: near.querySelectorAll("img").length, width: r.width };
      }, id);
    // The crests follow their cards on each frame of a scroll; one drawn for a card scrolled in comes with the pass after it.
    const crestOf = async (id: string) => {
      await expect.poll(() => read(id)).not.toBeNull();
      return read(id);
    };
    await page.locator("#big").scrollIntoViewIfNeeded();
    const big = await crestOf("big");
    expect(big).toMatchObject({ imgs: 1, text: "" });
    expect(Math.abs(big!.cx)).toBeLessThan(2); // centred on the card
    expect(Math.abs(big!.cy)).toBeLessThan(2); // on its top edge: half outside
    expect(big!.width).toBeCloseTo(22, 0); // smaller than the canvas's 40 (the owner, 3 Nov 2026, twice)
    await page.locator("#abroad").scrollIntoViewIfNeeded();
    expect(await crestOf("abroad")).toMatchObject({ imgs: 2 }); // two games, two crests
    await page.locator("#noxg").scrollIntoViewIfNeeded();
    expect(await crestOf("noxg")).toMatchObject({ imgs: 0, text: "FEN" }); // no crest from Sorare: its shield
    await page.locator("#doubtful").scrollIntoViewIfNeeded();
    // his game on: the crest alone with a red dot, no word (the owner, 4 Nov 2026)
    expect(await crestOf("doubtful")).toMatchObject({ text: "", kind: expect.stringContaining("sfx-crest--live") });
    expect(await page.locator(".sfx-crest--live .sfx-live-dot").first().evaluate((el) => el.getBoundingClientRect().width)).toBeLessThanOrEqual(5);
    await page.locator("#pick-6").scrollIntoViewIfNeeded();
    expect((await crestOf("pick-6"))!.text).toBe("Out");
    // A card Sofix has no game for draws no crest at all.
    await page.locator("#over").scrollIntoViewIfNeeded();
    await page.waitForTimeout(600); // past the pass that follows the scroll
    expect(await read("over")).toBeNull();
  });

  test("a crest picture that will not load gives way to the club's shield, and a small box of Sorare's on the card's edge does not hide it (9 Nov 2026)", async ({ page }) => {
    await openPage(page, { url: BUILDER_URL });
    await settled(page);
    await page.route("https://crests.football-data.org/missing.png", (route) => route.fulfill({ status: 404, body: "" }));
    await page.locator("#big").scrollIntoViewIfNeeded();
    const crest = () =>
      page.evaluate(() => {
        const art = document.querySelector("#big img")!.getBoundingClientRect();
        const c = [...document.querySelectorAll<HTMLElement>(".sfx-crests .sfx-crest")].find((one) => {
          const r = one.getBoundingClientRect();
          return r.left < art.right && r.right > art.left && Math.abs(r.top + r.height / 2 - art.top) < 20;
        });
        return c ? { text: c.textContent, imgs: c.querySelectorAll("img").length, hidden: getComputedStyle(c).visibility === "hidden" } : null;
      });
    await expect.poll(crest).toMatchObject({ imgs: 1 });
    // The crest's picture fails (a 404, a refused hot-link): Getafe's shield takes its place.
    await page.evaluate(() => {
      const art = document.querySelector("#big img")!.getBoundingClientRect();
      for (const img of document.querySelectorAll<HTMLImageElement>(".sfx-crests .sfx-crest img")) {
        const r = img.getBoundingClientRect();
        if (r.left < art.right && r.right > art.left && Math.abs(r.top + r.height / 2 - art.top) < 20) img.src = "https://crests.football-data.org/missing.png";
      }
    });
    await expect.poll(crest).toMatchObject({ text: "GET", imgs: 0 });
    // Sorare's own small box over the card's top edge, outside the card's block (a slot's frame): not a bar, so the crest stays.
    await page.evaluate(() => {
      const art = document.querySelector("#big img")!.getBoundingClientRect();
      const box = document.createElement("div");
      box.id = "theirbox";
      box.style.cssText = `position:fixed;left:${art.left + art.width / 2 - 20}px;top:${art.top - 10}px;width:40px;height:30px;z-index:5`;
      document.body.append(box);
      window.scrollBy(0, 1);
    });
    await page.waitForTimeout(500);
    expect(await crest()).toMatchObject({ hidden: false });
  });

  test("opens the island from the crest, above the card, by pointer or keyboard, and closes it on Escape", async ({ page }) => {
    await openPage(page, { url: BUILDER_URL });
    await settled(page);
    await page.locator("#big").scrollIntoViewIfNeeded();
    // The crest on this card's top edge (other copies of the same player have crests of their own), once the scroll's pass has run.
    const find = () =>
      page.evaluate(() => {
        const art = document.querySelector("#big img")!.getBoundingClientRect();
        return [...document.querySelectorAll(".sfx-crest")].findIndex((c) => {
          const r = c.getBoundingClientRect();
          return Math.abs(r.top + r.height / 2 - art.top) < 3 && Math.abs(r.left + r.width / 2 - (art.left + art.width / 2)) < 3;
        });
      });
    await expect.poll(find).toBeGreaterThanOrEqual(0);
    await page.waitForTimeout(300); // and settled where it is
    const index = await find();
    const crest = page.locator(".sfx-crest").nth(index);
    await expect(crest).toHaveAccessibleName(/Sofix: next game v Getafe CF/);
    await page.mouse.move(5, 5);
    const at = (await crest.boundingBox())!;
    await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2); // a pointer, as a person moves one: the island then covers the crest
    const isle = page.getByRole("dialog", { name: /Sofix: v Getafe CF/ });
    await expect(isle).toBeVisible();
    await expect(isle.locator(".sfx-isl-stat")).toHaveText(["WIN46%", "CS33%", "XG1.42", "XGA0.88", "FDR45"]);
    await expect(isle.locator(".sfx-isl-stat").first()).toHaveCSS("background-color", "rgb(37, 237, 54)"); // fifth sixth: Sorare's green
    await expect(isle.locator(".sfx-isl-mid span")).toHaveText("LaLiga");
    const art = await box(page, "#big img");
    const shown = await isle.boundingBox();
    expect(shown!.y + shown!.height).toBeLessThanOrEqual(art.top + 21); // above the card, not over its art
    expect((await new AxeBuilder({ page }).include(".sfx-island").analyze()).violations).toEqual([]);
    await page.mouse.move(5, 5);
    await expect(isle).toHaveCount(0);
    // Keyboard: focus the crest, Enter opens it with focus inside, Escape closes it and gives the focus back.
    await crest.focus();
    await page.keyboard.press("Enter");
    await expect(isle).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(isle).toHaveCount(0);
    await expect(crest).toBeFocused();
    // Pressing the crest never presses the card under it.
    expect(await page.evaluate(() => (window as unknown as { __clicked?: string }).__clicked ?? null)).toBeNull();
  });

  test("the crest disappears with the switch and its motion stops under reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openPage(page, { url: BUILDER_URL });
    await settled(page);
    await page.locator("#doubtful").scrollIntoViewIfNeeded();
    // the pulse is the dot's ring
    await expect.poll(() => page.locator(".sfx-live-dot").first().evaluate((el) => getComputedStyle(el, "::after").animationName)).toBe("none");
    await page.evaluate(() => (window as unknown as { __sfx: { setOverlay: (v: boolean) => void } }).__sfx.setOverlay(false));
    await expect(page.locator(".sfx-crests, .sfx-crest, .sfx-island")).toHaveCount(0);
  });

  test("takes the crests away when Sorare hides the cards for another page", async ({ page }) => {
    // 3 Nov 2026: opening a player from the gallery, Sorare hid the gallery's cards without removing them, and their crests stayed
    // over the player's page where the cards had been.
    await openPage(page, { url: BUILDER_URL });
    await settled(page);
    await page.locator("#big").scrollIntoViewIfNeeded();
    await expect(page.locator(".sfx-crest").first()).toBeVisible();
    await page.evaluate(() => document.querySelectorAll<HTMLElement>("body > :not([data-sfx])").forEach((el) => (el.style.display = "none")));
    await expect(page.locator(".sfx-crest")).toHaveCount(0);
  });

  test("takes the crests away from cards under a player's page laid over them, and keeps the one on his card", async ({ page }) => {
    // 3 Nov 2026, the gallery: Sorare opens a player as a full-screen dialog over the gallery, whose cards stay where they were.
    await openPage(page, { url: BUILDER_URL });
    await settled(page);
    await page.locator("#big").scrollIntoViewIfNeeded();
    await expect(page.locator(".sfx-crest").first()).toBeVisible();
    await page.evaluate(() => {
      const sheet = document.createElement("div");
      sheet.setAttribute("role", "dialog");
      sheet.style.cssText = "position:fixed;inset:0;background:#111;z-index:10";
      const card = document.querySelector("#big")!.cloneNode(true) as HTMLElement;
      card.id = "big-open";
      card.style.cssText = "position:absolute;left:300px;top:200px";
      sheet.append(card);
      document.body.append(sheet);
    });
    await expect(page.locator(".sfx-crest")).toHaveCount(1);
  });

  test("keeps the tiles when the extension is reloaded under an open page", async ({ page }) => {
    // 2 Nov 2026, GW29 builder: after a Reload the worker puts a fresh overlay in the open tab (its own isolated world, as
    // Chrome does), and the old one, left with nothing to talk to, took every tile on the page with it minutes later.
    await openPage(page, { url: BUILDER_URL });
    await settled(page);
    await page.locator("#big").scrollIntoViewIfNeeded();
    const cdp = await page.context().newCDPSession(page);
    const { frameTree } = await cdp.send("Page.getFrameTree");
    const { executionContextId } = await cdp.send("Page.createIsolatedWorld", { frameId: frameTree.frame.id, worldName: "sofix-reloaded" });
    const stub = `(() => {
      const numbers = ${JSON.stringify(NUMBERS)};
      const answer = (m) => m.type === "ff-live" ? { state: "ok", live: {} }
        : m.type !== "overlay-numbers" ? undefined
        : { state: "ok", cards: Object.fromEntries((m.cards || []).filter((s) => s in numbers.cards).map((s) => [s, numbers.cards[s]])),
            players: Object.fromEntries((m.players || []).filter((s) => s in numbers.players).map((s) => [s, numbers.players[s]])) };
      globalThis.chrome = {
        runtime: { id: "e2e-reloaded", lastError: undefined, onMessage: { addListener() {} }, sendMessage(m, reply) { if (reply) setTimeout(() => reply(answer(m)), 15); } },
        storage: { sync: { get: async (d) => ({ ...d, overlay: true }) }, onChanged: { addListener() {} } },
      };
    })();`;
    for (const source of [stub, ...["core.js", "content.js", "overlay.js"].map((file) => readFileSync(path.join(EXTENSION, file), "utf8"))]) {
      const result = await cdp.send("Runtime.evaluate", { expression: source, contextId: executionContextId });
      expect(result.exceptionDetails).toBeUndefined();
    }
    await expect(tileOf(page, "big")).toHaveCount(2); // both copies draw until the old one notices

    // The old copy loses its extension, and its numbers have aged past the ten minutes it keeps them. The page is watched for any
    // moment with no tile on the card: here the new copy happens to redraw at once, on Sorare's builder nothing woke it.
    await page.evaluate(() => {
      const w = window as unknown as { __fewest: number };
      w.__fewest = 2;
      new MutationObserver(() => {
        w.__fewest = Math.min(w.__fewest, document.querySelectorAll("#big [data-sfx] .sfx-tile").length);
      }).observe(document.body, { childList: true, subtree: true });
      const runtime = (window as unknown as { chrome: { runtime: { id?: string; sendMessage: () => void } } }).chrome.runtime;
      runtime.id = undefined;
      runtime.sendMessage = () => {
        throw new Error("Extension context invalidated.");
      };
      const real = Date.now;
      Date.now = () => real() + 11 * 60_000;
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect(tileOf(page, "big")).toHaveCount(1);
    await page.waitForTimeout(1500);
    await expect(tileOf(page, "big")).toHaveCount(1);
    expect(await page.evaluate(() => (window as unknown as { __fewest: number }).__fewest)).toBe(1);
    expect(await text(page, "big")).toEqual(["53", "45", "88%"]);
  });

  test("never doubles a tile when the page re-renders, and follows an element that is given another card", async ({ page }) => {
    await openPage(page);
    await settled(page);

    await page.evaluate(() => (window as unknown as { rerender: () => void }).rerender());
    await expect(ribs(page, "slot-a")).toHaveCount(1);
    await expect(ribs(page, "slot-b")).toHaveCount(1);
    await expect(ribs(page, "big")).toBeVisible();
    await page.waitForTimeout(300);
    for (const id of ["slot-a", "slot-b", "slot-c", "copy", "abroad", "linked", "noxg"]) await expect(ribs(page, id)).toHaveCount(1);
    for (const id of ["slot-a", "slot-b", "big"]) await expect(startOf(page, id)).toHaveCount(1);
    expect(await text(page, "slot-a")).toEqual(["53", "88%"]);

    // The same element, now Pau Cubarsí's card: the old numbers must not stay on it.
    await page.evaluate((n) => (window as unknown as { swapCard: (id: string, uuid: string, alt: string) => void }).swapCard("slot-a", `11111111-aaaa-4aaa-8aaa-00000000000${n}`, "Pau Cubarsí - rare"), 2);
    await expect(startOf(page, "slot-a")).toHaveClass(/sfx-start--doubt/);
    expect(await text(page, "slot-a")).toEqual(["53", "31%"]);
    await expect(ribs(page, "slot-a")).toHaveCount(1);
    await expect(startOf(page, "slot-a")).toHaveCount(1);
  });

  test("sits inside the card's top-left corner and leaves every wrapper of Sorare's as it was", async ({ page }) => {
    await openPage(page);
    await settled(page);
    await page.waitForTimeout(250);

    for (const id of ["big", "copy", "clip", "composecard"]) {
      const [t, m] = [await tile(page, id), await art(page, id)];
      expect(Math.abs(t.left - (m.left + 6)), `${id} sits 6px in`).toBeLessThan(1);
      expect(Math.abs(t.top - (m.top + 6)), `${id} sits 6px down`).toBeLessThan(1);
      expect(t.height, id).toBe(36); // the xScore chip, "45 FDR" 4 px under it (the owner, 3 Nov 2026)
      expect(t.width, id).toBeLessThan(48);
      expect(t.left, id).toBeGreaterThan(m.left);
      expect(t.right, id).toBeLessThan(m.right);
    }
    const slot = await tile(page, "slot-a");
    expect([slot.left - (await art(page, "slot-a")).left, slot.top - (await art(page, "slot-a")).top, slot.height]).toEqual([4, 4, 16]);
    const thumb = await tile(page, "thumb");
    expect([thumb.left - (await art(page, "thumb")).left, thumb.top - (await art(page, "thumb")).top, thumb.height]).toEqual([3, 3, 14]);

    // Nothing hangs past the picture any more, so no wrapper is told to let it show: the card keeps its own clipping.
    await expect(page.locator("#big")).toHaveCSS("overflow", "hidden");
    // The only thing of ours on a page that carries a class of Sorare's is the margin on their odds bars (checked below):
    // the compose card's, and the one three rows under a card in a list.
    const borrowed = await page.evaluate(() => [...document.querySelectorAll('[class*="sfx-"]')].filter((el) => !el.closest("[data-sfx]") && !el.hasAttribute("data-sfx")).map((el) => el.id));
    expect(borrowed.sort()).toEqual(["wdl", "wdl3"]);
  });

  test("takes little room and none of the card's face", async ({ page }) => {
    await openPage(page);
    await settled(page);
    await page.waitForTimeout(250);
    const fraction = async (id: string) => {
      const [t, m] = [await tile(page, id), await art(page, id)];
      return { t, m, share: (t.width * t.height) / (m.width * m.height) };
    };
    for (const id of ["big", "copy", "clip", "composecard", "linked"]) {
      const { t, m, share } = await fraction(id);
      // The owner's first live look lost about 17% of a card to three chips. The tile, now with the chance of starting on
      // every one (he asked for it), stays under 7% of a full card.
      expect(share, `${id} covers little of the card`).toBeLessThan(0.07);
      const centre: Box = { left: m.left + m.width * 0.25, right: m.right - m.width * 0.25, top: m.top + m.height * 0.25, bottom: m.bottom - m.height * 0.25, width: 0, height: 0 };
      expect(meets(t, centre), `${id} stays out of the centre`).toBe(false);
    }
    for (const id of ["slot-a", "thumb"]) {
      const { t, m, share } = await fraction(id);
      expect(share, `${id} covers little of a small card`).toBeLessThan(0.08);
      const centre: Box = { left: m.left + m.width * 0.25, right: m.right - m.width * 0.25, top: m.top + m.height * 0.25, bottom: m.bottom - m.height * 0.25, width: 0, height: 0 };
      expect(meets(t, centre), `${id} stays out of the centre`).toBe(false);
    }
    // The doubtful starter's red row lengthens the tile on purpose: still under 7.5% of the card and off the face.
    const doubt = await fraction("doubtful");
    expect(doubt.share).toBeLessThan(0.075);
    expect(doubt.t.bottom).toBeLessThan(doubt.m.top + doubt.m.height * 0.3);
  });

  test("starts below a chip of Sorare's own, never covers a control of theirs, and only its own box answers the pointer", async ({ page }) => {
    await openPage(page);
    await settled(page);
    await expect(ribs(page, "badged")).toBeVisible();
    await page.waitForTimeout(250);

    // A badge of theirs sits where the tile would go: the tile starts under it, whatever it is called.
    const [mine, badge] = [await tile(page, "badged"), await box(page, "#badge")];
    expect(meets(mine, badge)).toBe(false);
    expect(mine.top).toBeGreaterThanOrEqual(badge.bottom);

    // A chip of theirs lower down the edge, between the tile's top and bottom lines, is cleared all the same.
    const [low, chip] = [await tile(page, "midchip"), await box(page, "#midbadge")];
    expect(meets(low, chip)).toBe(false);
    expect(low.top).toBeGreaterThanOrEqual(chip.bottom);

    // On the compose card their percentage and their captain control hang off the right: neither is touched, and the
    // captain control is still what is under the pointer.
    const [ours, gold, cap] = [await tile(page, "composecard"), await box(page, "#gold"), await box(page, "#cap")];
    expect(meets(ours, gold)).toBe(false);
    expect(meets(ours, cap)).toBe(false);
    // The start % sits under their percentage, clear of it and of the captain control.
    const start = await box(page, "#composecard .sfx-start");
    expect(meets(start, gold)).toBe(false);
    expect(meets(start, cap)).toBe(false);
    expect(start.top).toBeGreaterThanOrEqual(gold.bottom);
    await page.locator("#composecard").scrollIntoViewIfNeeded(); // a point off the screen has nothing under it
    const under = await page.evaluate(() => {
      const at = (id: string) => {
        const r = document.querySelector(id)!.getBoundingClientRect();
        return (document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) as HTMLElement | null)?.id;
      };
      return { cap: at("#cap"), gold: at("#gold") };
    });
    expect(under).toEqual({ cap: "cap", gold: "gold" });

    // Their "Buy now" button under a card is still the thing under the pointer, and nothing of ours lies over it.
    const buy = await page.evaluate(() => {
      const target = document.querySelector("#buy")!.getBoundingClientRect();
      const top = document.elementFromPoint(target.left + target.width / 2, target.top + target.height / 2) as HTMLElement | null;
      // Anything of ours that takes the pointer (the crests' page-wide layer takes none).
      const overlaps = [...document.querySelectorAll("[data-sfx]")].filter((el) => getComputedStyle(el).pointerEvents !== "none").some((el) => {
        const r = el.getBoundingClientRect();
        return r.left < target.right && r.right > target.left && r.top < target.bottom && r.bottom > target.top;
      });
      return { hit: top?.id, overlaps };
    });
    expect(buy).toEqual({ hit: "buy", overlaps: false });

    // The wrappers take no click. What does is the tile of a full card, in its own 44px, and never a small card's number.
    // The crests are buttons of their own above the card's edge (step 2), and the start % chip answers a hover with whose number it
    // is (step 3; a press on it still reaches the card, its parent): the only other things of ours that answer the pointer.
    const wrappers = await page.evaluate(() => [...document.querySelectorAll("[data-sfx]")].filter((el) => !el.matches(".sfx-crest, .sfx-start") && getComputedStyle(el).pointerEvents !== "none").length);
    expect(wrappers).toBe(0);
    const answering = await page.evaluate(() =>
      [...document.querySelectorAll(".sfx-tile")].map((el) => ({ pointer: getComputedStyle(el).pointerEvents, width: el.getBoundingClientRect().width, compact: el.classList.contains("sfx-tile--compact") })),
    );
    for (const one of answering) {
      expect(one.pointer, JSON.stringify(one)).toBe(one.compact ? "none" : "auto");
      expect(one.width).toBeLessThanOrEqual(80);
    }

    // A press anywhere on the card except the tile still selects the card; a press on the tile selects nothing.
    await page.locator("#big").scrollIntoViewIfNeeded(); // the hero card is below the fold: a click there needs it on screen
    const face = await box(page, "#big img");
    await page.evaluate(() => ((window as unknown as { __picked: string | null }).__picked = null));
    await page.mouse.click(face.left + face.width / 2, face.top + face.height * 0.7);
    expect(await page.evaluate(() => (window as unknown as { __picked: string | null }).__picked)).toBe("big");
    await page.evaluate(() => ((window as unknown as { __picked: string | null }).__picked = null));
    await tileOf(page, "big").click();
    expect(await page.evaluate(() => (window as unknown as { __picked: string | null }).__picked)).toBeNull();
    await expect(panel(page)).toBeVisible();
  });

  test("in a list that scrolls the tile stays inside the picture, and the list is left exactly as it was", async ({ page }) => {
    await openPage(page);
    await settled(page);
    await expect(ribs(page, "scrolled")).toBeVisible();
    await page.waitForTimeout(250);
    const [mine, m] = [await tile(page, "scrolled"), await art(page, "scrolled")];
    expect(mine.left).toBeGreaterThanOrEqual(m.left);
    await expect(page.locator("#scroller")).toHaveCSS("overflow-x", "auto");
    await expect(page.locator("#scrolled")).toHaveCSS("overflow", "hidden");
  });

  test("draws Sofix's win and clean sheet directly under Sorare's odds bar, makes room without moving anything into it, and gives it back", async ({ page }) => {
    await openPage(page);
    await settled(page);
    const row = page.locator("#frame .sfx-odds");
    await expect(row).toBeVisible();
    await page.waitForTimeout(250);

    // The same width as Sorare's bar, directly under it, 22px tall.
    const [bar, mine] = [await box(page, "#wdl"), await box(page, "#frame .sfx-odds")];
    expect(Math.abs(mine.left - bar.left)).toBeLessThan(1);
    expect(Math.abs(mine.width - bar.width)).toBeLessThan(1);
    expect(Math.abs(mine.top - (bar.bottom + 4))).toBeLessThan(1);
    expect(mine.height).toBe(22);
    await expect(row).toHaveText(/WIN\s*46%\s*CS\s*33%/);
    await expect(row).toHaveAttribute("aria-label", "Sofix odds: win 46%, clean sheet 33%");
    await expect(row).toHaveCSS("pointer-events", "none");
    await expect(row.locator(".sfx-odds-num--win")).toHaveCSS("color", "rgb(182, 255, 26)");

    // Sorare's kickoff line moved down to make room: still visible, below our row, overlapped by nothing.
    const foot = await box(page, "#foot");
    expect(foot.top).toBeGreaterThanOrEqual(mine.bottom);
    expect(meets(mine, foot)).toBe(false);
    await expect(page.locator("#foot")).toBeVisible();
    await expect(page.locator("#wdl")).toHaveClass(/sfx-room/);

    // A card with no odds bar near it gets no row: the gallery and the hero have none.
    await expect(page.locator("#gallery .sfx-odds, #hero .sfx-odds, #lineup .sfx-odds")).toHaveCount(0);

    // Their kickoff line pinned in the room (making room moves nothing): no row is drawn and their bar is given back.
    await expect(page.locator("#frame2 .sfx-odds")).toHaveCount(0);
    await expect(page.locator("#wdl2")).not.toHaveClass(/sfx-room/);
    expect(meets(await box(page, "#foot2"), mine)).toBe(false);
    const pinned = await Promise.all([box(page, "#foot2"), box(page, "#wdl2")]);
    expect(pinned[0].top).toBeGreaterThan(pinned[1].bottom); // where they put it, untouched

    // Switching off gives everything back: no row, no margin, the kickoff line where it began.
    await page.evaluate(() => (window as unknown as { __sfx: Probe }).__sfx.setOverlay(false));
    await expect(page.locator(".sfx-odds")).toHaveCount(0);
    await expect(page.locator(".sfx-room")).toHaveCount(0);
    const [after, wdl] = [await box(page, "#foot"), await box(page, "#wdl")];
    expect(Math.abs(after.top - (wdl.bottom + 6))).toBeLessThan(1);
  });

  test("puts his start % under Sorare's grade, says whose it is on hover, and rings it when Sofix and Sorare are far apart", async ({ page }) => {
    await openPage(page);
    await settled(page);
    await page.waitForTimeout(250);
    const seen = async (id: string) => {
      await page.locator(`#${id}`).scrollIntoViewIfNeeded();
      return startOf(page, id);
    };

    // On every full card, the app's own where Sorare has none.
    for (const id of ["big", "abroad", "noxg", "linked", "pick-1", "fwd-1"]) await expect(await seen(id)).toHaveCount(1);
    const big = await seen("big");
    await expect(big).toHaveText("88%");
    await expect(big).not.toHaveClass(/sfx-start--doubt|sfx-start--out|sfx-start--apart/);
    // Drawn like Sorare's own start badge (read 3 Nov 2026): black 12 px text on Sorare's colour for the chance (under 49.5% red,
    // under 79.5% yellow, else its cyan), 4 px corners but the bottom right.
    await expect(big).toHaveCSS("background-color", "rgb(0, 243, 235)"); // 88%
    await expect(big).toHaveCSS("color", "rgb(14, 14, 14)");
    await expect(big).toHaveCSS("font-size", "12px");
    await expect(big).toHaveCSS("border-radius", "4px 4px 0px");
    await expect(await seen("linked")).toHaveCSS("background-color", "rgb(0, 243, 235)"); // 90%
    await expect(await seen("noxg")).toHaveCSS("background-color", "rgb(0, 243, 235)"); // 80%
    // An FF doubt never shows Sorare's top colour; a player who will not start is red.
    await expect(await seen("pick-6")).toHaveClass(/sfx-start--out/);
    await expect(await seen("pick-6")).toHaveCSS("background-color", "rgb(255, 90, 90)");
    // Whose number it is is a mark where Sorare has its shirt: FF a filled dot, SO a ring, SF a dashed ring.
    await expect(big.locator(".sfx-src--sorare")).toHaveCount(1);
    await expect((await seen("abroad")).locator(".sfx-src--sofix")).toHaveCount(1);

    // Hover, full card: both numbers. An amber ring when they are 30 points or more apart: Sofix 80% against Sorare 35%; the
    // page's own number counts when Sofix's answer has none (Messi 82% against the page's 30%); FF 31% against SO 40% does not.
    const apart = await seen("noxg");
    await expect(apart).toHaveClass(/sfx-start--apart/);
    await expect(apart).toHaveAttribute("title", "Sofix 80% · Sorare 35%");
    await expect(apart).toHaveCSS("outline", "rgb(255, 174, 43) solid 2px");
    await expect(await seen("abroad")).toHaveClass(/sfx-start--apart/);
    await expect(await seen("abroad")).toHaveAttribute("title", "Sofix 82% · Sorare 30%");
    await expect(await seen("doubtful")).not.toHaveClass(/sfx-start--apart/);
    await expect(await seen("doubtful")).toHaveAttribute("title", "Sofix 31% · Sorare 40%");
    // Hover, small card: one line naming the number's own source.
    await expect(await seen("slot-b")).toHaveAttribute("title", "FF 31%");
    // No start % on a thumbnail, or on a number that no longer holds.
    for (const id of ["thumb", "over", "old"]) await expect(await seen(id)).toHaveCount(0);

    // Under Sorare's own start badge and grade at the card's top right, right-aligned with the card; in their place without them.
    await page.locator("#graded").scrollIntoViewIfNeeded();
    const [chip, grade, card] = [await box(page, "#graded .sfx-start"), await box(page, "#grade"), await art(page, "graded")];
    expect(chip.top).toBeGreaterThanOrEqual(grade.bottom);
    expect(chip.top - grade.bottom).toBeLessThan(6);
    expect(Math.abs(chip.right - (card.right - 6))).toBeLessThan(1);
    const [plain, plainArt] = [await box(page, "#big .sfx-start"), await art(page, "big")];
    expect(Math.abs(plain.top - (plainArt.top + 6))).toBeLessThan(1);
    expect(Math.abs(plain.right - (plainArt.right - 6))).toBeLessThan(1);
    // Text never under 11 px (desktop floor).
    const sizes = await page.evaluate(() => [...document.querySelectorAll(".sfx-start *, .sfx-tile *")].filter((el) => el.textContent?.trim()).map((el) => parseFloat(getComputedStyle(el).fontSize)));
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(11);
  });

  test("finds Sorare's odds bar three rows under a card in a list, and their next line stays clear of the row it adds", async ({ page }) => {
    await openPage(page);
    await settled(page);
    await page.waitForTimeout(250);

    // On Sorare's lists the bar is not right under the picture: a form row and a flags row come first, about 75px down.
    const [card, bar] = [await art(page, "realcard"), await box(page, "#wdl3")];
    expect(bar.top - card.bottom).toBeGreaterThan(60);

    const row = page.locator("#frame3 .sfx-odds");
    await expect(row).toBeVisible();
    const mine = await box(page, "#frame3 .sfx-odds");
    expect(Math.abs(mine.top - (bar.bottom + 4))).toBeLessThan(1);
    await expect(row).toHaveText(/WIN\s*46%\s*CS\s*33%/);
    await expect(page.locator("#wdl3")).toHaveClass(/sfx-room/);

    // Their "best score chosen" line moved down to make room: below our row, and overlapped by nothing.
    const pick = await box(page, "#pick3");
    expect(pick.top).toBeGreaterThanOrEqual(mine.bottom);
    expect(meets(mine, pick)).toBe(false);
    expect(meets(mine, await box(page, "#foot3"))).toBe(false);
  });

  test("draws nothing on a page about a gameweek Sofix has no numbers for, instead of this week's under its name", async ({ page }) => {
    await openPage(page, { query: `?so5Fixture=${OLD_WEEK}` });
    await page.waitForTimeout(900);
    await expect(page.locator(".sfx-tile")).toHaveCount(0);
    const asked = (await probe(page)).sent.filter((message) => message.type === "overlay-numbers");
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every((message) => message.fixture === OLD_WEEK)).toBe(true);
  });

  test("draws this week's numbers on a page whose address names the week being planned", async ({ page }) => {
    await openPage(page, { query: `?so5Fixture=${THIS_WEEK}` });
    await settled(page);
    expect(await text(page, "big")).toEqual(["53", "45", "88%"]);
    expect((await probe(page)).sent.some((message) => message.type === "overlay-numbers" && message.fixture === THIS_WEEK)).toBe(true);
  });

  test("follows the page when Sorare moves to another gameweek without a reload, and back", async ({ page }) => {
    await openPage(page);
    await settled(page);
    await expect(tileOf(page, "big")).toHaveCount(1);

    // Sorare changes the address and redraws the page: its numbers are about another week now, and there are none.
    const move = (query: string) =>
      page.evaluate((next) => {
        history.pushState(null, "", next);
        document.body.append(document.createElement("i")); // the page redrawing, which is what the overlay hears
      }, query);
    await move(`?so5Fixture=${OLD_WEEK}`);
    await expect(page.locator(".sfx-tile")).toHaveCount(0);

    // And back to a page that names none: this week's numbers return.
    await move("?");
    await page.locator("#big").scrollIntoViewIfNeeded();
    await expect.poll(() => text(page, "big"), { timeout: 6000 }).toEqual(["53", "45", "88%"]); // a shimmer first, then the numbers
  });

  test("a player with two games in the gameweek says so to a screen reader (his crests show both games)", async ({ page }) => {
    await openPage(page);
    await page.locator("#double").scrollIntoViewIfNeeded();
    await expect(ribs(page, "double")).toBeVisible();

    // No "×2" on the tile any more (two games show as two crests, step 2); a screen reader is told in words.
    await expect(page.locator("#double .sfx-games")).toHaveCount(0);
    await expect(tileOf(page, "double")).toHaveAttribute("aria-label", /^Sofix: 58 if he starts\. 2 games this week, best score chosen\./);
    expect(await text(page, "double")).toEqual(["58", "70%"]); // what the tile reads is what it was
    // The panel no longer lists the games (plans/overlay-v2.md 1.3): the island over his crests has them.
    await tileOf(page, "double").hover();
    await expect(panel(page)).toBeVisible();
    await expect(panel(page).locator(".sfx-fixtures")).toHaveCount(0);
  });

  test("opens a panel beside the card on hover: starts by default, the other score one press away, and it never writes anything", async ({ page }) => {
    await openPage(page);
    await settled(page);
    await page.waitForTimeout(250);
    await expect(panel(page)).toHaveCount(0);

    // A card far enough from the left edge: the panel opens on its left, pointing at the tile.
    await tileOf(page, "abroad").hover();
    await expect(panel(page)).toBeVisible();
    await expect(panel(page)).toHaveAttribute("data-side", "left");
    await expect(tileOf(page, "abroad")).toHaveAttribute("aria-expanded", "true");
    expect(await panel(page).evaluate((el) => el.parentElement === document.body)).toBe(true); // out of Sorare's clipping boxes
    const [p, t] = [await panel(page).boundingBox(), await tile(page, "abroad")];
    expect(p!.x + p!.width).toBeLessThanOrEqual(t.left);
    expect(p!.x).toBeGreaterThanOrEqual(0);
    await expect(panel(page)).toContainText("SOFIX");
    await expect(panel(page)).toContainText("11 h ago");
    await expect(panel(page).getByRole("button", { name: "Starts" })).toHaveAttribute("aria-pressed", "true");
    await expect(panel(page).getByRole("button", { name: "Comes on" })).toHaveAttribute("aria-pressed", "false");
    await expect(panel(page).locator(".sfx-big strong")).toHaveText("64");
    await expect(panel(page).locator(".sfx-big")).toContainText("if he starts");
    await expect(panel(page).locator(".sfx-chance")).toContainText("82%");
    await expect(panel(page).locator(".sfx-chance")).toContainText("START · SF");
    // Under it his expected decisive actions and the chance of one (none in this answer: dashes, never zeros); the game's numbers,
    // the score chart and its reasons left the panel (plans/overlay-v2.md 1.3).
    await expect(panel(page).locator(".sfx-stat")).toHaveText(["XD—", "DECISIVE—"]);
    await expect(panel(page).locator(".sfx-bars, .sfx-why-row")).toHaveCount(0);
    await expect(panel(page)).not.toContainText("Understat");
    await expect(panel(page)).not.toContainText("From Sorare's odds");

    // The other case: the score if he comes on from the bench (a substitute starts at 35, so it is a score near 40, never his chance
    // times it), and the chance he comes on (0.08 of the 0.18 not starting).
    await panel(page).getByRole("button", { name: "Comes on" }).click();
    await expect(panel(page).getByRole("button", { name: "Comes on" })).toHaveAttribute("aria-pressed", "true");
    await expect(panel(page).locator(".sfx-big strong")).toHaveText("45");
    await expect(panel(page).locator(".sfx-big")).toContainText("if he comes on");
    await expect(panel(page).locator(".sfx-chance")).toContainText("44%");
    await expect(panel(page).locator(".sfx-chance")).toContainText("COMES ON"); // no record of his minutes in this answer: the old number

    // Moving from the tile onto the panel keeps it open; leaving both closes it.
    const inside = await panel(page).boundingBox();
    await page.mouse.move(inside!.x + inside!.width / 2, inside!.y + inside!.height / 2);
    await page.waitForTimeout(450);
    await expect(panel(page)).toBeVisible();
    await page.mouse.move(2, 2);
    await expect(panel(page)).toHaveCount(0);
    await expect(tileOf(page, "abroad")).toHaveAttribute("aria-expanded", "false");

    // On a card near the left edge it opens on the right.
    await tileOf(page, "big").hover();
    await expect(panel(page)).toHaveAttribute("data-side", "right");
    await expect(panel(page).locator(".sfx-chance")).toContainText("START · SO");
    await panel(page).getByRole("button", { name: "Comes on" }).click();
    await expect(panel(page).locator(".sfx-big strong")).toHaveText("42"); // a keeper who comes on scores like a substitute: 0.8 was his chance times it
    await expect(panel(page).locator(".sfx-chance")).toContainText("8%");

    // A midfielder with nothing for its cells says so in a dash.
    await page.mouse.move(2, 2);
    await expect(panel(page)).toHaveCount(0);
    await tileOf(page, "linked").hover();
    await expect(panel(page).locator(".sfx-stat b.sfx-stat--none")).toHaveCount(2);
    // His payload is from before the score if he comes on existed: it still opens, with the old number under its old name.
    await panel(page).getByRole("button", { name: "Comes on" }).click();
    await expect(panel(page).locator(".sfx-big")).toContainText("if benched");
    await expect(panel(page).locator(".sfx-big strong")).toHaveText("15");

    // Nothing it sends is a step that writes to Sorare (chances-seen hands Sorare's own readings to Sofix, read only).
    const kinds = new Set((await probe(page)).sent.map((message) => message.type));
    expect([...kinds].filter((kind) => !["overlay-numbers", "overlay-plan", "overlay-stats", "open-app", "sorare-user", "ff-live", "chances-seen", "need-data"].includes(kind))).toEqual([]);
  });

  test("says what the site says is wrong with him only when it does", async ({ page }) => {
    await openPage(page);
    await settled(page);
    await page.waitForTimeout(250);

    await tileOf(page, "doubtful").hover();
    await expect(panel(page).getByRole("status")).toHaveText("Doubt · since 12 Sep");
    await expect(panel(page).locator(".sfx-chance")).toContainText("START · FF");
    await expect(panel(page).locator(".sfx-src--futbolfantasy").first()).toBeVisible();
    await expect(panel(page).getByRole("button", { name: "SOURCES" })).toHaveCount(0); // who says what is the start chip's hover now

    await page.mouse.move(2, 2);
    await expect(panel(page)).toHaveCount(0);
    await tileOf(page, "abroad").hover(); // nothing wrong with him: no alert
    await expect(panel(page).getByRole("status")).toHaveCount(0);
  });

  test("redraws a tile with what Futbol Fantasy says now, read live, and says so in the panel", async ({ page }) => {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60_000).toISOString();
    await openPage(page, { live: { "22502": { at: twoMinutesAgo, players: { "2802": { p: 0.8, lesion: -1 } } } } });
    await settled(page);
    await page.waitForTimeout(1200);

    // The job had him at 31% and in doubt; the site now has him at 80% and fit.
    const doubtful = tileOf(page, "doubtful");
    await expect(startOf(page, "doubtful").locator("b")).toHaveText("80%");
    await expect(startOf(page, "doubtful")).not.toHaveClass(/sfx-start--doubt/);
    await expect(startOf(page, "doubtful").locator(".sfx-src--futbolfantasy")).toHaveCount(1);
    await expect(doubtful).toHaveAttribute("aria-label", /He starts 80% of the time \(FF\)\./);
    expect(await text(page, "doubtful")).toEqual(["53", "58", "80%"]); // his score if he starts does not move

    await doubtful.hover();
    await expect(panel(page)).toContainText("FF live 2 min ago");
    await expect(panel(page).locator(".sfx-chance")).toContainText("80%");
    await expect(panel(page).getByRole("status")).toHaveCount(0); // no longer a doubt

    // It asked once, for the match the cards on screen are about, and named nothing else.
    const asked = (await probe(page)).sent.filter((message) => message.type === "ff-live") as unknown as { matches: { id: number; url: string }[] }[];
    expect(asked).toHaveLength(1);
    expect(asked[0]!.matches).toEqual([{ id: 22502, url: "https://www.futbolfantasy.com/partidos/22502-real-sociedad-deportivo" }]);
  });

  test("keeps the job's numbers when the live read says nothing", async ({ page }) => {
    await openPage(page);
    await settled(page);
    await page.waitForTimeout(1200);

    expect(await text(page, "doubtful")).toEqual(["53", "58", "31%"]);
    await expect(startOf(page, "doubtful")).toHaveClass(/sfx-start--doubt/);
  });

  test("the panel's Starts side shows his score, start %, xD and decisive chance; Comes on shows his last ten games' minutes", async ({ page }, testInfo) => {
    await openPage(page);
    await settled(page);
    await page.locator("#doubtful").scrollIntoViewIfNeeded();
    await tileOf(page, "doubtful").hover();
    const box = panel(page);
    await expect(box).toBeVisible();
    await expect(box.getByRole("button", { name: "Starts" })).toHaveAttribute("aria-pressed", "true");
    await expect(box.locator(".sfx-big strong")).toHaveText("53");
    await expect(box.locator(".sfx-stats--two")).toContainText(/XD\s*0\.18/);
    await expect(box.locator(".sfx-stats--two")).toContainText(/DECISIVE\s*21%/);
    // Gone from the panel (1.3): the game's numbers (the island has them), the sources, the score chart and its reasons.
    await expect(box.locator(".sfx-shape, .sfx-why, .sfx-sources, .sfx-fixtures")).toHaveCount(0);
    await expect(box.getByText("WIN")).toHaveCount(0);

    await box.getByRole("button", { name: "Comes on" }).click();
    await expect(box.getByRole("button", { name: "Comes on" })).toHaveAttribute("aria-pressed", "true");
    await expect(box.locator(".sfx-big strong")).toHaveText("70%");
    await expect(box.locator(".sfx-big .sfx-num span")).toHaveText("comes on");
    await expect(box.locator(".sfx-was")).toHaveText(/44%\s*SOFIX TODAY/); // what the plans use today, struck through
    await expect(box.locator(".sfx-was b")).toHaveCSS("text-decoration-line", "line-through");
    const bars = box.locator(".sfx-mins i");
    await expect(bars).toHaveCount(10);
    expect(await bars.evaluateAll((all) => all.map((b) => b.className))).toEqual(
      ["unused", "on", "on", "on", "on", "on", "unused", "unused", "on", "on"].map((k) => `sfx-mins--${k}`),
    );
    await expect(box.locator(".sfx-mins")).toHaveAttribute("aria-label", "Minutes in his last 10 games, oldest first: 0, 12, 8, 6, 24, 5, 0, 0, 31, 69");
    // The tallest bar is his 69 minutes, the unused ones a sliver.
    const heights = await bars.evaluateAll((all) => all.map((b) => (b as HTMLElement).offsetHeight)); // layout height: the rise animation scales them
    expect(Math.max(...heights)).toBe(heights[9]);
    expect(heights[0]).toBeLessThan(heights[1]!);
    await expect(box.locator(".sfx-stats--four")).toHaveText(/STARTED\s*0\s*CAME ON\s*7\s*UNUSED\s*3\s*MIN ON\s*22′/);
    // No text under 11 px in the panel.
    const smallest = await box.evaluate((el) => Math.min(...[...el.querySelectorAll("*")].filter((n) => n.childNodes.length && [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent!.trim())).map((n) => parseFloat(getComputedStyle(n).fontSize))));
    expect(smallest).toBeGreaterThanOrEqual(11);
    await page.waitForTimeout(1000); // the bars have risen
    await box.screenshot({ path: testInfo.outputPath("overlay-comes-on.png") });
  });

  test("during his game, a player left on the bench opens the panel on Comes on", async ({ page }) => {
    // Futbol Fantasy's live read of his match says he did not start: the game is on, so the panel opens where it matters now.
    await openPage(page, { live: { "22502": { at: new Date(Date.now() - 120_000).toISOString(), players: { "2802": { p: 0, lesion: -1 } } } } });
    await settled(page);
    await page.locator("#doubtful").scrollIntoViewIfNeeded();
    await expect.poll(() => page.locator("#doubtful .sfx-start").textContent()).toMatch(/0%/);
    await tileOf(page, "doubtful").hover();
    await expect(panel(page).getByRole("button", { name: "Comes on" })).toHaveAttribute("aria-pressed", "true");
    await expect(panel(page).locator(".sfx-big strong")).toHaveText("70%");
  });

  test("opens from the keyboard and closes with Escape, giving the focus back to the tile", async ({ page }) => {
    await openPage(page);
    await settled(page);
    await page.waitForTimeout(250);
    await tileOf(page, "big").focus();
    await expect(panel(page)).toBeVisible();

    await page.keyboard.press("Enter");
    await expect(panel(page).getByRole("button", { name: "Starts" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(panel(page).getByRole("button", { name: "Comes on" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(panel(page).getByRole("button", { name: "Comes on" })).toHaveAttribute("aria-pressed", "true");
    await expect(panel(page).getByRole("button", { name: "Comes on" })).toBeFocused(); // the press keeps the focus

    await page.keyboard.press("Escape");
    await expect(panel(page)).toHaveCount(0);
    await expect(tileOf(page, "big")).toBeFocused();
  });

  test("shows a loading tile until the numbers arrive", async ({ page }) => {
    await openPage(page, { delay: 1500 });
    await page.locator("#big").scrollIntoViewIfNeeded();
    await expect(tileOf(page, "big")).toHaveClass(/sfx-tile--loading/);
    await expect(tileOf(page, "big")).toHaveAttribute("aria-label", "Sofix numbers loading");
    await expect.poll(async () => text(page, "big"), { timeout: 6000 }).toEqual(["53", "45", "88%"]);
    await expect(tileOf(page, "big")).not.toHaveClass(/sfx-tile--loading/);
  });

  test("draws no plan tick, captain star or rank on the tile; the panel still names the plan's lineup", async ({ page }) => {
    // plans/overlay-v2.md 1.2 (the owner, 2 Nov 2026): gone from the tile, the plan tick, captain star, rank badge and "×2".
    await openPage(page);
    await settled(page);
    await page.locator("#pick-1").scrollIntoViewIfNeeded();
    await expect(ribs(page, "pick-4")).toBeVisible();
    await page.waitForTimeout(250);
    await expect(page.locator(".sfx-mark, .sfx-rank, .sfx-games")).toHaveCount(0);
    await expect(tileOf(page, "pick-4")).not.toHaveAttribute("aria-label", /best plan|Number 1/);

    await tileOf(page, "pick-4").hover();
    await expect(panel(page).locator(".sfx-plan")).toContainText("All Star");
    await expect(panel(page).getByLabel("Captain")).toBeVisible();
    await page.mouse.move(2, 2);
    await tileOf(page, "pick-3").hover();
    await expect(panel(page).locator(".sfx-plan")).toHaveCount(0);
  });

  test("greys a number that is about a game that has started, or is more than a day old, and says so", async ({ page }, testInfo) => {
    await openPage(page);
    await settled(page);
    await page.waitForTimeout(250);

    // Grey chips, no start %, no "Started" or "Old" written on the card: the reason is on hover.
    expect(await text(page, "over")).toEqual(["58"]);
    await expect(tileOf(page, "over")).toHaveClass(/sfx-tile--stale/);
    await expect(tileOf(page, "over").locator(".sfx-score")).toHaveCSS("background-color", "rgb(163, 163, 171)");
    await expect(tileOf(page, "over")).toHaveAttribute("title", "His game has started: these numbers were about a game no longer ahead.");
    await expect(tileOf(page, "over")).toHaveAttribute("aria-label", /His game has started: these numbers were about a game no longer ahead\./);

    expect(await text(page, "old")).toEqual(["58"]);
    await expect(tileOf(page, "old")).toHaveClass(/sfx-tile--stale/);
    await expect(tileOf(page, "old")).toHaveAttribute("title", "These numbers are 40 h old.");

    await page.locator("#gallery").screenshot({ path: testInfo.outputPath("overlay-gallery.png") });

    // Numbers made eleven hours ago are still good: no other tile on the page is grey.
    await expect(page.locator(".sfx-tile--stale")).toHaveCount(2);

    await tileOf(page, "old").hover();
    await expect(panel(page)).toContainText("These numbers are 40 h old.");
    await expect(panel(page)).toContainText("1 d ago"); // forty hours is a day and a bit: the label changes unit after 24
  });

  test("goes when the switch goes off and returns when it is back on, with no reload", async ({ page }) => {
    await openPage(page);
    await settled(page);
    await expect(page.locator("[data-sfx]")).not.toHaveCount(0);

    await page.evaluate(() => (window as unknown as { __sfx: Probe }).__sfx.setOverlay(false));
    await expect(page.locator("[data-sfx]")).toHaveCount(0);
    await page.waitForTimeout(400); // nothing comes back by itself
    await expect(page.locator("[data-sfx]")).toHaveCount(0);

    await page.evaluate(() => (window as unknown as { __sfx: Probe }).__sfx.setOverlay(true));
    await page.locator("#big").scrollIntoViewIfNeeded();
    await expect(ribs(page, "big")).toBeVisible();
    expect(await text(page, "big")).toEqual(["53", "45", "88%"]);
    await expect(ribs(page, "big")).toHaveCount(1);
  });

  test("starts switched off when the switch is off", async ({ page }) => {
    await openPage(page, { overlay: false });
    await expect(page.locator("body")).toHaveAttribute("data-answered", "yes");
    await page.waitForTimeout(400);
    await expect(page.locator("[data-sfx]")).toHaveCount(0);
    expect((await probe(page)).sent.filter((message) => message.type === "overlay-numbers")).toEqual([]); // and asks nothing
  });

  for (const [mode, words] of [["auth", "Sign in"], ["unreachable", "Offline"]] as const) {
    test(`says so in a very small tag, and opens the app, when the app answers "${mode}"`, async ({ page }) => {
      await openPage(page, { mode });
      await page.locator("#big").scrollIntoViewIfNeeded();
      const tag = ribs(page, "big").getByRole("button", { name: /Open Sofix/ });
      await expect(tag).toBeVisible();
      await expect(tag).toHaveText(words);
      const small = await tag.boundingBox();
      expect(small!.width).toBeLessThan(72); // no wider than the tile, and only a few pixels tall
      expect(small!.height).toBeLessThanOrEqual(20);
      await expect(ribs(page, "slot-a")).toHaveCount(0); // a small card has no room for it
      await page.locator("#stranger").scrollIntoViewIfNeeded();
      await expect(ribs(page, "stranger")).toHaveCount(1);
      await page.locator("#big").scrollIntoViewIfNeeded();
      await tag.click();
      expect((await probe(page)).opened).toEqual(["/"]);
    });
  }

  const pill = (page: Page) => page.getByRole("button", { name: "Open Sofix" });
  const dock = (page: Page) => page.getByRole("dialog", { name: "Sofix" });
  const dockSteps = async (page: Page) => (await probe(page)).sent.flatMap((message) => (message.type === "dock-step" ? [(message as unknown as { step: string }).step] : []));

  test("a pill in the corner says the gameweek and its lock, and opens a small panel of the plan's lineups", async ({ page }) => {
    await openPage(page);
    await expect(pill(page)).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("[data-sfx-dock]")).toContainText("GW17");
    await expect(page.locator("[data-sfx-dock]")).toContainText(/Locks (\w{3} )?\d\d:\d\d/);
    await expect(page.getByLabel("1 mission swap to make")).toBeVisible(); // the badge: something to do on the Missions tab

    await pill(page).click();
    await expect(dock(page)).toBeVisible();
    expect((await dock(page).boundingBox())!.width).toBeLessThanOrEqual(400); // small, never a full-height sheet
    await expect(dock(page).getByText("any reward")).toBeVisible();
    await expect(dock(page).getByText("50 essence expected")).toBeVisible();
    const lines = dock(page).getByRole("listitem");
    await expect(lines).toHaveCount(2);
    await expect(lines.nth(0)).toContainText("All Star");
    await expect(lines.nth(0)).toContainText("218 of 260 · Sat");
    await expect(lines.nth(0)).toContainText("16%");

    // A lineup opens to its cards, each with the score it is expected to make, and its captain.
    await lines.nth(0).getByRole("button", { name: /All Star/ }).click();
    const cards = dock(page).getByRole("list", { name: /All Star: its cards/ });
    await expect(cards.getByRole("img")).toHaveCount(5);
    await expect(cards.getByRole("img", { name: "Pick 1, captain" })).toBeVisible();
    await expect(cards).toContainText("70");

    // Secondary things wait behind the ⋯ button: the cards used and the other plans, in Sofix.
    await expect(dock(page).getByText("9 of 87")).toBeHidden();
    await dock(page).getByRole("button", { name: /More/ }).click();
    await expect(dock(page).getByText("9 of 87")).toBeVisible();
    await dock(page).getByText("Plans 2 and 3, and the rest, in Sofix").click();
    expect((await probe(page)).opened).toEqual(["/play?gw=17"]);

    await page.keyboard.press("Escape");
    await expect(dock(page)).toBeHidden();
  });

  test("during a week being played it shows the Pro lineups not kicked off yet, with Load from Sorare, and never enters them", async ({ page }) => {
    const starts = new Date(Date.now() + 2 * 3600_000).toISOString();
    const pro = { ...row("European Champions Pro", "ecp", 262, 320, 0.3, 0, PICKS.slice(0, 5).map((p, i) => ({ slug: p.card, pic: p.pic, name: `Pick ${p.n}`, s: p.x, slot: ["GK", "DEF", "MID", "FWD", "EXT"][i]! })), PICKS[0]!.card), pro: true, starts,
      // a plan saved before the job listed who can play in each competition: no swap is guessed, Load from Sorare is named instead
      alarms: [{ out: { slug: PICKS[1]!.card, name: "Pick 2", pic: PICKS[1]!.pic, pStart: 0.44, why: "" }, in: null, none: "unknown" }] };
    await openPage(page, { plan: { ...PLAN, week: 24, fixture: "football-20-23-oct-2026", lock: new Date(Date.now() - 4 * 3600_000).toISOString(), pro: { starts, rank: 1 }, rows: [pro] } });
    await expect(page.locator("[data-sfx-dock]")).toContainText("GW24");
    await expect(page.locator("[data-sfx-dock]")).toContainText(/Locks (\w{3} )?\d\d:\d\d/); // the first Pro kickoff, not the week's lock (passed)
    await pill(page).click();
    await expect(dock(page).getByText("Pro lineup still open")).toBeVisible();
    await expect(dock(page).getByRole("listitem")).toHaveCount(1);
    await expect(dock(page).getByRole("button", { name: /^Enter/ })).toHaveCount(0); // Pro is entered on Sorare's Pro board

    await dock(page).getByRole("button", { name: /^Load from Sorare/ }).last().click();
    await expect(dock(page).getByRole("status")).toContainText("2 elevens out: 4 of your players start, 1 on the bench");
    const sent = (await probe(page)).sent.filter((message) => message.type === "pro-rebuild");
    expect(sent).toEqual([{ type: "pro-rebuild", week: "football-20-23-oct-2026", plan: 1 }]);
    expect(await dockSteps(page)).toEqual([]); // nothing is run through Sorare
    await dock(page).getByRole("button", { name: /European Champions Pro/ }).click();
    await expect(dock(page).getByText("Once the teams are out, about an hour before kickoff, Load from Sorare rebuilds this lineup on who starts.")).toBeVisible();
    await expect(dock(page).getByRole("button", { name: /^Swap/ })).toHaveCount(0);
  });

  test("enters the plan from Sorare's own page in three presses, Check, Draft and Enter, one step each and never chained", async ({ page }) => {
    await openPage(page);
    await pill(page).click();

    await dock(page).getByRole("button", { name: "Enter all 2" }).click();
    await expect(dock(page).getByRole("button", { name: "Save 2 drafts" })).toBeVisible();
    expect(await dockSteps(page)).toEqual(["entered", "check", "entered", "check"]); // Sorare's verdict only: nothing is saved yet
    await expect(dock(page).getByRole("listitem").nth(0)).toContainText("Checked");

    await dock(page).getByRole("button", { name: "Save 2 drafts" }).click();
    await expect(dock(page).getByRole("button", { name: "Enter 2 now" })).toBeVisible();
    expect((await dockSteps(page)).slice(4)).toEqual(["draft", "draft"]);
    await expect(dock(page).getByRole("listitem").nth(0)).toContainText("Draft saved");

    await dock(page).getByRole("button", { name: "Enter 2 now" }).click();
    await expect(dock(page).getByRole("button", { name: "All entered" })).toBeVisible();
    expect((await dockSteps(page)).slice(6)).toEqual(["enter", "enter"]);
    await expect(dock(page).getByRole("listitem").nth(0)).toContainText("Entered");
    const draft = (await probe(page)).sent.find((message) => (message as unknown as { step?: string }).step === "draft") as unknown as { name: string; appearances: unknown[] };
    expect(draft.name).toBe("Sofix · plan 1 · GW17");
    expect(draft.appearances).toHaveLength(5);
  });

  test("Guide me rings the next card to pick on Sorare's page, and moves on when you press it", async ({ page }) => {
    await openPage(page);
    await settled(page);
    await pill(page).click();
    await dock(page).getByRole("listitem").nth(0).getByRole("button", { name: /All Star/ }).click();
    await dock(page).getByRole("button", { name: "Guide me" }).click();

    const guide = page.locator("[data-sfx-dock]").getByRole("status");
    await expect(guide).toContainText("Pick Pick 1 · captain");
    await expect(guide).toContainText("All Star · 1 of 5");
    const ring = (id: string) => page.locator(`#${id} img`);
    await ring("pick-1").scrollIntoViewIfNeeded();
    await expect(ring("pick-1")).toHaveAttribute("data-sfx-guide", "pick");
    await expect(ring("pick-2")).not.toHaveAttribute("data-sfx-guide", /./);

    const at = (await ring("pick-1").boundingBox())!;
    await page.mouse.click(at.x + at.width / 2, at.y + at.height * 0.6);
    await expect(guide).toContainText("Pick Pick 2 · DEF");
    await expect(ring("pick-2")).toHaveAttribute("data-sfx-guide", "pick");
    await expect(ring("pick-1")).not.toHaveAttribute("data-sfx-guide", /./);

    await guide.getByRole("button", { name: "Stop guiding" }).click();
    await expect(guide).toHaveCount(0);
    await expect(page.locator("[data-sfx-guide]")).toHaveCount(0);
  });

  test("the alarm turns the pill red when a starter is unlikely to start, and Swap guides the change on Sorare's page", async ({ page }) => {
    const alarm = { out: { slug: PICKS[1]!.card, name: "Pick 2", pic: PICKS[1]!.pic, pStart: 0.22, why: "" }, in: { slug: "gavi", name: "Gavi", pic: picture(41), pStart: 0.9, s: 52 } };
    await openPage(page, { plan: { ...PLAN, rows: [{ ...PLAN.rows[0]!, alarms: [alarm] }, PLAN.rows[1]!] } });
    await expect(page.getByLabel("1 starter unlikely to start")).toBeVisible();
    await pill(page).click();
    const first = dock(page).getByRole("listitem").nth(0);
    await expect(first).toContainText("1 at risk");
    await first.getByRole("button", { name: /All Star/ }).click();
    await expect(dock(page).getByText("22%")).toBeVisible();
    await dock(page).getByRole("button", { name: "Swap Pick 2 for Gavi in All Star" }).click();
    const guide = page.locator("[data-sfx-dock]").getByRole("status");
    await expect(guide).toContainText("Take out Pick 2");
    await expect(guide).toContainText("All Star · 1 of 2");
  });

  test("after the lock the pill shows what your entered lineups have scored, read once and again every two minutes at most", async ({ page }) => {
    const fixture = { so5: { so5Fixture: { mySo5Lineups: [
      { id: "L1", draft: false, so5Leaderboard: { slug: "all-star" }, so5Rankings: [{ score: 190.6, so5Leaderboard: { slug: "all-star" } }] },
      { id: "L2", draft: false, so5Leaderboard: { slug: "limited" }, so5Rankings: [{ score: 310, so5Leaderboard: { slug: "limited" } }] },
    ] } } };
    await openPage(page, {
      plan: { ...PLAN, fixture: THIS_WEEK, lock: new Date(Date.now() - 3600_000).toISOString(), rows: [{ ...PLAN.rows[0]!, alarms: [{ out: { slug: "x", name: "X", pic: "", pStart: 0.1, why: "" }, in: null }] }, PLAN.rows[1]!] },
      steps: { ...SORARE_STEPS, "week-entered": { state: "ok", data: fixture } },
    });
    await expect(page.getByLabel("501 points so far in 2 entered lineups")).toBeVisible();
    await expect(page.getByLabel(/starter.* unlikely to start/)).toHaveCount(0); // nothing can be changed after the lock
    await pill(page).click();
    await expect(dock(page).getByText("points so far")).toBeVisible();
    const lines = dock(page).getByRole("listitem");
    await expect(lines.nth(0)).toContainText("191 of 260 · so far");
    await expect(lines.nth(0)).toContainText("70 to go");
    await expect(lines.nth(1)).toContainText("Reached");
    expect((await dockSteps(page)).filter((step) => step === "week-entered")).toHaveLength(1);
  });

  test("on a lineup page the pill adds up the cards in the slots and compares them with the plan once the lineup is whole", async ({ page }) => {
    await openPage(page);
    await expect(pill(page)).toBeVisible();
    // Sorare's lineup page, as it is: a slot is a button "Select <player>" (a position's name while empty) with Sofix's tile inside.
    await page.evaluate(() => {
      history.pushState({}, "", "/football/play/classic/compose/all-star");
      const slot = (label: string, score: string) => {
        const button = document.createElement("button");
        button.setAttribute("aria-label", `Select ${label}`);
        button.style.cssText = "position:fixed;left:20px;top:20px;width:120px;height:160px";
        if (score) { const tile = document.createElement("b"); tile.className = "sfx-score"; tile.textContent = score; button.append(tile); }
        button.dataset.slot = label;
        document.body.append(button);
      };
      slot("Pick One", "60"); slot("Pick Two", "55"); slot("DEF", ""); // two cards in, one empty slot
    });
    await expect(page.getByLabel(/^115 points expected from 2 cards, captain not counted; Sofix's plan has /)).toBeVisible();
    await expect(page.locator("[data-sfx-dock]")).toContainText("2 of 5"); // the plan's lineup has five starters: no comparison yet
    await page.evaluate(() => {
      for (const [label, score] of [["Pick Three", "50"], ["Pick Four", "50"], ["Pick Five", "50"]] as const) {
        const button = document.createElement("button");
        button.setAttribute("aria-label", `Select ${label}`);
        button.style.cssText = "position:fixed;left:20px;top:200px;width:120px;height:160px";
        button.innerHTML = `<b class="sfx-score">${score}</b>`;
        document.body.append(button);
      }
    });
    await expect(page.locator("[data-sfx-dock]")).toContainText("vs plan");
    await page.evaluate(() => history.pushState({}, "", "/football/play"));
    await expect(page.getByLabel(/points expected from/)).toHaveCount(0); // gone with the lineup page
  });

  test("on Sorare's market, a Limited card says what a point of his costs, green in the cheapest third of similar players, red in the dearest", async ({ page }, testInfo) => {
    await openPage(page, { url: "https://sorare.com/football/market" });
    await settled(page);
    const price = (id: string) => page.locator(`#${id} .sfx-price`);
    await page.locator("#pick-1").scrollIntoViewIfNeeded();
    await expect(price("pick-1")).toHaveText("€0.14/pt");
    await expect(price("pick-1")).toHaveAttribute("data-third", "cheap");
    await expect(price("pick-1")).toHaveAttribute("title", "€9.80 Limited price for an xScore of 70: in the cheapest third of 120 DEFs with a Sorare average within 5 of his");
    await expect(price("pick-2")).toHaveText("€1.14/pt");
    await expect(price("pick-2")).toHaveAttribute("data-third", "dear");
    await expect(price("pick-3")).toHaveText("€0.50/pt");
    await expect(price("pick-3")).not.toHaveAttribute("data-third", /./); // too few like him: plain
    const [green, red] = [await price("pick-1").evaluate((el) => getComputedStyle(el).color), await price("pick-2").evaluate((el) => getComputedStyle(el).color)];
    expect(green).not.toBe(red);
    expect(await price("pick-1").evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(11);
    // At the card's right, its bottom at two thirds of the card: Sorare writes his name across the bottom.
    const [card, pill] = [await box(page, "#pick-1 img"), await box(page, "#pick-1 .sfx-price")];
    expect(Math.abs(card.right - 6 - pill.right)).toBeLessThan(1.5);
    expect(Math.abs(pill.bottom - (card.top + (card.bottom - card.top) * 0.66))).toBeLessThan(1.5);
    await expect(page.locator("#abroad .sfx-price")).toHaveCount(0); // his rare card: the price is a Limited one
    await page.locator("#pick-1").screenshot({ path: testInfo.outputPath("overlay-price.png") });
  });

  test("away from the market and your gallery, no card says a price", async ({ page }) => {
    await openPage(page);
    await settled(page);
    await page.locator("#pick-1").scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await expect(page.locator("#pick-1 .sfx-tile, #pick-1 .sfx-ribs").first()).toBeVisible();
    await expect(page.locator(".sfx-price")).toHaveCount(0);
  });

  test("on Sorare's builder, a faint purple C marks the card on the pitch Sofix would captain, until Sorare has him as captain", async ({ page }, testInfo) => {
    await openPage(page, { url: "https://sorare.com/football/play/classic/compose/all-star" });
    await settled(page);
    await expect(page.locator(".sfx-captain")).toHaveCount(0); // no card on the pitch yet
    // Sorare's pitch, as drawn on 3 Nov 2026: a 32 px round "C" titled "Captain" centred on each placed card's top-left corner,
    // outside the card's own box; the captain's turns pink with the class "active". Pick 1 (70) beats Pick 2 (65) and Pick 3 (60).
    const mark = (ids: string[], captain: string | null) =>
      page.evaluate(([list, cap]) => {
        document.querySelectorAll("[data-test-mark]").forEach((el) => el.remove());
        for (const id of list as string[]) {
          const r = document.getElementById(id)!.getBoundingClientRect();
          const c = document.createElement("div");
          c.title = "Captain";
          c.textContent = "C";
          c.dataset.testMark = "";
          if (id === cap) c.className = "active";
          c.style.cssText = `position:absolute;left:${r.left + scrollX - 16}px;top:${r.top + scrollY - 16}px;width:32px;height:32px;border-radius:50%;background:${id === cap ? "#ff0974" : "#fff"}`;
          document.body.append(c);
        }
      }, [ids, captain] as const);
    await page.locator("#pick-1").scrollIntoViewIfNeeded();
    await mark(["pick-1", "pick-2", "pick-3"], null);
    const c = page.locator(".sfx-captain");
    await expect(c).toHaveCount(1);
    await expect(c).toHaveText("C");
    await expect(c).toHaveAttribute("title", /^Sofix's captain: the best expected score on the pitch, 70 with his chance of starting counted$/);
    const [card, ours] = [await box(page, "#pick-1 img"), await box(page, ".sfx-captain")];
    expect(Math.abs(ours.right - card.right)).toBeLessThan(10); // at the card's bottom right
    expect(Math.abs(ours.bottom - card.bottom)).toBeLessThan(10);
    expect(ours.width).toBeGreaterThanOrEqual(14);
    expect(await c.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(11);
    await page.screenshot({ path: testInfo.outputPath("overlay-captain.png") });
    await mark(["pick-1", "pick-2", "pick-3"], "pick-2"); // another captain: the advice stays on Pick 1
    await expect(c).toHaveCount(1);
    expect(Math.abs((await box(page, ".sfx-captain")).right - card.right)).toBeLessThan(10);
    await mark(["pick-1", "pick-2", "pick-3"], "pick-1"); // Sorare has him as captain: nothing more to say
    await expect(page.locator(".sfx-captain")).toHaveCount(0);
    await mark(["pick-2", "pick-3"], null); // he left the pitch: the next best
    await expect(page.locator(".sfx-captain")).toHaveCount(1);
    expect(Math.abs((await box(page, ".sfx-captain")).right - (await box(page, "#pick-2 img")).right)).toBeLessThan(10);
  });

  test("on Sorare's builder, Sofix's gauge sits under Sorare's bonuses and fills as cards go on the pitch; hover opens the team panel", async ({ page }, testInfo) => {
    const team = { size: 5, captainBonus: 0.5, clubBonus: null, averageBonus: null, tiers: [{ need: 150, label: "500 XP" }, { need: 300, label: "$5" }] };
    await openPage(page, { url: BUILDER_URL, team });
    await settled(page);
    // Sorare's bonus column, as drawn on 4 Nov 2026: an absolute box at the pitch's top right, right-aligned rows over 36 px icons.
    await page.evaluate(() => {
      const col = document.createElement("div");
      col.className = "absolute top-6 right-0";
      col.style.cssText = "position:fixed;top:64px;left:892px;width:110px;height:152px;display:flex;flex-direction:column;align-items:flex-end;color:#fff";
      col.innerHTML = "<div><span>+6%</span><div>Lineup Bonus</div></div><div>Multi-Club +2%</div><div>Cap 260 +4%</div>";
      document.body.append(col);
    });
    const mark = (ids: string[], captain: string | null) =>
      page.evaluate(([list, cap]) => {
        document.querySelectorAll("[data-test-mark]").forEach((el) => el.remove());
        for (const id of list as string[]) {
          const r = document.getElementById(id)!.getBoundingClientRect();
          const c = document.createElement("div");
          c.title = "Captain";
          c.dataset.testMark = "";
          if (id === cap) c.className = "active";
          c.style.cssText = `position:absolute;left:${r.left + scrollX - 16}px;top:${r.top + scrollY - 16}px;width:32px;height:32px`;
          document.body.append(c);
        }
      }, [ids, captain] as const);
    await page.locator("#pick-1").scrollIntoViewIfNeeded();
    await mark([], null);
    await page.mouse.move(5, 5);
    const gauge = page.locator(".sfx-team");
    const total = () => gauge.locator(".sfx-team-gauge b").innerText();
    const filled = () => gauge.locator(".sfx-team-gauge .sfx-ring-fill").evaluate((el) => parseFloat(el.getAttribute("stroke-dasharray")!));
    await expect(gauge).toBeVisible();
    await expect(gauge.locator(".sfx-team-count")).toHaveText("0 of 5");
    await expect(gauge.locator(".sfx-team-gauge b")).toHaveText("—");
    // Under Sorare's last row, flush with its right edge.
    const at = await box(page, ".sfx-team");
    expect(Math.abs(at.right - 1002)).toBeLessThan(2);
    expect(Math.abs(at.top - (64 + 152 + 16))).toBeLessThan(2);

    // Before the lineup is full Sorare draws no captain marks: a placed card is the art inside its slot button, "Select <player>".
    await page.evaluate(() => {
      const card = document.getElementById("pick-1")!;
      const slot = document.createElement("button");
      slot.setAttribute("aria-label", "Select Pick 1");
      slot.style.cssText = "all:unset;display:block";
      card.replaceWith(slot);
      slot.append(card);
    });
    await expect(gauge.locator(".sfx-team-count")).toHaveText("1 of 5");
    const one = Number(await total());
    expect(Math.abs(one - 70)).toBeLessThanOrEqual(3); // his 70: 0.9 to play x 77.8 if he plays
    const oneFill = await filled();

    await mark(["pick-1", "pick-2", "pick-3"], null);
    await expect(gauge.locator(".sfx-team-count")).toHaveText("3 of 5");
    const three = Number(await total());
    expect(Math.abs(three - 195)).toBeLessThanOrEqual(4); // 70 + 65 + 60
    expect(await filled()).toBeGreaterThan(oneFill * 2.5);

    // Sorare makes Pick 1 captain: his half again is counted.
    await mark(["pick-1", "pick-2", "pick-3"], "pick-1");
    await expect.poll(async () => Number(await total())).toBeGreaterThan(three + 25);

    await gauge.hover();
    const panel = page.locator(".sfx-team-panel");
    await expect(panel).toBeVisible();
    await expect(panel.locator(".sfx-team-total")).toHaveText(await total());
    await expect(panel.locator(".sfx-team-range")).toHaveText(/^\d+–\d+$/);
    // The likeliest level in the centre, the one under it on the left, the one above on the right.
    await expect(panel.locator(".sfx-team-ring--at .sfx-team-prize")).toHaveText("500 XP");
    await expect(panel.locator(".sfx-team-ring--below .sfx-team-prize")).toHaveText("No reward");
    await expect(panel.locator(".sfx-team-ring--above .sfx-team-prize")).toHaveText("$5");
    await expect(panel.locator(".sfx-team-ring--above .sfx-team-need")).toHaveText("at 300");
    // The team's stats: no expected decisive actions in these answers (a dash), their sides' win, the defenders' clean sheet, the difficulty.
    await expect(panel.locator(".sfx-team-stat")).toHaveText(["XD—", "WIN50%", "CS30%", "FDR44"]);
    for (const size of await panel.locator("span, b").evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)))) expect(size).toBeGreaterThanOrEqual(11);
    await page.screenshot({ path: testInfo.outputPath("overlay-team-gauge.png") });

    // Off a builder there is no gauge.
    await page.evaluate(() => history.pushState({}, "", "/football/my-club/cards"));
    await mark([], null);
    await expect(gauge).toHaveCount(0);
  });

  test("on Sorare's builder list: Sofix sorts and filters the cards, outlines its lineup and compares two, and gives the list back", async ({ page }, testInfo) => {
    await openPage(page, { url: BUILDER_URL, team: { size: 5, comp: "All Star", captainBonus: 0.5, clubBonus: null, averageBonus: null, tiers: [] } });
    await settled(page);
    // Sorare lists Pick 1 (70) last today: Sofix's xScore sort puts him first without moving Sorare's nodes.
    await page.evaluate(() => {
      const list = document.getElementById("picks")!;
      list.style.display = "flex";
      list.append(document.getElementById("pick-1")!);
      (window as unknown as { __sorarePicks: number }).__sorarePicks = 0;
      list.addEventListener("click", () => (window as unknown as { __sorarePicks: number }).__sorarePicks++); // Sorare's own pick
    });
    await page.locator("#pick-1").scrollIntoViewIfNeeded();
    const bar = page.locator("#pickhead .sfx-listbar");
    await expect(bar).toBeVisible();
    await expect(page.locator(".sfx-listbar")).toHaveCount(1); // one bar for the page's lists
    await expect(bar.locator(".sfx-lb-count")).toHaveText("9 of 9");
    const left = async (id: string) => (await box(page, `#${id}`)).left;
    await expect.poll(() => page.locator("#pick-1").evaluate((el) => el.style.order)).toBe("0");
    expect(await left("pick-1")).toBeLessThan(await left("pick-2"));
    expect(await page.evaluate(() => document.getElementById("picks")!.lastElementChild!.id)).toBe("pick-1"); // Sorare's DOM untouched
    await bar.getByRole("combobox").selectOption("sorare");
    await expect.poll(async () => (await left("pick-1")) > (await left("pick-6"))).toBe(true);
    await bar.getByRole("combobox").selectOption("xscore");

    // + Filter: xScore at 60 leaves Picks 1-3; the others fade. The bar lives inside Sorare's page: its clicks never reach Sorare's own
    // listeners (4 Nov 2026, a menu click picked the card under it).
    await page.evaluate(() => document.addEventListener("click", () => ((window as unknown as { __pageClicks: number }).__pageClicks = ((window as unknown as { __pageClicks?: number }).__pageClicks ?? 0) + 1)));
    await bar.getByRole("button", { name: "+ Filter" }).click();
    const menu = page.getByRole("menu", { name: "Add a filter" });
    await expect(menu).toBeVisible();
    // On top of the cards it opens over (inside Sorare's row it opened under them, 4 Nov 2026).
    expect(await menu.getByRole("menuitem").first().evaluate((el) => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)); })).toBe(true);
    expect((await new AxeBuilder({ page }).include(".sfx-listbar").include(".sfx-lb-menu").analyze()).violations).toEqual([]);
    await menu.getByRole("menuitem", { name: "xScore" }).click();
    await expect(menu).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __pageClicks?: number }).__pageClicks ?? 0)).toBe(0);
    const slider = bar.getByRole("slider", { name: "xScore threshold" });
    await slider.fill("60");
    await expect(bar.locator(".sfx-lb-chip-text")).toHaveText("xScore ≥ 60");
    await expect(bar.locator(".sfx-lb-count")).toHaveText("3 of 9");
    await expect(page.locator("#pick-4")).toHaveClass(/sfx-faded/);
    await expect(page.locator("#fwd-1")).toHaveClass(/sfx-faded/);
    await expect(page.locator("#pick-3")).not.toHaveClass(/sfx-faded/);

    // The Sofix lineup switch: a faint outline on the cards the plan uses on this competition, nothing else.
    await bar.getByRole("button", { name: "Sofix lineup" }).click();
    await expect(page.locator(".sfx-inplan")).toHaveCount(2);
    await expect(page.locator("#pick-2")).toHaveClass(/sfx-inplan/);
    await expect(page.locator("#pick-4")).toHaveClass(/sfx-inplan/);
    await page.screenshot({ path: testInfo.outputPath("overlay-list-bar.png") });

    // Kept in this browser: a reload brings the same filter back.
    await page.reload();
    await page.addStyleTag({ path: path.join(EXTENSION, "overlay.css") });
    await page.locator("#pick-1").scrollIntoViewIfNeeded();
    await expect(page.locator("#pickhead .sfx-lb-chip-text")).toHaveText("xScore ≥ 60");
    await expect(page.locator("#pickhead .sfx-lb-count")).toHaveText("3 of 9");
    await page.locator("#pickhead").getByRole("button", { name: "Remove the xScore filter" }).click();
    await expect(page.locator("#pickhead .sfx-lb-count")).toHaveText("9 of 9");
    await expect(page.locator(".sfx-faded")).toHaveCount(0);

    // Compare: Shift+click two cards (Sorare's own pick does not happen), the better value in each row in green; Escape closes.
    await page.evaluate(() => {
      (window as unknown as { __sorarePicks: number }).__sorarePicks = 0;
      document.getElementById("picks")!.addEventListener("click", () => (window as unknown as { __sorarePicks: number }).__sorarePicks++);
    });
    await page.locator("#pick-1 img").click({ modifiers: ["Shift"] });
    await expect(page.locator("#pick-1")).toHaveClass(/sfx-comparing/);
    await page.locator("#pick-3 img").click({ modifiers: ["Shift"] });
    const panel = page.getByRole("dialog", { name: "Pick 1 against Pick 3" });
    await expect(panel).toBeVisible();
    await expect(panel.locator(".sfx-cmp-row").first()).toContainText("70");
    await expect(panel.locator(".sfx-cmp-row").first().locator(".is-better")).toHaveText("70");
    await expect(panel.locator(".sfx-cmp-label")).toHaveText(["xScore", "FDR", "Win %", "Clean sheet %", "xG against", "xD"]);
    expect(await page.evaluate(() => (window as unknown as { __sorarePicks: number }).__sorarePicks)).toBe(0);
    for (const size of await panel.locator("b, span").evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)))) expect(size).toBeGreaterThanOrEqual(11);
    expect((await new AxeBuilder({ page }).include(".sfx-compare").analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("overlay-compare.png") });
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(page.locator(".sfx-comparing")).toHaveCount(0);
    await page.locator("#pick-2 img").click();
    expect(await page.evaluate(() => (window as unknown as { __sorarePicks: number }).__sorarePicks)).toBe(1); // a plain click still picks

    // The overlay off: Sorare's list as it was.
    await page.evaluate(() => (window as unknown as { __sfx: { setOverlay: (v: boolean) => void } }).__sfx.setOverlay(false));
    await expect(page.locator(".sfx-listbar")).toHaveCount(0);
    expect(await page.evaluate(() => [...document.querySelectorAll("#picks > *, #picks2 > *")].filter((el) => (el as HTMLElement).style.order || /sfx-/.test(el.className)).length)).toBe(0);
  });

  test("the Missions tab shows today's swap, and Swap guides it on Sorare's missions page", async ({ page }) => {
    await page.route("https://sorare.com/football/missions/play/limited", (route) => route.fulfill({ contentType: "text/html", body: FIXTURE }));
    await openPage(page);
    await pill(page).click();
    await dock(page).getByRole("tab", { name: "Missions" }).click();
    await expect(dock(page).getByText("swap to make")).toBeVisible();
    await expect(dock(page).getByRole("listitem").nth(0)).toContainText("Decisive Picker");
    await expect(dock(page).getByRole("listitem").nth(0)).toContainText("29%");
    await expect(dock(page).getByRole("listitem").nth(0)).toContainText("39%");
    await expect(dock(page).getByRole("listitem").nth(1)).toContainText("As Sofix");

    await dock(page).getByRole("button", { name: "Swap Fwd 1 for Fwd 2 on Sorare" }).click();
    await page.waitForURL("**/football/missions/play/limited");
    const guide = page.locator("[data-sfx-dock]").getByRole("status");
    await expect(guide).toContainText("Take out Fwd 1"); // the guide survives the page change
    await expect(guide).toContainText("Decisive Picker · 1 of 2");
  });

  test("shows the gameweek the page's address names, not the one being planned (3 Oct: a GW21 page showed GW20)", async ({ page }) => {
    await openPage(page, { query: `?so5Fixture=${THIS_WEEK}` });
    await expect(page.locator("[data-sfx-dock]")).toContainText("GW17");
    const asked = (await probe(page)).sent.filter((message) => message.type === "overlay-plan");
    expect(asked[0]).toEqual({ type: "overlay-plan", missions: true, fixture: THIS_WEEK });
  });

  test("says Sofix holds nothing on a gameweek it has no plan for, and asks again when the page moves to another week", async ({ page }) => {
    await openPage(page, { query: `?so5Fixture=${OLD_WEEK}` });
    await pill(page).click();
    await expect(dock(page).getByText("Sofix holds nothing on this gameweek.")).toBeVisible();
    // Sorare moves to another gameweek without a reload: the dock follows it.
    await page.evaluate((week) => history.pushState({}, "", `${location.pathname}?so5Fixture=${week}`), THIS_WEEK);
    await page.evaluate(() => window.dispatchEvent(new PopStateEvent("popstate")));
    await expect(dock(page).getByText("any reward")).toBeVisible();
    const asked = (await probe(page)).sent.filter((message) => message.type === "overlay-plan");
    expect([...new Set(asked.map((message) => (message as { fixture?: string }).fixture))]).toEqual([OLD_WEEK, THIS_WEEK]);
  });

  test("says so when the app cannot be reached, and still opens it", async ({ page }) => {
    await openPage(page, { mode: "unreachable" });
    await pill(page).click();
    await expect(dock(page).getByText("Sofix is not reachable right now.")).toBeVisible();
    await dock(page).getByRole("button", { name: "Open Sofix" }).click();
    expect((await probe(page)).opened).toEqual(["/"]);
  });

  test("the dock goes with the switch, and stays off a phone-sized page", async ({ page }) => {
    await openPage(page);
    await expect(pill(page)).toBeVisible();

    await page.evaluate(() => (window as unknown as { __sfx: Probe }).__sfx.setOverlay(false));
    await expect(page.locator("[data-sfx-dock]")).toHaveCount(0);
    await page.evaluate(() => (window as unknown as { __sfx: Probe }).__sfx.setOverlay(true));
    await expect(pill(page)).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(pill(page)).toBeHidden();
  });

  test("on your gallery, says under Sorare's Bought line what each card is worth now, and totals the bought cards", async ({ page }, testInfo) => {
    await openPage(page, { url: MY_GALLERY, html: GALLERY });
    const line = (id: string) => page.locator(`#${id} .sfx-worth`);
    await expect(line("g-simon")).toHaveText("now €3.40▲13%");
    await expect(line("g-cubarsi")).toHaveText("now €2.10not bought");
    await expect(line("g-havertz")).toHaveCount(0); // a card Sorare does not value shows nothing
    await expect(line("g-messi")).toHaveText("now €4.00▼20%"); // known only by his name: the card's own link says which card
    // Right under Sorare's own row, and the hover says it is Sorare's value at Sofix's refresh, with what was paid.
    await expect(page.locator("#g-simon .ago + .sfx-worth")).toHaveCount(1);
    await expect(line("g-simon")).toHaveAttribute("title", /^Sorare's value at Sofix's refresh of .+; you paid €3\.02$/);
    // The bought cards' total sits in the toolbar row, between Sorare's chips and its sort, as the Prices page says it.
    const box = page.locator("#toolbar > .sfx-worthbox");
    await expect(box).toHaveText("BOUGHT, NOW€312.00paid €268.00 for 30 cards▲ €44.00 · +16%");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("overlay-gallery.png") });
  });

  test("on someone else's gallery, draws no prices at all", async ({ page }) => {
    await openPage(page, { url: "https://sorare.com/football/my-club/gabssg/cards/limited", html: GALLERY });
    await expect(page.locator("body")).toHaveAttribute("data-answered", "yes");
    await page.waitForTimeout(600);
    await expect(page.locator(".sfx-worth, .sfx-worthbox")).toHaveCount(0);
  });

  test("on a LaLiga player's page, says above his name his score if he starts, his start % by source, his next five and the verdict", async ({ page }, testInfo) => {
    await openPage(page, { url: "https://sorare.com/football/players/pedri/fixtures", html: PLAYER });
    const strip = page.getByRole("group", { name: "Sofix on Pedri" });
    await expect(strip).toBeVisible();
    await expect(strip.locator(".sfx-strip-score")).toHaveText("63");
    await expect(strip.locator(".sfx-strip-score")).toHaveCSS("--sfx-c", /./);
    await expect(strip.locator(".sfx-strip-starts")).toHaveText("85% to start");
    await expect(strip.locator(".sfx-strip-src")).toHaveText(["FF 85%", "SO 80%", "SF –"]);
    await expect(strip.locator(".sfx-strip-verdict")).toHaveText("Upgrade +6 on your MID");
    // The next five in the board's colours, each with its label (never a bucket number) and the opponent's crest where there is one.
    const games = strip.locator(".sfx-strip-game");
    await expect(games).toHaveCount(5);
    await expect(games.first()).toHaveText("GETvVery favourite");
    await expect(games.nth(1)).toHaveText("BET@Favourite");
    await expect(games.first()).toHaveAttribute("title", /^Getafe, at home · Very favourite · /);
    await expect(games.first().locator("img")).toHaveAttribute("src", crest(82));
    await expect(games.nth(4).locator("img")).toHaveCount(0); // no crest: the code alone
    // In Sorare's empty band above his name: under the breadcrumb row, never over the name or the Follow button.
    const [s, h1, crumbs] = [await box(page, ".sfx-strip"), await box(page, "h1"), await box(page, ".crumbs")];
    expect(s.bottom).toBeLessThanOrEqual(h1.top);
    expect(s.top).toBeGreaterThanOrEqual(crumbs.bottom);
    expect(Math.abs(s.left - h1.left)).toBeLessThan(1);
    expect((await new AxeBuilder({ page }).include(".sfx-strip").analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("overlay-player.png") });
  });

  test("on your own player's page, says he is yours and the lineups he is in", async ({ page }) => {
    await openPage(page, { url: "https://sorare.com/football/players/unai-simon", html: PLAYER.replaceAll("Pedri", "Unai Simón") });
    await expect(page.locator(".sfx-strip-verdict")).toHaveText("Yours · in Arena · Limited");
  });

  test("on a player Sofix holds nothing on (outside LaLiga), draws nothing", async ({ page }) => {
    await openPage(page, { url: "https://sorare.com/football/players/jan-oblak", html: PLAYER });
    await expect.poll(async () => (await probe(page)).sent.some((m) => (m as { type: string }).type === "overlay-profile")).toBe(true);
    await page.waitForTimeout(300);
    await expect(page.locator(".sfx-strip")).toHaveCount(0);
  });

  test("is accessible, on desktop and on a phone", async ({ page }, testInfo) => {
    await openPage(page);
    await settled(page);
    await page.waitForTimeout(300);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    // With the hover panel open, and its two scores switched, still nothing to fix.
    await tileOf(page, "abroad").hover();
    await expect(panel(page)).toBeVisible();
    await panel(page).getByRole("button", { name: "Comes on" }).click();
    await page.waitForTimeout(600); // past the pop-in: contrast is measured on what is settled
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("overlay-panel.png") });
    await page.mouse.move(2, 2);
    await expect(panel(page)).toHaveCount(0);

    await page.getByRole("button", { name: "Open Sofix" }).click();
    await page.getByRole("dialog", { name: "Sofix" }).getByRole("listitem").nth(0).getByRole("button", { name: /All Star/ }).click();
    await page.waitForTimeout(500); // past the pop-in: contrast is measured on what is settled
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("overlay-dock.png") });
    await page.getByRole("dialog", { name: "Sofix" }).getByRole("tab", { name: "Missions" }).click();
    await page.waitForTimeout(500);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("overlay-dock-missions.png") });
    await page.keyboard.press("Escape");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await expect(ribs(page, "big")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("overlay-mobile.png"), fullPage: true });
  });
});
