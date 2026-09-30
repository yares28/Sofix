import { describe, expect, it } from "vitest";
import { OVERLAY_CAP, OverlayRequest, overlayNumbers, overlayPlan } from "./overlay";
import type { GameOdds, GameweekPlan, Lineup, PlayCard, PlayerGame, PlayingPlayer, Plan, Sorare } from "./play";
import type { FixtureGrid, GridCell } from "./types";
import recordedGrid from "../e2e/fixtures/grid-response.json";

const grid = (recordedGrid as unknown as { data: FixtureGrid }).data;
const NOW = new Date("2026-10-08T12:00:00Z");

const game = (over: Partial<PlayerGame> = {}): PlayerGame => ({
  kickoff: "2026-10-10T19:00:00+00:00",
  competition: "laliga-es",
  opponent: "Getafe CF",
  opponentCrest: null,
  venue: "H",
  ...over,
});

const SLOVENIA: GameOdds = { win: 0.56, draw: 0.27, loss: 0.17, cleanSheet: 0.556, goalsFor: 1.47, goalsAgainst: 0.59, difficulty: 35, label: "Very favourite", bucket: 1, source: "sorare" };
const MACEDONIA: GameOdds = { win: 0.17, draw: 0.27, loss: 0.56, cleanSheet: 0.231, difficulty: 74, label: "Big underdog", bucket: 5, source: "sorare" };

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

  it("takes the fixture of the page it is asked from, and only a real one", () => {
    expect(OverlayRequest.safeParse({ cards: [], players: [], fixture: "football-25-29-sep-2026" }).success).toBe(true);
    expect(OverlayRequest.safeParse({ cards: [], players: [], fixture: "football-28-aug-1-sep-2026" }).success).toBe(true);
    for (const fixture of ["../football-25-sep-2026", "football", "football-25-29-sep-2026/../x", "FOOTBALL-25-sep-2026", ""]) {
      expect(OverlayRequest.safeParse({ cards: [], players: [], fixture }).success, fixture).toBe(false);
    }
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
    expect(answer.cards["unai-simon-2026-limited-12"]).toMatchObject({ x: 54.5, p: 0.94, average: 55 });
    expect(answer.cards["unai-simon-2023-rare-3"]).toEqual(answer.cards["unai-simon-2026-limited-12"]);
    expect(answer.players["unai-simon"]).toEqual(answer.cards["unai-simon-2026-limited-12"]);
  });

  it("puts the board's own numbers on a LaLiga game, matched by club name", () => {
    const team = grid.teams.find((t) => t.name === "Athletic Club")!;
    const cell = team.cells.flat().find((c) => c.opponent_code === "GET" && c.venue === "H")!;
    const shown = overlayNumbers(sorare([player()]), grid, ask({ players: ["unai-simon"] }), NOW).players["unai-simon"]!.game!;

    expect(shown.source).toBe("model");
    expect(shown.win).toBe(cell.prediction!.probabilities.win);
    expect(shown.cleanSheet).toBe(cell.prediction!.clean_sheet);
    expect(shown.difficulty).toBe(cell.prediction!.difficulty);
    expect([shown.bucket, shown.label]).toEqual([cell.prediction!.bucket, cell.prediction!.label]);
  });

  it("prefers the board's model to Sorare's odds for a LaLiga game, and falls back to Sorare's when the board has nothing", () => {
    const priced = player({ games: [game({ odds: SLOVENIA })] });
    expect(overlayNumbers(sorare([priced]), grid, ask({ players: ["unai-simon"] }), NOW).players["unai-simon"]!.game!.source).toBe("model");
    const noGrid = overlayNumbers(sorare([priced]), null, ask({ players: ["unai-simon"] }), NOW).players["unai-simon"]!;
    expect(noGrid.game).toMatchObject({ source: "sorare", difficulty: 35 });
    expect(overlayNumbers(sorare([player()]), null, ask({ players: ["unai-simon"] }), NOW).players["unai-simon"]!.game).toBeNull();
  });

  it("uses Sorare's odds for a national-team game, and never the club's board numbers for it", () => {
    const abroad = player({ games: [game({ competition: "uefa-nations-league", team: "Athletic Club", opponent: "Getafe CF", odds: SLOVENIA })] });
    const shown = overlayNumbers(sorare([abroad]), grid, ask({ players: ["unai-simon"] }), NOW).players["unai-simon"]!.game!;
    expect(shown).toEqual({ win: 0.56, cleanSheet: 0.556, goalsFor: 1.47, difficulty: 35, bucket: 1, label: "Very favourite", source: "sorare" });
  });

  it("does not lend a LaLiga fixture's numbers to another competition between the same two clubs", () => {
    const cup = player({ games: [game({ competition: "copa-del-rey", opponent: "Getafe CF" })] });
    expect(overlayNumbers(sorare([cup]), grid, ask({ players: ["unai-simon"] }), NOW).players["unai-simon"]!.game).toBeNull();
  });

  it("has no game numbers, rather than zeros, when nobody has priced the game", () => {
    const unpriced = player({ games: [game({ competition: "mls", team: "Inter Miami CF", opponent: "Orlando City", venue: "A" })] });
    const entry = overlayNumbers(sorare([unpriced]), grid, ask({ players: ["unai-simon"] }), NOW).players["unai-simon"]!;
    expect(entry).toEqual({ x: 54.5, p: 0.94, average: 55, pos: "GK", at: "2026-10-08T00:00:00Z", game: null });
  });

  it("matches the two LaLiga clubs Sorare names differently from the board", () => {
    for (const [board, sorareName] of [["Alavés", "Deportivo Alavés"], ["Deportivo", "Deportivo La Coruña"]] as const) {
      const team = grid.teams.find((t) => t.name === board)!;
      const cell: GridCell = team.cells.flat().find((c) => c.prediction && grid.teams.some((t) => t.code === c.opponent_code))!;
      const opponent = grid.teams.find((t) => t.code === cell.opponent_code)!;
      const home = player({ club: sorareName, games: [game({ team: sorareName, opponent: opponent.name, venue: cell.venue })] });
      const shown = overlayNumbers(sorare([home]), grid, ask({ players: ["unai-simon"] }), NOW).players["unai-simon"]!.game;
      expect(shown, sorareName).toMatchObject({ source: "model", difficulty: cell.prediction!.difficulty });
    }
  });

  it("shows the next game of a double gameweek, or the last once both are played", () => {
    const two = player({ games: [game({ kickoff: "2026-10-07T19:00:00+00:00", odds: SLOVENIA, competition: "cup" }), game({ kickoff: "2026-10-11T19:00:00+00:00", odds: MACEDONIA, competition: "cup" })] });
    const at = (when: string) => overlayNumbers(sorare([two]), null, ask({ players: ["unai-simon"] }), new Date(when)).players["unai-simon"]!.game!.win;
    expect(at("2026-10-08T12:00:00Z")).toBe(0.17); // the 11th is next
    expect(at("2026-10-20T00:00:00Z")).toBe(0.17); // both played: the last
    expect(at("2026-10-06T00:00:00Z")).toBe(0.56); // neither played: the first
  });

  it("carries his score if he starts and if he does not, and the chance of each, when the job published them", () => {
    const split = player({ start: 58.2, bench: 12.6, pStart: 0.78, pOn: 0.12 });
    const entry = overlayNumbers(sorare([split]), grid, ask({ players: ["unai-simon"] }), NOW).players["unai-simon"]!;
    expect(entry).toMatchObject({ x: 54.5, p: 0.94, start: 58.2, bench: 12.6, pStart: 0.78, pOn: 0.12 });
  });

  describe("his chance of starting the game the tile shows, when the job told it game by game", () => {
    const told = (over: Partial<PlayerGame> = {}) =>
      game({ pStart: 0.9, pOn: 0.05, startSource: "futbolfantasy", startAt: "2026-10-08T09:00:00+00:00", ...over });
    const entryOf = (one: PlayingPlayer, when: Date = NOW) => overlayNumbers(sorare([one]), grid, ask({ players: ["unai-simon"] }), when).players["unai-simon"]!;

    it("is that game's own, with whose number it is and when it was read, instead of the week's", () => {
      const one = player({ start: 58.2, bench: 12.6, pStart: 0.78, pOn: 0.12, games: [told({ ffStatus: { kind: "doubt", note: "Duda para la jornada 8" } })] });
      expect(entryOf(one)).toMatchObject({
        start: 58.2,
        bench: 12.6,
        pStart: 0.9,
        pOn: 0.05,
        startSource: "futbolfantasy",
        startAt: "2026-10-08T09:00:00+00:00",
        ffStatus: { kind: "doubt", note: "Duda para la jornada 8" },
      });
    });

    it("follows the game the tile moves on to in a double gameweek", () => {
      const one = player({
        start: 58.2,
        bench: 12.6,
        pStart: 0.9,
        pOn: 0.05,
        games: [told({ kickoff: "2026-10-08T19:00:00+00:00" }), told({ kickoff: "2026-10-12T19:00:00+00:00", pStart: 0.2, pOn: 0.3, startSource: "sofix", startAt: undefined })],
      });
      expect(entryOf(one, new Date("2026-10-08T12:00:00Z"))).toMatchObject({ pStart: 0.9, startSource: "futbolfantasy" });
      const later = entryOf(one, new Date("2026-10-09T12:00:00Z"));
      expect(later).toMatchObject({ pStart: 0.2, pOn: 0.3, startSource: "sofix" });
      expect(later).not.toHaveProperty("startAt");
    });

    it("keeps the week's chance and names the source the job gave it for a player it told nothing game by game", () => {
      const one = player({ start: 58.2, bench: 12.6, pStart: 0.78, pOn: 0.12, startSource: "sorare", sources: { sorare: 0.78, sofix: 0.6 } });
      const entry = entryOf(one);
      expect(entry).toMatchObject({ pStart: 0.78, pOn: 0.12, startSource: "sorare", sources: { sorare: 0.78, sofix: 0.6 } });
      for (const key of ["startAt", "ffStatus"]) expect(entry).not.toHaveProperty(key);
    });

    it("has no source to name when the payload does not carry one", () => {
      const entry = entryOf(player({ start: 58.2, bench: 12.6, pStart: 0.78, pOn: 0.12 }));
      expect(entry).toMatchObject({ pStart: 0.78, pOn: 0.12 });
      for (const key of ["startSource", "sources", "startAt", "ffStatus"]) expect(entry).not.toHaveProperty(key);
    });

    it("carries what each source says beside the one it shows", () => {
      const one = player({ start: 58.2, bench: 12.6, pStart: 0.78, pOn: 0.12, sources: { futbolfantasy: 0.9, sorare: 0.78, sofix: 0.6 }, games: [told()] });
      expect(entryOf(one).sources).toEqual({ futbolfantasy: 0.9, sorare: 0.78, sofix: 0.6 });
    });

    it("names no source without the two scores it splits, which a payload from before them does not carry", () => {
      const entry = entryOf(player({ games: [told()] }));
      for (const key of ["start", "bench", "pStart", "pOn", "startSource"]) expect(entry).not.toHaveProperty(key);
    });
  });

  it("leaves the two scores out for a payload published before they existed, rather than inventing them", () => {
    const entry = overlayNumbers(sorare([player()]), grid, ask({ players: ["unai-simon"] }), NOW).players["unai-simon"]!;
    for (const key of ["start", "bench", "pStart", "pOn"]) expect(entry).not.toHaveProperty(key);
  });

  it("says which position he plays and when the numbers were made, for the tile's driver and its \"updated\" line", () => {
    const entry = overlayNumbers(sorare([player({ pos: "DEF" })]), grid, ask({ players: ["unai-simon"] }), NOW).players["unai-simon"]!;
    expect(entry).toMatchObject({ pos: "DEF", at: "2026-10-08T00:00:00Z" });
  });

  describe("his expected goals if he starts", () => {
    const base = { np: 0.26, pen: 0.05, team: 1.5 }; // one game of his, in an average game for his side (lib/overlay.ts)
    const forward = (games: PlayerGame[]) => player({ pos: "FWD", xg: base, games });
    const xgOf = (one: PlayingPlayer, board: FixtureGrid | null = null) => overlayNumbers(sorare([one]), board, ask({ players: ["unai-simon"] }), NOW).players["unai-simon"]!.xg;

    it("is the non-penalty part scaled to the game plus the penalty part, the game being the board's own read of a LaLiga fixture", () => {
      const team = grid.teams.find((t) => t.name === "Athletic Club")!;
      const cell = team.cells.flat().find((c) => c.opponent_code === "GET" && c.venue === "H")!;
      const goals = cell.prediction!.xg_for!;
      const factor = Math.min(2, Math.max(0.5, goals / base.team));
      expect(xgOf(forward([game()]), grid)).toBeCloseTo(Math.round((base.np * factor + base.pen) * 100) / 100, 2);
      expect(overlayNumbers(sorare([forward([game()])]), grid, ask({ players: ["unai-simon"] }), NOW).players["unai-simon"]!.game!.goalsFor).toBe(goals);
    });

    it("uses the goals Sorare's clean-sheet prices imply for a game the board does not model", () => {
      const cup = (goalsFor: number | null) => forward([game({ competition: "champions-league", team: "Athletic Club", opponent: "Getafe CF", odds: { ...SLOVENIA, goalsFor } })]);
      expect(xgOf(cup(3))).toBe(Math.round((base.np * 2 + base.pen) * 100) / 100); // twice his side's average: the factor stops at 2
      expect(xgOf(cup(1.5))).toBe(0.31); // exactly its average: his own rate
      expect(xgOf(cup(0.3))).toBe(Math.round((base.np * 0.5 + base.pen) * 100) / 100); // and at a half
    });

    it("is his own rate, unscaled, when the game says nothing about goals or is a national-team game", () => {
      expect(xgOf(forward([game({ competition: "champions-league", odds: { ...SLOVENIA, goalsFor: null } })]))).toBe(0.31);
      expect(xgOf(forward([game({ competition: "champions-league", odds: { ...SLOVENIA, goalsFor: undefined } })]))).toBe(0.31); // an older payload has no goals
      // A club rate against a national side's goals is not comparable: only the club's own games are scaled.
      expect(xgOf(forward([game({ competition: "uefa-nations-league", team: "Spain", odds: { ...SLOVENIA, goalsFor: 3 } })]))).toBe(0.31);
    });

    it("is not there when the job had no Understat numbers for him, and never a zero", () => {
      const entry = overlayNumbers(sorare([player({ pos: "FWD", games: [game()] })]), grid, ask({ players: ["unai-simon"] }), NOW).players["unai-simon"]!;
      expect(entry).not.toHaveProperty("xg");
      const noTeam = player({ pos: "FWD", xg: { np: 0.26, pen: 0, team: null }, games: [game()] });
      expect(xgOf(noTeam, grid)).toBe(0.26); // no team average to scale by: his own rate
    });
  });

  describe("what the best plan does with him (O7)", () => {
    const inLineup = (slug: string, captain = false) => ({ slug, captain }) as PlayCard;
    const withPlans = (data: Sorare, plans: unknown[], state: GameweekPlan["state"] = "ready") => {
      data.weeks[0]!.state = state;
      data.weeks[0]!.plans = plans as Plan[];
      return data;
    };
    const entryOf = (data: Sorare) => overlayNumbers(data, grid, ask({ players: ["unai-simon"] }), NOW).players["unai-simon"]!;

    it("names the copy the plan uses, its lineup, and whether he is the captain, and leaves the other copy alone", () => {
      const data = withPlans(sorare([player()]), [{ lineups: [{ comp: "All Star", starters: [inLineup("unai-simon-2026-limited-12", true)], subs: [] }] }]);
      expect(entryOf(data).inPlan).toEqual({ "unai-simon-2026-limited-12": { lineup: "All Star", captain: true } });
    });

    it("counts a substitute as in the plan, but not as its captain", () => {
      const data = withPlans(sorare([player()]), [{ lineups: [{ comp: "Limited", starters: [], subs: [inLineup("unai-simon-2023-rare-3")] }] }]);
      expect(entryOf(data).inPlan).toEqual({ "unai-simon-2023-rare-3": { lineup: "Limited", captain: false } });
    });

    it("reads only the best plan, the first one", () => {
      const data = withPlans(sorare([player()]), [
        { lineups: [{ comp: "All Star", starters: [], subs: [] }] },
        { lineups: [{ comp: "Other", starters: [inLineup("unai-simon-2026-limited-12")], subs: [] }] },
      ]);
      expect(entryOf(data)).not.toHaveProperty("inPlan");
    });

    it("says nothing when the gameweek has no plan yet, or the plan does not use him", () => {
      expect(entryOf(withPlans(sorare([player()]), [], "waiting"))).not.toHaveProperty("inPlan");
      const other = withPlans(sorare([player()]), [{ lineups: [{ comp: "All Star", starters: [inLineup("someone-elses-card")], subs: [] }] }]);
      expect(entryOf(other)).not.toHaveProperty("inPlan");
    });
  });

  describe("a game that has started", () => {
    const over = (games: PlayerGame[], at: string) => overlayNumbers(sorare([player({ games })]), grid, ask({ players: ["unai-simon"] }), new Date(at)).players["unai-simon"]!.over;

    it("is flagged once the game shown has kicked off, and not before", () => {
      const one = [game({ kickoff: "2026-10-10T19:00:00+00:00" })];
      expect(over(one, "2026-10-10T18:59:00Z")).toBeUndefined();
      expect(over(one, "2026-10-10T19:00:01Z")).toBe(true);
      expect(over(one, "2026-10-12T00:00:00Z")).toBe(true);
    });

    it("looks at the next game of a double gameweek, so one still to come is not flagged", () => {
      const two = [game({ kickoff: "2026-10-07T19:00:00+00:00" }), game({ kickoff: "2026-10-11T19:00:00+00:00" })];
      expect(over(two, "2026-10-08T12:00:00Z")).toBeUndefined();
      expect(over(two, "2026-10-20T00:00:00Z")).toBe(true);
    });
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

  describe("the gameweek of the page it is asked from", () => {
    const timeline = [
      { id: "16", slug: "football-22-25-sep-2026", number: 16, start: "", end: "", lock: "", status: "done", kept: true },
      { id: "15", slug: "football-18-22-sep-2026", number: 15, start: "", end: "", lock: "", status: "done" },
      { id: "17", slug: "football-25-29-sep-2026", number: 17, start: "", end: "", lock: "", status: "next" },
      { id: "18", slug: "football-2-6-oct-2026", number: 18, start: "", end: "", lock: "", status: "later" },
    ] as Sorare["timeline"];
    const data = () => sorare([player()], { timeline });
    const archive = () => ({
      ...sorare([player({ x: 33 })]).weeks[0]!,
      gameweek: { id: "16", slug: "football-22-25-sep-2026", number: 16, name: "", start: "", end: "", lock: "" },
      played: true,
    });

    it("answers from the gameweek the page names, not the one being planned", () => {
      const answer = overlayNumbers(data(), grid, ask({ players: ["unai-simon"], fixture: "football-2-6-oct-2026" }), NOW);
      expect(answer.week).toBe(18);
      expect(answer.players["unai-simon"]!.x).toBe(11);
    });

    it("answers from a gameweek the job kept apart when the page no longer holds it", () => {
      const answer = overlayNumbers(data(), grid, ask({ players: ["unai-simon"], fixture: "football-22-25-sep-2026" }), NOW, archive());
      expect(answer.week).toBe(16);
      expect(answer.players["unai-simon"]!.x).toBe(33);
    });

    it("says nothing for a week nobody kept, rather than the numbers of this week under its name", () => {
      const old = overlayNumbers(data(), grid, ask({ players: ["unai-simon"], cards: ["unai-simon-2026-limited-12"], fixture: "football-18-22-sep-2026" }), NOW);
      expect(old).toMatchObject({ week: 15, cards: {}, players: {} });
      const unknown = overlayNumbers(data(), grid, ask({ players: ["unai-simon"], fixture: "football-1-5-jan-2027" }), NOW);
      expect(unknown).toMatchObject({ week: 0, cards: {}, players: {} });
    });

    it("gives the plan of the week asked about, or none for one with nothing", () => {
      expect(overlayNumbers(data(), grid, ask({ plan: true, fixture: "football-2-6-oct-2026" }), NOW).plan).toMatchObject({ week: 18 });
      expect(overlayNumbers(data(), grid, ask({ plan: true, fixture: "football-18-22-sep-2026" }), NOW).plan).toBeUndefined();
    });

    it("changes nothing for a page that names no gameweek", () => {
      const answer = overlayNumbers(data(), grid, ask({ players: ["unai-simon"] }), NOW);
      expect(answer.week).toBe(17);
      expect(answer.players["unai-simon"]!.x).toBe(54.5);
    });
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
