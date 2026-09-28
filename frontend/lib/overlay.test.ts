import { describe, expect, it } from "vitest";
import { OVERLAY_CAP, OverlayRequest, overlayNumbers, overlayPlan } from "./overlay";
import type { GameweekPlan, Lineup, PlayCard, PlayerGame, PlayingPlayer, Plan, Sorare } from "./play";
import type { FixtureGrid } from "./types";
import recordedGrid from "../e2e/fixtures/grid-response.json";

const grid = (recordedGrid as unknown as { data: FixtureGrid }).data;
const NOW = new Date("2026-10-08T12:00:00Z");

const game = (over: Partial<PlayerGame> = {}): PlayerGame => ({
  kickoff: "2026-10-10T19:00:00+00:00",
  competition: "LaLiga",
  opponent: "Getafe CF",
  opponentCrest: null,
  venue: "H",
  ...over,
});

const player = (over: Partial<PlayingPlayer> = {}): PlayingPlayer => ({
  player: "unai-simon",
  name: "Unai Simón",
  pos: "GK",
  avatar: "",
  pic: "",
  crest: null,
  rarity: "limited",
  club: "Athletic Club",
  inSeason: true,
  cards: 1,
  p: 0.94,
  x: 54.5,
  average: 55,
  games: [game()],
  ...over,
});

function sorare(players: PlayingPlayer[], extra: Partial<Sorare> = {}): Sorare {
  const weeks = [17, 18].map((number) => ({
    gameweek: { id: String(number), slug: `gw-${number}`, number, name: `Game Week ${number}`, start: "", end: "", lock: "" },
    state: "ready" as const,
    played: false,
    projectionsAt: null,
    source: "sorare" as const,
    playing: { cards: players.length, players: number === 17 ? players : [player({ x: 11, p: 0.2 })] },
    playable: [],
    blocked: [],
    notWorth: [],
    plans: [],
  }));
  return {
    generatedAt: "2026-10-08T00:00:00Z",
    user: "Yares",
    timeline: [],
    weeks,
    nextId: "17",
    lastId: null,
    cards: { total: 0, usable: 0, excluded: [], byRarity: {}, byPosition: {}, inSeason: 0, rareGoalkeepers: 0 },
    collection: [
      { slug: "unai-simon-2026-limited-12", player: "unai-simon", name: "Unai Simón", pos: "GK", rarity: "limited", inSeason: true, level: 1, average: 55, club: "Athletic Club", pic: "" },
      { slug: "unai-simon-2023-rare-3", player: "unai-simon", name: "Unai Simón", pos: "GK", rarity: "rare", inSeason: false, level: 4, average: 55, club: "Athletic Club", pic: "" },
    ],
    ...extra,
  };
}

const ask = (over: Record<string, unknown> = {}) => OverlayRequest.parse({ cards: [], players: [], ...over });

describe("the request", () => {
  it("takes card and player slugs, and nothing that is not a slug", () => {
    expect(OverlayRequest.safeParse({ cards: ["unai-simon-2026-limited-12"], players: ["unai-simon"], week: "17" }).success).toBe(true);
    // Real slugs from sorare.com: the rarity of a super rare card is written with an underscore.
    expect(OverlayRequest.safeParse({ cards: ["jan-oblak-2026-super_rare-9", "jan-oblak-2026-limited-390"], players: ["jan-oblak"] }).success).toBe(true);
    expect(OverlayRequest.safeParse({ cards: ["../etc/passwd"], players: [] }).success).toBe(false);
    expect(OverlayRequest.safeParse({ cards: ["A B"], players: [] }).success).toBe(false);
    expect(OverlayRequest.safeParse({ cards: [], players: [], week: "next" }).success).toBe(false);
    expect(OverlayRequest.safeParse({ players: [] }).success).toBe(false);
  });

  it("refuses more than the cap in one call, cards and players counted together", () => {
    const slugs = (n: number, tag: string) => Array.from({ length: n }, (_, i) => `${tag}-${i}`);
    expect(OverlayRequest.safeParse({ cards: slugs(OVERLAY_CAP, "c"), players: [] }).success).toBe(true);
    expect(OverlayRequest.safeParse({ cards: slugs(OVERLAY_CAP + 1, "c"), players: [] }).success).toBe(false);
    expect(OverlayRequest.safeParse({ cards: slugs(60, "c"), players: slugs(61, "p") }).success).toBe(false);
  });
});

describe("overlayNumbers", () => {
  it("answers a card you own with its player's numbers, and the same for the player's slug", () => {
    const answer = overlayNumbers(sorare([player()]), grid, ask({ cards: ["unai-simon-2026-limited-12", "unai-simon-2023-rare-3"], players: ["unai-simon"] }), NOW);
    expect(answer.week).toBe(17);
    expect(answer.cards["unai-simon-2026-limited-12"]).toMatchObject({ x: 54.5, p: 0.94, average: 55, opponent: "Getafe CF", venue: "H" });
    expect(answer.cards["unai-simon-2023-rare-3"]).toEqual(answer.cards["unai-simon-2026-limited-12"]);
    expect(answer.players["unai-simon"]).toEqual(answer.cards["unai-simon-2026-limited-12"]);
  });

  it("puts the board's difficulty on a LaLiga fixture, matched by club name", () => {
    const entry = overlayNumbers(sorare([player()]), grid, ask({ players: ["unai-simon"] }), NOW).players["unai-simon"]!;
    expect(entry.code).toBe("GET");
    expect(entry.difficulty).toBeGreaterThanOrEqual(0);
    expect(entry.difficulty).toBeLessThanOrEqual(100);
    expect([1, 2, 3, 4, 5]).toContain(entry.bucket);
    expect(typeof entry.label).toBe("string");
  });

  it("says there are no odds, rather than inventing a difficulty, outside LaLiga", () => {
    const abroad = player({ player: "lionel-messi", name: "Lionel Messi", club: "Inter Miami CF", games: [game({ competition: "MLS", opponent: "Orlando City", venue: "A" })] });
    const entry = overlayNumbers(sorare([abroad]), grid, ask({ players: ["lionel-messi"] }), NOW).players["lionel-messi"]!;
    expect(entry).toMatchObject({ x: 54.5, opponent: "Orlando City", venue: "A", code: "ORL" });
    expect(entry.difficulty).toBeUndefined();
    expect(entry.bucket).toBeUndefined();
  });

  it("never labels a national-team game with the club's grid difficulty", () => {
    const national = player({ games: [game({ competition: "uefa-nations-league", team: "Spain", opponent: "Getafe CF" })] });
    expect(overlayNumbers(sorare([national]), grid, ask({ players: ["unai-simon"] }), NOW).players["unai-simon"]!.difficulty).toBeUndefined();
  });

  it("omits what it does not know instead of returning empty entries", () => {
    const answer = overlayNumbers(sorare([player()]), grid, ask({ cards: ["someone-elses-card-2026-limited-1"], players: ["nobody"] }), NOW);
    expect(answer.cards).toEqual({});
    expect(answer.players).toEqual({});
  });

  it("does not answer a card whose player has no game this week", () => {
    const answer = overlayNumbers(sorare([]), grid, ask({ cards: ["unai-simon-2026-limited-12"] }), NOW);
    expect(answer.cards).toEqual({});
  });

  it("reads the week asked for, and falls back to the one being planned when it is unknown", () => {
    expect(overlayNumbers(sorare([player()]), grid, ask({ players: ["unai-simon"], week: "18" }), NOW).players["unai-simon"]!.x).toBe(11);
    const unknown = overlayNumbers(sorare([player()]), grid, ask({ players: ["unai-simon"], week: "99" }), NOW);
    expect(unknown.week).toBe(17);
    expect(unknown.players["unai-simon"]!.x).toBe(54.5);
  });

  it("shows the next game of a double gameweek, or the last once both are played", () => {
    const two = player({ games: [game({ kickoff: "2026-10-07T19:00:00+00:00", opponent: "Levante UD" }), game({ kickoff: "2026-10-11T19:00:00+00:00", opponent: "Getafe CF" })] });
    expect(overlayNumbers(sorare([two]), grid, ask({ players: ["unai-simon"] }), NOW).players["unai-simon"]!.opponent).toBe("Getafe CF");
    expect(overlayNumbers(sorare([two]), grid, ask({ players: ["unai-simon"] }), new Date("2026-10-20T00:00:00Z")).players["unai-simon"]!.opponent).toBe("Getafe CF");
    expect(overlayNumbers(sorare([two]), grid, ask({ players: ["unai-simon"] }), new Date("2026-10-06T00:00:00Z")).players["unai-simon"]!.opponent).toBe("Levante UD");
  });

  it("still gives the numbers with no grid to read a difficulty from", () => {
    const entry = overlayNumbers(sorare([player()]), null, ask({ players: ["unai-simon"] }), NOW).players["unai-simon"]!;
    expect(entry.x).toBe(54.5);
    expect(entry.difficulty).toBeUndefined();
  });

  it("copes with a payload the job published before players carried their slug", () => {
    const old = player();
    delete (old as { player?: string }).player;
    expect(overlayNumbers(sorare([old]), grid, ask({ players: ["unai-simon"] }), NOW).players).toEqual({});
  });
});

const starter = (slug: string, pic = `https://assets.sorare.com/card/${slug}/picture/x.png`) => ({ slug, pic }) as PlayCard;
const lineup = (comp: string, x: number, starters: PlayCard[]) => ({ comp, x, starters }) as Lineup;

function week(over: Partial<GameweekPlan> = {}): GameweekPlan {
  const plans = [
    {
      rank: 1, essence: 55.4, cash: 0, pAny: 0.16, rewards: 2, cardsUsed: 9, cardsAvailable: 87,
      lineups: [lineup("Limited", 199, [starter("a")]), lineup("All Star", 218, ["b", "c", "d", "e", "f", "g"].map((slug) => starter(slug)))],
    },
    { rank: 2, essence: 1, cash: 0, pAny: 0.01, rewards: 1, cardsUsed: 5, cardsAvailable: 87, lineups: [lineup("Other", 1, [])] },
  ] as Plan[];
  return {
    gameweek: { id: "17", slug: "gw-17", number: 17, name: "Game Week 17", start: "", end: "", lock: "" },
    state: "ready", played: false, projectionsAt: null, source: "sorare",
    playing: { cards: 0, players: [] }, playable: [], blocked: [], notWorth: [], plans, ...over,
  };
}

describe("overlayPlan", () => {
  it("summarises the best plan of the gameweek: what it adds up to, the lineup that leads it, and what it uses", () => {
    expect(overlayPlan(week(), NOW)).toEqual({
      state: "ready",
      week: 17,
      lineups: 2,
      x: 417,
      comp: "All Star",
      pics: ["b", "c", "d", "e", "f"].map((slug) => `https://assets.sorare.com/card/${slug}/picture/x.png`),
      pAny: 0.16,
      essence: 55,
      cardsUsed: 9,
      cardsAvailable: 87,
    });
  });

  it("says what a gameweek without a plan is waiting for, in the app's own words", () => {
    const waiting = overlayPlan(week({ state: "waiting", plans: [], projectionsAt: "2026-10-09T00:00:00Z" }), NOW);
    expect(waiting).toEqual({ state: "waiting", week: 17, note: "Sorare publishes its projections for these games first." });
    expect(overlayPlan(week({ state: "none", plans: [] }), NOW)).toEqual({ state: "none", week: 17, note: "None of your cards play this gameweek." });
  });

  it("is what the endpoint returns when asked for the plan, for the gameweek named or the one being planned", () => {
    const data = sorare([player()]);
    const asked = overlayNumbers(data, grid, ask({ plan: true }), NOW);
    expect(asked.plan).toMatchObject({ state: "none", week: 17 });
    expect(overlayNumbers(data, grid, ask({}), NOW).plan).toBeUndefined();
    expect(overlayNumbers(data, grid, ask({ plan: true, week: "18" }), NOW).plan).toMatchObject({ week: 18 });
  });
});
