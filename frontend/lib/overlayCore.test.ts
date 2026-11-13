import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { scoreBand } from "./cards";
import { contrastRatio } from "./contrast";
import { chanceLabel } from "./play";


// extension/core.js is a plain script the browser loads before the overlay. It is required here as it is, not copied.
type Core = {
  CARD_SELECTOR: string;
  cardImageKey: (value: unknown) => string | null;
  isAvatarArt: (value: unknown) => boolean;
  normalizeCardName: (alt: unknown) => string;
  galleryOf: (pathname: unknown) => string | null;
  MY_GALLERY: string;
  playerPageOf: (pathname: unknown) => string | null;
  verdictLine: (profile: { yours: boolean; inPlan: string[]; verdict: { kind: string; value: string; note: string } | null }) => { text: string; tone: "own" | "up" | "flat" } | null;
  worthLine: (paid: number | null, value: number) => { now: string; change: string; tone: "up" | "down" | "flat" | "free" };
  worthTotal: (w: { paid: number; worth: number; profit: number; bought: number }) => { now: string; paid: string; change: string; tone: "up" | "down" | "flat" };
  collectStartingOdds: (json: unknown) => { game: string; player: string; basisPoints: number | null; status?: string }[];
  collectCards: (json: unknown, limit?: number) => { key: string; cardSlug: string | null; playerSlug: string | null; name: string | null }[];
  surfaceOf: (width: number, height: number, round?: boolean) => "full" | "compact" | "skip";
  scoreLevel: (score: number | null) => "veryLow" | "low" | "mediumLow" | "medium" | "mediumHigh" | "high" | null;
  SCORE_FALLBACK: Record<string, string>;
  SCORE_INK: string;
  chanceLabel: (p: number) => string;
  DOUBTFUL: number;
  STRIPE: string[];
  fdrLevel: (bucket: unknown) => string | null;
  driverOf: (pos: unknown) => "fdr" | "xg" | null;
  startChance: (entry: { p: number; pStart?: number }) => number;
  ffPlayersOf: (html: unknown) => Record<string, { p: number; lesion: number }>;
  liveSplit: (
    entry: Record<string, unknown>,
    live: unknown,
    atIso: string,
  ) => { pStart: number; pOn: number; startSource: string; startAt: string; sources: Record<string, number>; ffStatus?: { kind: string }; live: true } | null;
  OUT_CHANCE: number;
  SOURCE_SHORT: Record<string, string>;
  startTone: (entry: { p: number; pStart?: number; ffStatus?: { kind?: string } }) => "out" | "doubt" | "ok";
  startDisagreement: (entry: { p: number; pStart?: number; startSource?: string; sources?: Record<string, number> }, onPage?: number) => { sofix: number; sorare: number } | null;
  startTitle: (entry: { p: number; pStart?: number; startSource?: string; sources?: Record<string, number> }, onPage?: number) => string;
  startLevel: (p: number) => "low" | "medium" | "high";
  captainPick: (cards: { x: number | null; captain: boolean }[]) => number;
  teamChances: (
    cards: { p: number; mu: number; sd?: number | null; mult: number; pos: string; game: string | null; venue: string | null; club: string | null; average: number | null; captain: boolean }[],
    team: { captainBonus?: number; clubBonus?: [number, number] | null; averageBonus?: [number, number] | null; tiers?: { need: number; label: string }[] },
    runs?: number,
  ) => { x: number; lo: number; hi: number; n: number; bonus: number; tiers: { need: number; label: string; p: number }[] } | null;
  listOrder: (entries: (Record<string, unknown> | null)[], key: string) => number[];
  listPasses: (entry: Record<string, unknown> | null, filters: { key: string; at: number | string }[]) => boolean;
  listValue: (entry: Record<string, unknown> | null, key: string) => number | string | null;
  filterLabel: (f: { key: string; at: number | string }) => string;
  filterStart: (entries: (Record<string, unknown> | null)[], key: string) => number | string;
  compareRows: (a: Record<string, unknown>, b: Record<string, unknown>) => { label: string; a: string; b: string; better: "a" | "b" | null; chip: string | null }[];
  SORT_KEYS: string[];
  lineupChance: (target: number | null, cards: { state: string; raw: number | null; multiplier: number | null; entry?: Record<string, unknown> | null }[]) => { p: number; now: number; open: number; target: number } | null;
  FILTER_KEYS: string[];
  teamRings: (tiers: { need: number; label: string; p: number }[]) => Record<"below" | "at" | "above", { label: string; need: number | null; p: number } | null> | null;
  START_COLOURS: Record<string, [string, string]>;
  startHover: (entry: { p: number; pStart?: number; startSource?: string; sources?: Record<string, number> }, onPage: number | undefined, full: boolean) => string;
  statusNote: (entry: { ffStatus?: { kind?: string; cause?: string; since?: string } }) => { kind: string; text: string } | null;
  clockLabel: (iso: unknown) => string | null;
  sourceRows: (entry: {
    p: number;
    pStart?: number;
    startSource?: string;
    startAt?: string;
    sources?: Record<string, number>;
    laliga?: boolean;
  }) => { source: string; label: string; value: number | null; shown: boolean; at: string | null; note: string | null }[];
  sorarePic: (url: unknown) => string;
  lockLabel: (iso: unknown, now?: number) => { text: string; soon: boolean };
  enteredOf: (response: unknown) => { board: string; draft: boolean; cards: string[]; score: number | null }[] | null;
  stepAnswer: (response: unknown, step: string) => { state: string; broken?: string[]; lineupId?: string | null; entered?: { id: string; draft: boolean; cards: string[] }[]; errors?: string[] };
  liveScores: (response: unknown) => { total: number; lineups: number; byBoard: Record<string, number> } | null;
  composeBoard: (pathname: unknown) => string | null;
  alreadyEntered: (entered: { draft: boolean; cards: string[] }[], cards: string[]) => boolean;
  benchOnChance: (entry: { pStart?: number; pOn?: number }) => number | null;
  comesOnScore: (entry: { on?: number; bench?: number }) => { score: number; words: string; tab: string };
  collectMissions: (json: unknown) => {
    id: string;
    title: string;
    description: string;
    mode: "DECISIVE" | "SCORE";
    picks: number;
    made: number;
    period: string | null;
    state: string | null;
    rarity: string | null;
    stats: string[];
    appearances: { player: string; game: string | null; rarity: string | null; status: string | null }[];
  }[];
  missionsRarity: (pathname: unknown) => string | null;
  missionsAsked: (body: unknown) => string | null;
  agoLabel: (iso: unknown, nowMs: number) => string | null;
  freshLabel: (iso: unknown, nowMs: number) => string | null;
  STALE_HOURS: number;
  staleness: (entry: { at?: string; over?: boolean }, nowMs: number) => { kind: "over" | "old"; hours: number } | null;
  topThree: (items: { key: string; x: number }[]) => Map<string, number>;
  isPickHeading: (text: unknown) => boolean;
  fixtureOf: (url: unknown) => string | null;
  gamesCount: (entry: { fixtures?: unknown }) => number;
  crestState: (entry: unknown, now: number) => { kind: "none" | "crests" | "live" | "out"; games: { opponent: string }[] };
  shieldCode: (game: { opponentCode?: string | null; opponent?: string | null }) => string;
  islandWhen: (kickoff: string | null | undefined) => string;
  competitionName: (slug: string | null | undefined) => string;
  SIXTHS: string[];
};
const core = createRequire(import.meta.url)("../../extension/core.js") as Core;

// Real card pictures, as the design previews (docs/sorare/design/S7-overlay.html, S7-player-page.html) carry them.
const OBLAK = "https://assets.sorare.com/card/c0af94c9-927b-422e-ac4e-a051f16e72ae/picture/tinified-4e59e1794fe68061a586ff8ba74fd171.png";
const FOYTH = "https://assets.sorare.com/card/e7524f8c-2531-4b10-9172-5a99cf7eec61/picture/tinified-dff1d4ffb9118c35d267983bcc51a3a0.png";

describe("cardImageKey", () => {
  it("is the card's own id, whatever derivative is served", () => {
    expect(core.cardImageKey(OBLAK)).toBe("c0af94c9-927b-422e-ac4e-a051f16e72ae");
    expect(core.cardImageKey(OBLAK.replace("tinified-4e59", "low_res-0000"))).toBe("c0af94c9-927b-422e-ac4e-a051f16e72ae");
    expect(core.cardImageKey("https://assets.sorare.com/image-resize/card/e7524f8c-2531-4b10-9172-5a99cf7eec61/video/x.mp4")).toBe(
      "e7524f8c-2531-4b10-9172-5a99cf7eec61",
    );
    expect(core.cardImageKey("https://assets.sorare.com/carddata/abc123/picture/p.png?w=200#x")).toBe("abc123");
  });

  it("reads an original address wrapped in a resizer's query, and the first candidate of a srcset", () => {
    expect(core.cardImageKey(`https://sorare.com/_next/image?url=${encodeURIComponent(FOYTH)}&w=256&q=75`)).toBe(
      "e7524f8c-2531-4b10-9172-5a99cf7eec61",
    );
    expect(core.cardImageKey(`${OBLAK} 1x, ${FOYTH} 2x`)).toBe("c0af94c9-927b-422e-ac4e-a051f16e72ae");
  });

  it("reads a sample picture", () => {
    expect(core.cardImageKey("https://assets.sorare.com/cardsamplepicture/jan-oblak-2026/x.png")).toBe("jan-oblak-2026");
  });

  it("is null for anything that is not card art", () => {
    expect(core.cardImageKey("https://assets.sorare.com/player/football/unai-simon/avatar.png")).toBeNull();
    expect(core.cardImageKey("https://assets.sorare.com/club/getafe-cf/logo.png")).toBeNull();
    expect(core.cardImageKey("")).toBeNull();
    expect(core.cardImageKey(undefined)).toBeNull();
    expect(core.cardImageKey("%E0%A4%A")).toBeNull(); // a broken escape must not throw
  });
});

describe("isAvatarArt", () => {
  it("tells a card's small face-only derivative from the card", () => {
    // Seen on a real player page: the same card id, drawn 18px wide next to a name.
    const avatar = "https://assets.sorare.com/image-resize/card/c0af94c9-927b-422e-ac4e-a051f16e72ae/picture/avatar-4e59e1794fe68061a586ff8ba74fd171.png?width=40";
    expect(core.cardImageKey(avatar)).toBe("c0af94c9-927b-422e-ac4e-a051f16e72ae");
    expect(core.isAvatarArt(avatar)).toBe(true);
    expect(core.isAvatarArt(OBLAK)).toBe(false);
    expect(core.isAvatarArt("https://assets.sorare.com/image-resize/card/cc2d2a9a-fccf-4647-ab01-b02b27c45067/picture/tinified-fb33.png?width=80")).toBe(false);
    expect(core.isAvatarArt(undefined)).toBe(false);
  });
});

describe("normalizeCardName", () => {
  it("keeps the player and drops the rest of the alt text", () => {
    expect(core.normalizeCardName("Jan Oblak - Limited 2023 - #344")).toBe("jan oblak");
    expect(core.normalizeCardName("Unai Simón - Limited")).toBe("unai simon");
    expect(core.normalizeCardName("  Pau   Cubarsí  ")).toBe("pau cubarsi");
    expect(core.normalizeCardName(undefined)).toBe("");
  });
});

describe("collectCards", () => {
  it("finds a card and, inside a lineup, the card an appearance stands for", () => {
    const answer = {
      data: {
        card: { slug: "jan-oblak-2023-limited-344", pictureUrl: OBLAK, anyPlayer: { slug: "jan-oblak", displayName: "Jan Oblak" } },
        so5: {
          so5Fixture: {
            mySo5Lineups: [
              { so5Appearances: [{ id: "a1", pictureUrl: FOYTH, player: { slug: "juan-marcos-foyth", displayName: "Juan Foyth" }, anyCard: { slug: "juan-marcos-foyth-2026-limited-238" } }] },
            ],
          },
        },
      },
    };
    const found = core.collectCards(answer);
    expect(found).toContainEqual({
      key: "c0af94c9-927b-422e-ac4e-a051f16e72ae",
      cardSlug: "jan-oblak-2023-limited-344",
      playerSlug: "jan-oblak",
      name: "Jan Oblak",
    });
    expect(found).toContainEqual({
      key: "e7524f8c-2531-4b10-9172-5a99cf7eec61",
      cardSlug: "juan-marcos-foyth-2026-limited-238",
      playerSlug: "juan-marcos-foyth",
      name: "Juan Foyth",
    });
    expect(found).toHaveLength(2);
  });

  it("skips pictures that are not cards, or that name nobody", () => {
    expect(core.collectCards({ club: { slug: "getafe", pictureUrl: "https://assets.sorare.com/club/getafe-cf/logo.png" } })).toEqual([]);
    expect(core.collectCards({ pictureUrl: OBLAK })).toEqual([]);
    expect(core.collectCards(null)).toEqual([]);
    expect(core.collectCards("text")).toEqual([]);
  });

  it("is bounded: a huge answer is read only so far", () => {
    const wide = { list: Array.from({ length: 500 }, (_, i) => ({ slug: `c-${i}`, pictureUrl: `https://assets.sorare.com/card/id-${i}/picture/p.png` })) };
    expect(core.collectCards(wide, 100).length).toBeLessThan(500);
    expect(core.collectCards(wide)).toHaveLength(500);
  });
});

describe("surfaceOf", () => {
  it("tells the four places one card is drawn", () => {
    expect(core.surfaceOf(240, 339)).toBe("full"); // a gallery or a player page
    expect(core.surfaceOf(140, 198)).toBe("full");
    expect(core.surfaceOf(112, 158)).toBe("compact"); // a lineup slot
    expect(core.surfaceOf(150, 160)).toBe("skip"); // near-square: a tile, not a card
    expect(core.surfaceOf(64, 90)).toBe("compact"); // a thumbnail in a list
  });

  it("skips what is not a card", () => {
    expect(core.surfaceOf(96, 96)).toBe("skip"); // a face
    expect(core.surfaceOf(200, 339, true)).toBe("skip"); // round
    expect(core.surfaceOf(0, 0)).toBe("skip"); // not laid out yet
    expect(core.surfaceOf(20, 28)).toBe("skip"); // too small to read anything on
    // Seen on a real player page: a 40px rarity thumbnail. A chip there would cover a tenth of the picture.
    expect(core.surfaceOf(40, 65)).toBe("skip");
    expect(core.surfaceOf(48, 68)).toBe("compact");
  });
});

// Sorare's own rule for colouring a football score, read from its public script (thresholds-*.js) on 2026-09-29 and
// checked against 42 hexagons on its scouting pages: the first step whose limit is >= the score, else the top colour.
const STEPS: [number, string][] = [[20, "veryLow"], [35, "low"], [50, "mediumLow"], [60, "medium"], [75, "mediumHigh"]];

describe("scoreLevel", () => {
  it("paints a score the way Sorare does, boundaries included", () => {
    for (const [score, level] of [
      [0, "veryLow"], [20, "veryLow"], [21, "low"], [35, "low"], [36, "mediumLow"], [50, "mediumLow"], [51, "medium"],
      [60, "medium"], [61, "mediumHigh"], [75, "mediumHigh"], [76, "high"], [99, "high"], [100, "high"],
    ] as const) {
      expect(core.scoreLevel(score), String(score)).toBe(level);
    }
  });

  it("agrees with the steps written above and with real hexagons seen on Sorare's pages", () => {
    for (const [limit, level] of STEPS) expect(core.scoreLevel(limit)).toBe(level);
    // (score, colour) read off real scouting pages: 41 and 50 yellow, 53 and 60 lime, 61 and 75 green, 76 and 96 cyan.
    for (const [score, level] of [[41, "mediumLow"], [47, "mediumLow"], [50, "mediumLow"], [53, "medium"], [60, "medium"], [61, "mediumHigh"], [75, "mediumHigh"], [76, "high"], [96, "high"]] as const) {
      expect(core.scoreLevel(score)).toBe(level);
    }
  });

  it("is null for no score at all, never a colour", () => {
    expect(core.scoreLevel(null)).toBeNull();
    expect(core.scoreLevel(Number.NaN)).toBeNull();
  });

  it("is the band the board's hexagons use for every whole score, so the two cannot drift apart", () => {
    for (let score = 0; score <= 100; score += 1) expect(scoreBand(score), String(score)).toBe(core.scoreLevel(score));
  });

  it("keeps Sorare's measured colours as the fallback when the page's own tokens go away", () => {
    expect(core.SCORE_FALLBACK).toEqual({
      veryLow: "#ff5a5a", low: "#ff7e34", mediumLow: "#f0ce1d", medium: "#b6ff1a", mediumHigh: "#25ed36", high: "#00f3eb",
    });
  });

  it("reads on every colour Sorare uses: dark type passes AA on all six", () => {
    for (const [level, fill] of Object.entries(core.SCORE_FALLBACK)) {
      expect(contrastRatio(core.SCORE_INK, fill), level).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("shared with the app", () => {
  it("writes a chance the way the board does", () => {
    for (const p of [0, 0.001, 0.004, 0.005, 0.43, 0.885, 0.994, 0.995, 1]) expect(core.chanceLabel(p)).toBe(chanceLabel(p));
  });

  it("looks for card art by its address, never by a class name", () => {
    expect(core.CARD_SELECTOR).toContain('img[src*="/card/"]');
    expect(core.CARD_SELECTOR).not.toMatch(/\.[A-Za-z_-]+[\s,]/); // no class selectors
  });
});

describe("the tile's own helpers", () => {
  it("colours the five difficulty bands in Sorare's own tokens, easiest to hardest, and knows no other band", () => {
    expect([1, 2, 3, 4, 5].map(core.fdrLevel)).toEqual(["high", "mediumHigh", "mediumLow", "low", "veryLow"]);
    expect(core.STRIPE).toEqual(["high", "mediumHigh", "mediumLow", "low", "veryLow"]);
    for (const bad of [0, 6, null, undefined, "1"]) expect(core.fdrLevel(bad)).toBeNull();
    // Every band's colour is one of the six Sorare has, so the FDR reads as a Sorare number.
    for (const level of core.STRIPE) expect(core.SCORE_FALLBACK).toHaveProperty(level);
  });

  it("gives a goalkeeper or defender the difficulty and a midfielder or forward the expected goals", () => {
    expect(["GK", "DEF"].map(core.driverOf)).toEqual(["fdr", "fdr"]);
    expect(["MID", "FWD"].map(core.driverOf)).toEqual(["xg", "xg"]);
    expect(core.driverOf("COACH")).toBeNull();
    expect(core.driverOf(undefined)).toBeNull();
  });

  it("reads his chance of starting from the split, and from the chance of playing on an older answer", () => {
    expect(core.startChance({ p: 0.94, pStart: 0.78 })).toBe(0.78);
    expect(core.startChance({ p: 0.94 })).toBe(0.94);
  });

  it("turns the two chances into the chance he comes on when he is not in the starting eleven", () => {
    expect(core.benchOnChance({ pStart: 0.9, pOn: 0.05 })).toBeCloseTo(0.5); // 0.05 of the 0.10 left
    expect(core.benchOnChance({ pStart: 0.5, pOn: 0.6 })).toBe(1); // never more than certain
    expect(core.benchOnChance({ pStart: 1, pOn: 0 })).toBe(0); // nothing is left to be benched
    expect(core.benchOnChance({ pStart: 0.5 })).toBeNull(); // an answer without the split says nothing
  });

  it("gives the score if he comes on as a score, and the old benched number only for a payload that has no such score (P7)", () => {
    // A substitute starts at 35 like a starter: what he scores if he comes on is about 40, not his chance of coming on times it.
    expect(core.comesOnScore({ on: 41.6, bench: 0.8 })).toEqual({ score: 42, words: "if he comes on", tab: "Comes on" });
    expect(core.comesOnScore({ on: 0, bench: 5 })).toEqual({ score: 0, words: "if he comes on", tab: "Comes on" });
    expect(core.comesOnScore({ bench: 12.6 })).toEqual({ score: 13, words: "if benched", tab: "Benched" });
  });

  it("says how long ago the numbers were made, in the coarsest unit that is honest", () => {
    const at = "2026-10-08T00:00:00Z";
    const later = (minutes: number) => Date.parse(at) + minutes * 60_000;
    expect(core.agoLabel(at, later(0))).toBe("just now");
    expect(core.agoLabel(at, later(5))).toBe("5 min ago");
    expect(core.agoLabel(at, later(11 * 60))).toBe("11 h ago");
    expect(core.agoLabel(at, later(3 * 24 * 60))).toBe("3 d ago");
    expect(core.agoLabel(undefined, later(1))).toBeNull();
    expect(core.agoLabel("not a date", later(1))).toBeNull();
    expect(core.agoLabel(at, Date.parse(at) - 1000)).toBe("just now"); // a clock a little behind is not "in the future"
  });

  it("writes the age the way Sofix's pages do: how long ago and the Madrid time it was made", () => {
    const at = "2026-10-08T01:33:00Z"; // 03:33 in Madrid
    const later = (minutes: number) => Date.parse(at) + minutes * 60_000;
    expect(core.freshLabel(at, later(11 * 60))).toBe("11 h ago (03:33)");
    expect(core.freshLabel(at, later(5))).toBe("5 min ago (03:33)");
    expect(core.freshLabel(at, later(3 * 24 * 60))).toBe("3 d ago (Thu 03:33)"); // over a day: the day too, so the time is not taken for today's
    expect(core.freshLabel(undefined, later(1))).toBeNull();
  });
});

describe("deciding what to do with a number (O7)", () => {
  const at = "2026-10-08T00:00:00Z";
  const later = (hours: number) => Date.parse(at) + hours * 3600_000;

  it("greys numbers that are older than a day, or about a game that has started, and says which", () => {
    expect(core.STALE_HOURS).toBe(24);
    expect(core.staleness({ at }, later(3))).toBeNull();
    expect(core.staleness({ at }, later(24))).toBeNull(); // a refresh that is exactly a day old is still fine
    expect(core.staleness({ at }, later(25))).toEqual({ kind: "old", hours: 25 });
    expect(core.staleness({ at, over: true }, later(1))).toEqual({ kind: "over", hours: 1 }); // the game wins over the age
    expect(core.staleness({ over: true }, later(1))).toEqual({ kind: "over", hours: 0 });
  });

  it("does not grey a number it cannot date, rather than guess", () => {
    expect(core.staleness({}, later(500))).toBeNull();
    expect(core.staleness({ at: "not a date" }, later(500))).toBeNull();
  });

  it("ranks the best three of four or more, by xScore, and no one when there are fewer", () => {
    const list = [
      { key: "a", x: 41 },
      { key: "b", x: 68 },
      { key: "c", x: 55 },
      { key: "d", x: 62 },
      { key: "e", x: 50 },
    ];
    expect([...core.topThree(list)]).toEqual([["b", 1], ["d", 2], ["c", 3]]);
    expect(core.topThree(list.slice(0, 3)).size).toBe(0); // a list of three is not a list to pick from
    expect(core.topThree([]).size).toBe(0);
  });

  it("gives ties distinct ranks in the order the cards are shown", () => {
    const tied = ["a", "b", "c", "d"].map((key) => ({ key, x: 50 }));
    expect([...core.topThree(tied)]).toEqual([["a", 1], ["b", 2], ["c", 3]]);
  });

  it("knows the heading of a pick list: \"Select your Goalkeeper\", in any case, and nothing that merely contains it", () => {
    for (const yes of ["Select your Goalkeeper", "  select your defender ", "SELECT YOUR FORWARD"]) expect(core.isPickHeading(yes), yes).toBe(true);
    for (const no of ["Your lineup", "Please select your Goalkeeper", "Selected", "", undefined, null]) expect(core.isPickHeading(no), String(no)).toBe(false);
  });
});

describe("the gameweek a Sorare page is about (O7)", () => {
  it("reads Sorare's fixture slug out of the address, in the path or in the query, in any case", () => {
    expect(core.fixtureOf("https://sorare.com/football/so5/lineup/football-25-29-sep-2026/abc")).toBe("football-25-29-sep-2026");
    expect(core.fixtureOf("https://sorare.com/football/play?so5Fixture=football-2-6-oct-2026&x=1")).toBe("football-2-6-oct-2026");
    expect(core.fixtureOf("https://sorare.com/football/my-lineups/Football-25-29-SEP-2026")).toBe("football-25-29-sep-2026");
  });

  it("reads a week that runs over two months", () => {
    expect(core.fixtureOf("https://sorare.com/x/football-28-aug-1-sep-2026/y")).toBe("football-28-aug-1-sep-2026");
  });

  it("finds nothing in an address that does not name a gameweek, and is not fooled by something merely called football", () => {
    for (const url of [
      "https://sorare.com/football/my-cards",
      "https://sorare.com/football/players/jan-oblak",
      "https://sorare.com/football/leagues/football-league-2026", // a year, but no month: not a gameweek
      "https://sorare.com/xfootball-25-29-sep-2026",
      "",
      undefined,
      null,
      42,
    ]) {
      expect(core.fixtureOf(url), String(url)).toBeNull();
    }
  });

  it("takes the first when an address names two", () => {
    expect(core.fixtureOf("https://sorare.com/a/football-1-2-oct-2026?then=football-2-6-oct-2026")).toBe("football-1-2-oct-2026");
  });
});


describe("the start row", () => {
  const one = (extra: Record<string, unknown>) => ({ p: 0.9, pStart: 0.9, ...extra });

  it("is quiet when he probably starts, amber in doubt, red when he will not", () => {
    expect(core.startTone(one({}))).toBe("ok");
    expect(core.startTone(one({ pStart: 0.5 }))).toBe("ok");
    expect(core.startTone(one({ pStart: 0.49 }))).toBe("doubt");
    expect(core.startTone(one({ pStart: 0.5, ffStatus: { kind: "doubt" } }))).toBe("doubt");
    expect(core.startTone(one({ pStart: 0.14 }))).toBe("out");
    expect(core.startTone(one({ pStart: 0.9, ffStatus: { kind: "out" } }))).toBe("out");
    expect(core.startTone(one({ pStart: 0.9, ffStatus: { kind: "suspended" } }))).toBe("out");
    expect(core.startTone(one({ pStart: 0.9, ffStatus: { kind: "available" } }))).toBe("ok");
  });

  it("names the source by two letters", () => {
    expect(core.SOURCE_SHORT).toEqual({ futbolfantasy: "FF", sorare: "SO", sofix: "SF" });
  });

  // plans/overlay-v2.md 1.2 (3 Nov 2026): far apart when the two start chances differ by 30 points or more.
  it("flags Sofix and Sorare far apart when their start chances differ by 30 points or more", () => {
    const ff = (pStart: number, sorare?: number) => ({ p: pStart, pStart, startSource: "futbolfantasy", sources: (sorare === undefined ? {} : { sorare }) as Record<string, number> });
    expect(core.startDisagreement(ff(0.8, 0.4))).toEqual({ sofix: 0.8, sorare: 0.4 }); // Mojica on 21 Oct
    expect(core.startDisagreement(ff(0.5, 0.8))).toEqual({ sofix: 0.5, sorare: 0.8 }); // exactly 30 points
    expect(core.startDisagreement(ff(0.6, 0.3))).toEqual({ sofix: 0.6, sorare: 0.3 });
    expect(core.startDisagreement(ff(0.4, 0.6))).toBeNull(); // 20 points
    expect(core.startDisagreement(ff(0.51, 0.8))).toBeNull(); // 29 points
    expect(core.startDisagreement(ff(0.9, 0.95))).toBeNull();
    expect(core.startDisagreement(ff(0.9))).toBeNull(); // Sorare has no number
    expect(core.startDisagreement({ p: 0.2, pStart: 0.2, startSource: "sorare", sources: { sorare: 0.2 } })).toBeNull();
    // Sorare's number as the page received it wins over Sofix's copy: Mojica's SO was missing from Sofix's answer (21 Oct).
    expect(core.startDisagreement(ff(0.8), 0.4)).toEqual({ sofix: 0.8, sorare: 0.4 });
    expect(core.startDisagreement(ff(0.8, 0.4), 0.7)).toBeNull();
  });

  it("reads Sorare's own start % off a game's answer and off a lineup slot on the Lineups page", () => {
    const GAME = "Game:6db6314b-e913-4760-84e3-5ab27e9c226f";
    const PLAYED = "Game:6db6314b-e913-4760-84e3-5ab27e9c2270";
    const odds = (n: number) => ({ footballPlayingStatusOdds: { starterOddsBasisPoints: n } });
    // A game's own answer: each score names its player.
    expect(core.collectStartingOdds({ data: { anyGame: { id: GAME, playerGameScores: [{ anyPlayer: { slug: "a" }, anyPlayerGameStats: odds(3000) }] } } })).toEqual([
      { game: GAME, player: "a", basisPoints: 3000 },
    ]);
    // /football/lineups/pro on 21 Oct 2026: the slot names the player, its score one level down names only the game.
    const lineup = {
      data: { currentUser: { board: { myCurrentStep: { myLineups: [{ taskAppearances: [
        { anyCard: { slug: "johan-andres-mojica-palacio-2026-limited-219", anyPlayer: { slug: "johan-andres-mojica-palacio" } },
          eligiblePlayerGameScores: [{ id: "So5Score:1", anyGame: { id: GAME, statusTyped: "scheduled" }, anyPlayerGameStats: { id: "s", ...odds(4000) } }] },
        { anyCard: { slug: "david-soria-solis-2026-limited-1", anyPlayer: { slug: "david-soria-solis" } },
          eligiblePlayerGameScores: [{ id: "So5Score:2", anyGame: { id: PLAYED, statusTyped: "played" }, anyPlayerGameStats: { id: "t", ...odds(0) } }] },
      ] }] } } } },
    };
    expect(core.collectStartingOdds(lineup)).toEqual(
      expect.arrayContaining([
        { game: GAME, player: "johan-andres-mojica-palacio", basisPoints: 4000, status: "scheduled" },
        // A game already played says what happened (0%: he did not start); the bridge leaves it out of the ring.
        { game: PLAYED, player: "david-soria-solis", basisPoints: 0, status: "played" },
      ]),
    );
    expect(core.collectStartingOdds(lineup)).toHaveLength(2);
  });

  it("says on hover that the number is Sofix's, and when Sorare disagrees", () => {
    expect(core.startTitle({ p: 0.8, pStart: 0.8, startSource: "futbolfantasy", sources: { sorare: 0.7 } })).toBe(
      "Sofix: 80% to start (from Futbol Fantasy's expected lineup)",
    );
    expect(core.startTitle({ p: 0.8, pStart: 0.8, startSource: "futbolfantasy", sources: { sorare: 0.4 } })).toBe(
      "Sofix: 80% to start (from Futbol Fantasy's expected lineup). Sorare says 40%: they disagree",
    );
    expect(core.startTitle({ p: 0.55, pStart: 0.55 })).toBe("Sofix: 55% to start");
  });
});

describe("what the site says is wrong with him", () => {
  it("is the status and since when, never the site's own Spanish words", () => {
    expect(core.statusNote({ ffStatus: { kind: "doubt", cause: "Molestias", since: "Desde 12/09 (18 días)" } })).toEqual({ kind: "doubt", text: "Doubt · since 12 Sep" });
    // the site's cause is in Spanish: the overlay says the word and leaves its diagnosis to Lineups, which translates it
    expect(core.statusNote({ ffStatus: { kind: "doubt", cause: "Molestias en el tobillo" } })).toEqual({ kind: "doubt", text: "Doubt" });
    expect(core.statusNote({ ffStatus: { kind: "out" } })).toEqual({ kind: "out", text: "Out" });
    expect(core.statusNote({ ffStatus: { kind: "suspended" } })).toEqual({ kind: "suspended", text: "Suspended" });
  });

  it("is nothing for a knock he is available despite, or when the site says nothing", () => {
    expect(core.statusNote({ ffStatus: { kind: "available" } })).toBeNull();
    expect(core.statusNote({ ffStatus: {} })).toBeNull();
    expect(core.statusNote({})).toBeNull();
  });
});

describe("the list of sources", () => {
  it("has all three in order, the one shown marked, the others faded when they say nothing", () => {
    const rows = core.sourceRows({ p: 0.9, pStart: 0.9, startSource: "futbolfantasy", sources: { futbolfantasy: 0.9, sofix: 0.78 }, startAt: "2026-10-09T14:56:00Z" });

    expect(rows.map((r) => [r.label, r.value, r.shown])).toEqual([
      ["FF", 0.9, true],
      ["SO", null, false],
      ["SF", 0.78, false],
    ]);
    expect(rows[0]!.at).toMatch(/^\d\d:\d\d$/);
    expect(rows[1]!.at).toBeNull();
  });

  it("uses the tile's own number for the source it shows when the answer carries no list", () => {
    const rows = core.sourceRows({ p: 0.8, pStart: 0.8, startSource: "sorare" });

    expect(rows.map((r) => [r.label, r.value, r.shown])).toEqual([
      ["FF", null, false],
      ["SO", 0.8, true],
      ["SF", null, false],
    ]);
  });

  it("says Futbol Fantasy covers LaLiga only when a game of another competition has no number from it", () => {
    const abroad = core.sourceRows({ p: 0.9, pStart: 0.82, startSource: "sofix", sources: { sofix: 0.82 }, laliga: false });
    expect(abroad.map((r) => [r.label, r.note])).toEqual([
      ["FF", "LaLiga only"],
      ["SO", null],
      ["SF", null],
    ]);
    // a LaLiga game it has not spoken about, and an answer that does not say, have nothing to explain
    expect(core.sourceRows({ p: 0.9, pStart: 0.82, startSource: "sofix", sources: { sofix: 0.82 }, laliga: true })[0]!.note).toBeNull();
    expect(core.sourceRows({ p: 0.9, pStart: 0.82, startSource: "sofix", sources: { sofix: 0.82 } })[0]!.note).toBeNull();
  });

  it("reads a clock time, and nothing from a bad one", () => {
    expect(core.clockLabel("2026-10-09T14:56:00Z")).toMatch(/^\d\d:\d\d$/);
    expect(core.clockLabel("not a time")).toBeNull();
    expect(core.clockLabel(undefined)).toBeNull();
  });
});


describe("the dock", () => {
  it("draws only Sorare's own pictures", () => {
    expect(core.sorarePic("https://assets.sorare.com/card/x/picture/a.png")).toBe("https://assets.sorare.com/card/x/picture/a.png");
    expect(core.sorarePic("https://evil.example/a.png")).toBe("");
    expect(core.sorarePic(7)).toBe("");
  });

  it("says when the gameweek locks in Madrid time, the minutes in its last hour, and Locked after", () => {
    const lock = "2026-10-20T14:00:00Z";
    expect(core.lockLabel(lock, Date.parse("2026-10-20T08:00:00Z"))).toEqual({ text: "Locks 16:00", soon: false });
    expect(core.lockLabel(lock, Date.parse("2026-10-20T13:18:00Z"))).toEqual({ text: "Locks in 42 min", soon: true });
    expect(core.lockLabel(lock, Date.parse("2026-10-20T14:00:00Z"))).toEqual({ text: "Locked", soon: false });
    expect(core.lockLabel("2026-10-23T14:00:00Z", Date.parse("2026-10-20T08:00:00Z")).text).toBe("Locks Fri 16:00");
    expect(core.lockLabel(undefined)).toEqual({ text: "", soon: false });
  });

  it("reads which lineups of the gameweek Sorare already holds, so the dock knows what is entered before anyone presses Check", () => {
    const lineup = (board: string, draft: boolean, cards: string[], score?: number) => ({ id: board, draft, so5Leaderboard: { slug: board }, so5Appearances: cards.map((slug) => ({ anyCard: { slug } })),
      so5Rankings: score === undefined ? [] : [{ score, so5Leaderboard: { slug: board } }] });
    const answer = { state: "ok", data: { so5: { so5Fixture: { mySo5Lineups: [lineup("laliga", false, ["a", "b"], 406.2), lineup("laliga", false, ["e"], 268), lineup("laliga", true, ["c"]), lineup("champion", false, ["d"])] } } } };
    expect(core.enteredOf(answer)).toEqual([
      { board: "laliga", draft: false, cards: ["a", "b"], score: 406.2 }, { board: "laliga", draft: false, cards: ["e"], score: 268 }, // each entry its own score (13 Nov: four LaLiga lineups all showed the best)
      { board: "laliga", draft: true, cards: ["c"], score: null }, { board: "champion", draft: false, cards: ["d"], score: null },
    ]);
    expect(core.enteredOf({ state: "timeout" })).toBeNull(); // a failed read is never "nothing entered"
    expect(core.enteredOf({ state: "ok", data: {} })).toBeNull();
  });

  it("takes a step for done only when Sorare's answer proves it", () => {
    const lineup = (id: string, draft: boolean) => ({ id, draft, so5Appearances: [{ anyCard: { slug: "a" } }, { card: { slug: "b" } }] });
    expect(core.stepAnswer({ state: "ok", data: { so5: { so5Leaderboard: { previewSo5Lineup: { feedbackRules: [{ state: "INVALID", message: "Too many cards from one club", ruleName: "x" }, { state: "VALID", ruleName: "y" }] } } } } }, "check"))
      .toMatchObject({ state: "ok", broken: ["Too many cards from one club"] });
    expect(core.stepAnswer({ state: "ok", data: { createOrUpdateSo5Lineup: { errors: [], so5Lineup: lineup("L1", true) } } }, "draft")).toMatchObject({ state: "ok", lineupId: "L1" });
    // A "draft" that came back entered, or an entry that came back a draft, is not what was asked: never a success.
    expect(core.stepAnswer({ state: "ok", data: { createOrUpdateSo5Lineup: { errors: [], so5Lineup: lineup("L1", false) } } }, "draft").state).toBe("error");
    expect(core.stepAnswer({ state: "ok", data: { confirmSo5Lineups: { errors: [], so5Lineups: [lineup("L1", true)] } } }, "enter").state).toBe("error");
    expect(core.stepAnswer({ state: "ok", data: { confirmSo5Lineups: { errors: [], so5Lineups: [lineup("L1", false)] } } }, "enter")).toMatchObject({ state: "ok", lineupId: "L1" });
    expect(core.stepAnswer({ state: "ok", data: { confirmSo5Lineups: { errors: [{ message: "Locked" }], so5Lineups: null } } }, "enter")).toEqual({ state: "rejected", errors: ["Locked"] });
    expect(core.stepAnswer({ state: "ok", data: null }, "check").state).toBe("error");
    expect(core.stepAnswer({ state: "unknown" }, "check").state).toBe("no-bridge");
    expect(core.stepAnswer({ state: "timeout" }, "enter").state).toBe("timeout");
    expect(core.stepAnswer(undefined, "enter").state).toBe("error");
    const held = core.stepAnswer({ state: "ok", data: { so5: { so5Leaderboard: { mySo5Lineups: [lineup("L1", false)] } } } }, "entered");
    expect(held.entered).toEqual([{ id: "L1", draft: false, cards: ["a", "b"] }]);
  });

  it("adds up what the entered lineups have scored: drafts and unscored lineups count for nothing, a failed read is not a score of 0", () => {
    const lineup = (board: string, draft: boolean, score: number | null) => ({
      id: board, draft, so5Leaderboard: { slug: board }, so5Rankings: score === null ? [] : [{ score, so5Leaderboard: { slug: board } }],
    });
    const answer = (lineups: unknown[]) => ({ state: "ok", data: { so5: { so5Fixture: { mySo5Lineups: lineups } } } });
    expect(core.liveScores(answer([lineup("pro", false, 251.4), lineup("star", false, 180), lineup("star", false, 200.2), lineup("draft", true, 99), lineup("later", false, null)])))
      .toEqual({ total: 632, lineups: 3, byBoard: { pro: 251.4, star: 200.2 } });
    expect(core.liveScores(answer([]))).toEqual({ total: 0, lineups: 0, byBoard: {} });
    expect(core.liveScores({ state: "timeout" })).toBeNull();
    expect(core.liveScores({ state: "ok", data: { so5: { so5Fixture: null } } })).toBeNull();
    expect(core.liveScores(undefined)).toBeNull();
  });

  it("names the competition of Sorare's lineup page from its address, and nothing else", () => {
    const slug = "football-23-27-oct-2026-seasonal-spain-in_season_spain_limited";
    expect(core.composeBoard(`/football/play/classic/compose/${slug}`)).toBe(slug);
    expect(core.composeBoard(`/football/play/compose/${slug}/`)).toBe(slug);
    expect(core.composeBoard(`/football/play/boards/arena/cash/football-23-27-oct-2026/${slug}/lineups`)).toBeNull();
    expect(core.composeBoard("/football/missions/play/limited")).toBeNull();
    expect(core.composeBoard(undefined)).toBeNull();
  });

  it("knows a lineup Sorare already holds entered, whatever the order of its cards, and not one held only as a draft", () => {
    expect(core.alreadyEntered([{ draft: false, cards: ["a", "b"] }], ["b", "a"])).toBe(true);
    expect(core.alreadyEntered([{ draft: true, cards: ["a", "b"] }], ["a", "b"])).toBe(false);
    expect(core.alreadyEntered([{ draft: false, cards: ["a", "c"] }], ["a", "b"])).toBe(false);
  });
});

describe("Futbol Fantasy's match page, read in the browser", () => {
  const page = readFileSync(new URL("../../backend/tests/fixtures/futbolfantasy/match_real_sociedad_deportivo.html", import.meta.url), "utf8");

  it("gives each player's chance and injury code by his number, as the job's own parser reads them", () => {
    const players = core.ffPlayersOf(page);

    expect(Object.keys(players).length).toBeGreaterThanOrEqual(40);
    expect(players["2675"]).toEqual({ p: 0.9, lesion: -1 }); // Oyarzabal
    expect(players["2802"]).toEqual({ p: 0.5, lesion: 1 }); // Zubeldia, a doubt
    expect(players["12538"]).toEqual({ p: 0.8, lesion: -1 }); // Aramburu, called up by his country
  });

  it("agrees with the job's parser on everybody the job read", () => {
    const parsed = JSON.parse(
      readFileSync(new URL("../../backend/tests/fixtures/futbolfantasy/matches_round_8.json", import.meta.url), "utf8"),
    ) as { match_id: number; home: { xi: { ff_id: string; chance: number | null; lesion: number }[] }; away: { xi: { ff_id: string; chance: number | null; lesion: number }[] } }[];
    const match = parsed.find((item) => item.match_id === 22502)!;
    const players = core.ffPlayersOf(page);

    for (const one of [...match.home.xi, ...match.away.xi]) {
      expect(players[one.ff_id], one.ff_id).toEqual({ p: one.chance, lesion: one.lesion });
    }
  });

  it("reads the page as the site really writes it: data-onceFF has capitals (found on the live page, 3 Oct 2026)", () => {
    // Copied from match 22493 (Alavés v Atlético). The saved pages above went through a parser that lowercases attribute names,
    // which is how a reader that looked for lowercase passed every test and found 0 of 45 players on the real site.
    const raw =
      '<div class="jugador_1826 portero    camiseta-wrapper" style="left: 50%; top: 88%" data-index="0" data-onceFF="titular" data-onceFF-x="50%" data-onceFF-y="88%" >' +
      '<a class="camiseta " data-totalPartidosJugados="7" data-probabilidad="95%" data-edad="31" data-lesion="-1" data-forma-value="3"></a></div>' +
      '<div class="jugador_63 campo    camiseta-wrapper" data-index="12" data-onceFF="suplente" data-onceFF-x="10%" data-onceFF-y="10%" >' +
      '<a class="camiseta " data-probabilidad="50%" data-edad="24" data-lesion="1"></a></div>';
    expect(core.ffPlayersOf(raw)).toEqual({ "1826": { p: 0.95, lesion: -1 }, "63": { p: 0.5, lesion: 1 } });
  });

  it("gives nothing for a page that is not a lineup page, or for nothing", () => {
    expect(core.ffPlayersOf("<html><body>Mantenimiento</body></html>")).toEqual({});
    expect(core.ffPlayersOf(undefined)).toEqual({});
    expect(core.ffPlayersOf('<div class="jugador_5 campo" data-onceff="titular"><a data-probabilidad="140%">')).toEqual({});
  });
});

describe("a changed chance of starting, applied to an answer", () => {
  const cases = JSON.parse(readFileSync(new URL("../../backend/tests/fixtures/live_start_cases.json", import.meta.url), "utf8")).cases as {
    name: string;
    benchedOn: number;
    live: { p: number; lesion: number };
    expect: { pStart: number; pOn: number };
  }[];

  it.each(cases)("$name: the same numbers as the job's", ({ benchedOn, live, expect: want }) => {
    const done = core.liveSplit({ pStart: 0.9, pOn: 0.05, benchedOn }, live, "2026-10-09T14:56:00Z")!;

    expect(done.pStart).toBeCloseTo(want.pStart, 3);
    expect(done.pOn).toBeCloseTo(want.pOn, 3);
    expect(done.startSource).toBe("futbolfantasy");
    expect(done.startAt).toBe("2026-10-09T14:56:00Z");
    expect(done.sources.futbolfantasy).toBeCloseTo(want.pStart, 3);
  });

  it("works the rate out from an answer that does not carry it", () => {
    const done = core.liveSplit({ pStart: 0.8, pOn: 0.1 }, { p: 0.4, lesion: -1 }, "2026-10-09T14:56:00Z")!;

    expect(done.pOn).toBeCloseTo(0.3, 3); // he came on in half the games he did not start: 0.6 of them are left
  });

  it("keeps what the other sources said, and the cause of an injury while the kind stays the same", () => {
    const before = { pStart: 0.9, pOn: 0.05, benchedOn: 0.3, sources: { sorare: 0.8 }, ffStatus: { kind: "doubt", cause: "Molestias" } };

    const same = core.liveSplit(before, { p: 0.5, lesion: 1 }, "2026-10-09T14:56:00Z")!;
    expect(same.sources).toEqual({ sorare: 0.8, futbolfantasy: 0.5 });
    expect(same.ffStatus).toEqual({ kind: "doubt", cause: "Molestias" });

    expect(core.liveSplit(before, { p: 0, lesion: 0 }, "2026-10-09T14:56:00Z")!.ffStatus).toEqual({ kind: "out" });
    expect(core.liveSplit(before, { p: 0.9, lesion: -1 }, "2026-10-09T14:56:00Z")!.ffStatus).toBeUndefined();
  });

  it("applies nothing when there is nothing to apply", () => {
    expect(core.liveSplit({ pStart: 0.9, pOn: 0.05 }, undefined, "t")).toBeNull();
    expect(core.liveSplit({ pStart: 0.9, pOn: 0.05 }, { p: 1.5, lesion: -1 }, "t")).toBeNull();
    expect(core.liveSplit({ pStart: 0.9, pOn: 0.05 }, { p: Number.NaN, lesion: -1 }, "t")).toBeNull();
  });
});

describe("games in the gameweek", () => {
  it("counts one game unless the answer lists more than one", () => {
    expect(core.gamesCount({})).toBe(1);
    expect(core.gamesCount({ fixtures: [] })).toBe(1);
    expect(core.gamesCount({ fixtures: [{}] })).toBe(1);
    expect(core.gamesCount({ fixtures: [{}, {}] })).toBe(2);
    expect(core.gamesCount({ fixtures: "two" })).toBe(1);
    expect(core.gamesCount(undefined as never)).toBe(1);
  });

});

describe("the daily missions", () => {
  const answer = {
    data: {
      currentUser: {
        taskGroup: {
          myTasks: [
            { __typename: "ThresholdsStreakTask", id: "t0", title: "K League 1 Limited" },
            { __typename: "DecisivePlayerPickerTask", id: "t2", title: "Interception - All Matches", description: "Pick a player who makes 2+ interceptions in any match", mode: "DECISIVE", maxAppearancesCount: 3, periodicity: "DAILY", aasmState: "READY", taskAppearances: [{ id: "a" }], signedSecret: "x".repeat(500) },
            { __typename: "DecisivePlayerPickerTask", id: "t1", title: "Decisive Picker", description: "Earn 200 XP for each player you select", mode: "DECISIVE", maxAppearancesCount: 3, taskAppearances: [] },
          ],
        },
      },
    },
  };

  it("keeps only the pickers, cut down to what the ranking needs, in a steady order", () => {
    const found = core.collectMissions(answer);
    expect(found.map((m) => m.title)).toEqual(["Decisive Picker", "Interception - All Matches"]);
    expect(found[1]).toEqual({
      id: "t2", title: "Interception - All Matches", description: "Pick a player who makes 2+ interceptions in any match", mode: "DECISIVE", picks: 3, made: 1,
      period: "DAILY", state: "READY", rarity: null, stats: [], appearances: [],
    });
    expect(JSON.stringify(found)).not.toContain("signedSecret");
  });

  it("reads the app's own question too: every rarity's missions, the stats they count, your picks with Sorare's verdict; not an expired or unnamed one", () => {
    // The shape `SofixMissions` (extension/bridge.js) got from Sorare on 6 Oct 2026, cut down.
    const asked = {
      currentUser: {
        slug: "yares",
        tasks: [
          { __typename: "DecisivePlayerPickerTask", id: "c1", title: "Decisive Player Picker", description: "", rarity: "common", mode: "DECISIVE", maxAppearancesCount: 1, periodicity: "DAILY", aasmState: "READY", expired: false, decisiveStats: [], taskAppearances: [{ status: "READY", rarity: "common", anyPlayer: { slug: "lamine-yamal-nasraoui-ebana" }, game: { id: "Game:1" } }] },
          { __typename: "DecisivePlayerPickerTask", id: "l1", title: "Decisive Picker", description: "Earn 200 XP for each player you select who gets a positive decisive action in today's matches.", rarity: "limited", mode: "DECISIVE", maxAppearancesCount: 3, periodicity: "DAILY", aasmState: "READY", expired: false, decisiveStats: [{ name: "goals" }, { name: 7 }],
            taskAppearances: [{ status: "SUCCESS", rarity: "limited", anyPlayer: { slug: "jan-oblak" }, game: { id: "Game:2" }, signedSecret: "x" }, { status: "READY", anyPlayer: null }] },
          { __typename: "DecisivePlayerPickerTask", id: "old", title: "Assist - All Matches", rarity: "rare", mode: "DECISIVE", maxAppearancesCount: 3, expired: true, taskAppearances: [] },
          { __typename: "DecisivePlayerPickerTask", id: "blank", title: "", rarity: "limited", mode: "DECISIVE", maxAppearancesCount: 3, taskAppearances: [] },
          { __typename: "DailyActionTask", id: "d1", title: "Open the app" },
        ],
      },
    };
    const found = core.collectMissions(asked);
    expect(found.map((m) => [m.id, m.rarity])).toEqual([["l1", "limited"], ["c1", "common"]]);
    expect(found[0]).toMatchObject({ picks: 3, made: 2, stats: ["goals"], appearances: [{ player: "jan-oblak", game: "Game:2", rarity: "limited", status: "SUCCESS" }] });
    expect(JSON.stringify(found)).not.toContain("signedSecret");
  });

  it("finds nothing in an answer with no picker, or in something that is not an answer", () => {
    expect(core.collectMissions({ data: { currentUser: { slug: "x" } } })).toEqual([]);
    expect(core.collectMissions(null)).toEqual([]);
    expect(core.collectMissions("text")).toEqual([]);
  });

  it("reads the rarity from the page's address and nothing from any other", () => {
    expect(core.missionsRarity("/football/missions/play/limited")).toBe("limited");
    expect(core.missionsRarity("/football/missions/play/rare/")).toBe("rare");
    expect(core.missionsRarity("/football/missions/play/super_rare")).toBe("super_rare");
    expect(core.missionsRarity("/football/play/missions/play/limited")).toBe("limited"); // the address Sorare really uses (4 Oct)
    expect(core.missionsRarity("/football/cards")).toBeNull();
    expect(core.missionsRarity(undefined)).toBeNull();
  });

  it("takes the rarity from the question, so another rarity's answer is never filed under the page's", () => {
    const body = (rarity: string) => JSON.stringify({ operationName: "MissionsCategoryRarityPageQuery", variables: { taskGroupSlug: "play", rarity } });
    expect(core.missionsAsked(body("rare"))).toBe("rare");
    expect(core.missionsAsked(body("LIMITED"))).toBe("limited");
    expect(core.missionsAsked(JSON.stringify({ operationName: "Other", variables: { rarity: "rare" } }))).toBeNull();
    expect(core.missionsAsked("not json")).toBeNull();
    expect(core.missionsAsked(undefined)).toBeNull();
  });
});

describe("your gallery's prices (B2)", () => {
  it("knows a gallery and whose it is from the address", () => {
    expect(core.galleryOf("/football/my-club/yares/cards/limited")).toBe("yares");
    expect(core.galleryOf("/football/my-club/yares/cards")).toBe("yares");
    expect(core.galleryOf("/football/my-club/yares")).toBeNull(); // the club page, not the gallery
    expect(core.galleryOf("/football/my-club/yares/collections")).toBeNull();
    expect(core.galleryOf("/football/players/jan-oblak/cards")).toBeNull();
    // Sorare's own Gallery link opens the signed-in account's gallery without its name (13 Nov 2026: no prices there).
    expect(core.galleryOf("/football/my-cards/cards/limited")).toBe(core.MY_GALLERY);
    expect(core.galleryOf("/football/my-cards/cards")).toBe(core.MY_GALLERY);
    expect(core.galleryOf("/football/my-cards/collections")).toBeNull();
  });

  it("writes each card's line like the board: worth now, then up or down on what you paid, or 'not bought'", () => {
    expect(core.worthLine(3.02, 3.4)).toEqual({ now: "now €3.40", change: "▲13%", tone: "up" });
    expect(core.worthLine(5.69, 4.2)).toEqual({ now: "now €4.20", change: "▼26%", tone: "down" });
    expect(core.worthLine(4, 4)).toEqual({ now: "now €4.00", change: "level", tone: "flat" });
    expect(core.worthLine(null, 2.1)).toEqual({ now: "now €2.10", change: "not bought", tone: "free" });
  });

  it("totals the bought cards as Prices does: worth now, what was paid, the difference", () => {
    expect(core.worthTotal({ paid: 268, worth: 312, profit: 44, bought: 30 })).toEqual({ now: "€312.00", paid: "paid €268.00 for 30 cards", change: "▲ €44.00 · +16%", tone: "up" });
    expect(core.worthTotal({ paid: 100, worth: 90.5, profit: -9.5, bought: 4 })).toEqual({ now: "€90.50", paid: "paid €100.00 for 4 cards", change: "▼ €9.50 · −10%", tone: "down" });
    expect(core.worthTotal({ paid: 0, worth: 0, profit: 0, bought: 0 }).change).toBe("€0.00");
  });
});

describe("a player's Sorare page (B3)", () => {
  it("knows a player page and its tabs from the address, and nothing else", () => {
    expect(core.playerPageOf("/football/players/lamine-yamal-nasraoui-ebana")).toBe("lamine-yamal-nasraoui-ebana");
    for (const tab of ["fixtures", "history", "watchlists", "cards", "cards/sales-history"]) expect(core.playerPageOf(`/football/players/pedri/${tab}`)).toBe("pedri");
    expect(core.playerPageOf("/football/players")).toBeNull();
    expect(core.playerPageOf("/football/my-club/yares/cards/limited")).toBeNull();
    expect(core.playerPageOf("/nba/players/lebron-james")).toBeNull();
  });

  it("says whether he is yours and in the plan, or what he would add to your squad", () => {
    const own = { kind: "own", value: "In your squad", note: "you have him" };
    expect(core.verdictLine({ yours: true, inPlan: ["Arena · Limited", "Champion"], verdict: own })).toEqual({ text: "Yours · in Arena · Limited, Champion", tone: "own" });
    expect(core.verdictLine({ yours: true, inPlan: [], verdict: own })).toEqual({ text: "Yours · not in the plan", tone: "own" });
    expect(core.verdictLine({ yours: false, inPlan: [], verdict: { kind: "up", value: "+6", note: "on your MID" } })).toEqual({ text: "Upgrade +6 on your MID", tone: "up" });
    expect(core.verdictLine({ yours: false, inPlan: [], verdict: { kind: "flat", value: "+4", note: "starts 55%" } })).toEqual({ text: "+4 · starts 55%", tone: "flat" });
    expect(core.verdictLine({ yours: false, inPlan: [], verdict: { kind: "flat", value: "level", note: "vs your GK" } })).toEqual({ text: "level · vs your GK", tone: "flat" });
    expect(core.verdictLine({ yours: false, inPlan: [], verdict: null })).toBeNull();
  });
});


describe("the crest above each card (plans/overlay-v2.md step 2)", () => {
  const NOW = Date.parse("2026-11-04T19:30:00Z");
  const island = (kickoff: string, over: Record<string, unknown> = {}) => ({ id: "g", kickoff, opponent: "Borussia Dortmund", opponentCrest: "bvb.png", ...over });
  it("shows the crest of each game ahead, both in a two-game week, and nothing without a game", () => {
    expect(core.crestState({ island: [island("2026-11-05T20:00:00Z"), island("2026-11-08T15:00:00Z", { opponent: "Elche" })] }, NOW)).toMatchObject({ kind: "crests", games: [{ opponent: "Borussia Dortmund" }, { opponent: "Elche" }] });
    expect(core.crestState({}, NOW).kind).toBe("none");
    expect(core.crestState({ island: [] }, NOW).kind).toBe("none");
    expect(core.crestState(null, NOW).kind).toBe("none");
  });
  it("turns into the live pill from kick-off until the game is over, and says Out for a player sure not to play", () => {
    expect(core.crestState({ island: [island("2026-11-04T19:00:00Z")] }, NOW).kind).toBe("live");
    expect(core.crestState({ island: [island("2026-11-04T16:00:00Z")] }, NOW).kind).toBe("crests"); // over: a played game, no pill
    expect(core.crestState({ island: [island("2026-11-05T20:00:00Z")], ffStatus: { kind: "out" } }, NOW).kind).toBe("out");
    expect(core.crestState({ island: [island("2026-11-05T20:00:00Z")], ffStatus: { kind: "doubt" } }, NOW).kind).toBe("crests");
  });
  it("leaves a played game out once another is still to come or on, and says Out for a suspended player (9 Nov 2026)", () => {
    const played = island("2026-11-03T19:00:00Z", { opponent: "Elche" });
    expect(core.crestState({ island: [played, island("2026-11-05T20:00:00Z")] }, NOW)).toMatchObject({ kind: "crests", games: [{ opponent: "Borussia Dortmund" }] });
    expect(core.crestState({ island: [played, island("2026-11-04T19:00:00Z")] }, NOW)).toMatchObject({ kind: "live", games: [{ opponent: "Borussia Dortmund" }] });
    expect(core.crestState({ island: [island("2026-11-05T20:00:00Z")], ffStatus: { kind: "suspended" } }, NOW).kind).toBe("out");
  });
  it("names a club Sorare has no crest for by its three letters, Sorare's own when it has them", () => {
    expect(core.shieldCode({ opponentCode: "FEN", opponent: "Fenerbahçe" })).toBe("FEN");
    expect(core.shieldCode({ opponentCode: null, opponent: "Fenerbahçe" })).toBe("FEN");
    expect(core.shieldCode({ opponent: "" })).toBe("?");
  });
  it("says the day and time in Madrid, and each competition by its name", () => {
    expect(core.islandWhen("2026-11-04T20:00:00Z")).toBe("Wed 4 Nov · 21:00");
    expect(core.islandWhen(null)).toBe("Date TBC");
    expect(core.competitionName("uefa-champions-league")).toBe("Champions League");
    expect(core.competitionName("laliga-es")).toBe("LaLiga");
    expect(core.competitionName("copa-del-rey")).toBe("Copa Del Rey");
  });
  it("colours a stat by its sixth with Sorare's six score colours, worst first", () => {
    expect(core.SIXTHS).toEqual(["#ff5a5a", "#ff7e34", "#f0ce1d", "#b6ff1a", "#25ed36", "#00f3eb"]);
  });
});

describe("the start % chip's hover (plans/overlay-v2.md 1.2)", () => {
  const entry = (pStart: number, startSource: string, sorare?: number) => ({ p: pStart, pStart, startSource, sources: (sorare === undefined ? {} : { sorare }) as Record<string, number> });
  it("says Sofix's and Sorare's numbers on a full card, Sofix's alone when Sorare has none", () => {
    expect(core.startHover(entry(0.83, "futbolfantasy", 0.8), undefined, true)).toBe("Sofix 83% · Sorare 80%");
    expect(core.startHover(entry(0.83, "futbolfantasy"), 0.7, true)).toBe("Sofix 83% · Sorare 70%"); // the page's own number wins
    expect(core.startHover(entry(0.83, "sofix"), undefined, true)).toBe("Sofix 83%");
    expect(core.startHover(entry(0.8, "sorare", 0.8), undefined, true)).toBe("Sorare 80%"); // the same number twice says it once
  });
  it("names the number's own source on a small card", () => {
    expect(core.startHover(entry(0.9, "futbolfantasy", 0.8), undefined, false)).toBe("FF 90%");
    expect(core.startHover(entry(0.8, "sorare", 0.8), undefined, false)).toBe("Sorare 80%");
    expect(core.startHover(entry(0.83, "sofix"), undefined, false)).toBe("Sofix 83%");
    expect(core.startHover({ p: 0.83 }, undefined, false)).toBe("Sofix 83%");
  });
});

describe("the captain Sofix would pick on Sorare's builder", () => {
  it("is the card on the pitch with the highest xScore, first on a tie", () => {
    const card = (x: number | null, captain = false) => ({ x, captain });
    expect(core.captainPick([card(40), card(62), card(55)])).toBe(1);
    expect(core.captainPick([card(62), card(62)])).toBe(0);
    expect(core.captainPick([card(null), card(30)])).toBe(1); // a card with no number is passed over
  });
  it("says nothing once Sorare has that card as captain, or with no number to go on", () => {
    const card = (x: number | null, captain = false) => ({ x, captain });
    expect(core.captainPick([card(40), card(62, true)])).toBe(-1);
    expect(core.captainPick([card(40, true), card(62)])).toBe(1); // another captain: the pick still shows
    expect(core.captainPick([card(null), card(null)])).toBe(-1);
    expect(core.captainPick([])).toBe(-1);
  });
});

describe("the start badge colours, Sorare's own steps", () => {
  it("is red under 49.5%, yellow under 79.5%, Sorare's cyan from 80%", () => {
    expect([0, 0.3, 0.49].map(core.startLevel)).toEqual(["low", "low", "low"]);
    expect([0.5, 0.7, 0.79].map(core.startLevel)).toEqual(["medium", "medium", "medium"]);
    expect([0.8, 0.9, 1].map(core.startLevel)).toEqual(["high", "high", "high"]);
    expect(core.START_COLOURS).toEqual({ low: ["--c-score-veryLow", "#ff5a5a"], medium: ["--c-yellow-400", "#ffd914"], high: ["--c-onBase-success", "#00f3eb"] });
  });
});

describe("the team gauge on Sorare's builder", () => {
  // Five cards as the planner sees them (10,000 runs here); its own _draw (backend/app/sorare/planner.py) on 200,000 weeks gives 270.0, 177.2 to 356.4,
  // and 84.0% / 57.9% / 24.6% at 200, 260 and 320 (2% lineup bonus, the forward captain at +50%).
  const card = (pos: string, p: number, mu: number, sd: number | null, mult: number, game: string, venue: string, club: string, captain = false) => ({ p, mu, sd, mult, pos, game, venue, club, average: 40, captain });
  const pitch = [
    card("GK", 0.95, 48, 15, 1.05, "g1", "H", "a"),
    card("DEF", 0.9, 52, 16, 1.1, "g1", "H", "a"),
    card("MID", 0.8, 58, null, 1.0, "g2", "A", "b"),
    card("FWD", 0.85, 62, 20, 1.15, "g1", "A", "c", true),
    card("FWD", 0.6, 55, 18, 1.0, "g3", "H", "d"),
  ];
  const team = { captainBonus: 0.5, clubBonus: [2, 0.02] as [number, number], tiers: [{ need: 260, label: "500 XP" }, { need: 200, label: "250 XP" }, { need: 320, label: "1000 XP" }] };

  it("reads what the planner reads, within two points and two in a hundred", () => {
    const got = core.teamChances(pitch, team)!;
    expect(got.bonus).toBeCloseTo(0.02);
    expect(Math.abs(got.x - 270.0)).toBeLessThan(2);
    expect(Math.abs(got.lo - 177.2)).toBeLessThan(4);
    expect(Math.abs(got.hi - 356.4)).toBeLessThan(4);
    expect(got.tiers.map((t) => t.label)).toEqual(["250 XP", "500 XP", "1000 XP"]); // lowest first
    got.tiers.forEach((t, i) => expect(Math.abs(t.p - [0.84, 0.579, 0.246][i]!)).toBeLessThan(0.025));
    expect(core.teamChances(pitch, team)).toEqual(got); // the same pitch, the same numbers
  });

  it("drops the club bonus when too many cards share a club, and counts nothing for an empty pitch", () => {
    const same = pitch.map((c) => ({ ...c, club: "a" }));
    expect(core.teamChances(same, team)!.bonus).toBe(0);
    expect(core.teamChances([], team)).toBeNull();
  });

  it("puts the likeliest level in the centre with its neighbours either side", () => {
    const tiers = (...p: number[]) => p.map((v, i) => ({ need: 200 + 60 * i, label: `T${i + 1}`, p: v }));
    // ends on nothing 24%, T1 38%, T2 38%: T1 in the centre (a tie goes lower), nothing on the left, T2 on the right
    expect(core.teamRings(tiers(0.76, 0.38))).toEqual({ below: { label: "No reward", need: null, p: 0.24 }, at: { label: "T1", need: 200, p: 0.76 }, above: { label: "T2", need: 260, p: 0.38 } });
    // nothing is likeliest: no ring to its left
    expect(core.teamRings(tiers(0.2, 0.1))!.below).toBeNull();
    expect(core.teamRings(tiers(0.2, 0.1))!.at!.label).toBe("No reward");
    // the top tier is likeliest: no ring to its right
    const top = core.teamRings(tiers(0.99, 0.95, 0.9))!;
    expect(top.at!.label).toBe("T3");
    expect(top.above).toBeNull();
    expect(core.teamRings([])).toBeNull();
  });
});

describe("sorting and filtering Sorare's builder list", () => {
  const card = (x: number, more: Record<string, unknown> = {}) => ({ x, p: 0.9, pStart: 0.8, game: { win: 0.5, cleanSheet: 0.3, difficulty: 40, goalsAgainst: 1.1 }, ...more });
  const list = [card(40), null, card(70, { game: { win: 0.6, cleanSheet: 0.4, difficulty: 25, goalsAgainst: 0.8 } }), card(55, { xg: 0.3 }), card(55)];

  it("ranks best first, a tie keeps Sorare's order, a card with nothing goes last", () => {
    expect(core.listOrder(list, "xscore")).toEqual([3, 4, 0, 1, 2]);
    expect(core.listOrder(list, "fdr")).toEqual([1, 4, 0, 2, 3]); // lower is better: the 25 first
    expect(core.listOrder(list, "xg")).toEqual([1, 2, 3, 0, 4]); // only one has xG
    // xScore is Sofix's expected score, start chance counted, not the tile's score if he starts: a 5% starter does not lead
    expect(core.listOrder([card(4, { start: 54, bench: 1, pStart: 0.05 }), card(46, { start: 50, bench: 5 })], "xscore")).toEqual([1, 0]);
    expect(core.SORT_KEYS).toEqual(["xscore", "fdr", "start", "cs", "xg", "on"]);
    expect(core.FILTER_KEYS).toEqual(["xscore", "cs", "xg", "xga", "win", "start", "on", "day"]);
  });

  it("passes a card at or over a threshold, at or under one where less is better, and never one with no value", () => {
    expect(core.listPasses(card(50), [{ key: "xscore", at: 50 }])).toBe(true);
    expect(core.listPasses(card(49), [{ key: "xscore", at: 50 }])).toBe(false);
    expect(core.listPasses(card(60), [{ key: "xscore", at: 50 }, { key: "fdr", at: 30 }])).toBe(false); // difficulty 40 > 30
    expect(core.listPasses(card(60), [{ key: "xga", at: 1.1 }])).toBe(true);
    expect(core.listPasses(card(60), [{ key: "xg", at: 0.1 }])).toBe(false); // no xG: fades
    expect(core.listPasses(null, [])).toBe(true); // no filter, nothing faded
    expect(core.listPasses(null, [{ key: "xscore", at: 0 }])).toBe(false);
    // the comes-on chance from his last ten games, else the rate Sofix uses
    const rec = { benchRecord: { started: 2, on: 3, unused: 1, minsOn: 20, games: "SSOOOU", mins: [90, 90, 20, 20, 20, 0] } };
    expect(core.listValue(card(50, rec), "on")).toBe(0.75);
    expect(core.listValue(card(50, { benchedOn: 0.4 }), "on")).toBe(0.4);
  });

  it("filters on the kickoff day, Madrid time", () => {
    const sat = card(50, { match: { kickoff: "2026-11-07T21:30:00Z" } }); // 22:30 Saturday in Madrid
    const sun = card(50, { match: { kickoff: "2026-11-07T23:30:00Z" } }); // 00:30 Sunday in Madrid
    expect([core.listValue(sat, "day"), core.listValue(sun, "day")]).toEqual(["Sat", "Sun"]);
    expect(core.listPasses(sun, [{ key: "day", at: "Sat" }])).toBe(false);
  });

  it("names a chip and starts its threshold in the middle of the list", () => {
    expect(core.filterLabel({ key: "xscore", at: 50 })).toBe("xScore ≥ 50");
    expect(core.filterLabel({ key: "fdr", at: 40 })).toBe("FDR ≤ 40");
    expect(core.filterLabel({ key: "start", at: 0.7 })).toBe("Start ≥ 70%");
    expect(core.filterLabel({ key: "xg", at: 0.25 })).toBe("xG ≥ 0.25");
    expect(core.filterLabel({ key: "day", at: "Sat" })).toBe("Sat");
    expect(core.filterStart(list, "xscore")).toBe(55);
    const starts = [0.995, 0.995, 0.95, 0.9, 0.995].map((pStart) => card(50, { pStart }));
    expect(core.filterStart(starts, "start")).toBe(0.95); // the middle card (99.5%) passes; not ">99%" with almost nobody left
    expect(core.filterStart([card(50, { game: { difficulty: 41.5 } })], "fdr")).toBe(42); // less is better: rounded up
  });

  it("compares two cards row by row, the better value marked, a gap never better", () => {
    const rows = core.compareRows(card(62, { xd: 0.3 }), card(55, { game: { win: 0.6, cleanSheet: null, difficulty: 30, goalsAgainst: 1.1 } }));
    expect(rows.map((r) => [r.label, r.a, r.b, r.better])).toEqual([
      ["xScore", "62", "55", "a"],
      ["FDR", "40", "30", "b"],
      ["Win %", "50%", "60%", "b"],
      ["Clean sheet %", "30%", "—", null],
      ["xG against", "1.10", "1.10", null],
      ["xD", "0.30", "—", null],
    ]);
  });
});

describe("an Arcade lineup's chance to clear its step", () => {
  const e = (x: number) => ({ x, p: 0.9, pos: "MID" });
  const done = (raw: number) => ({ state: "finished", raw, multiplier: 1.1 });
  const ahead = (x: number) => ({ state: "to play", raw: null, multiplier: 1.1, entry: e(x) });

  it("banks what is finished and simulates the rest", () => {
    // 4 x 50 x 1.1 = 220 banked; the last card needs 140 / 1.1 = 127 raw: more than a score can be (100)
    expect(core.lineupChance(360, [done(50), done(50), done(50), done(50), ahead(60)])!.p).toBe(0);
    const near = core.lineupChance(260, [done(50), done(50), done(50), done(50), ahead(60)])!; // needs 40 / 1.1 = 36 from a 60
    expect(near.now).toBeCloseTo(220);
    expect(near.open).toBe(1);
    expect(near.p).toBeGreaterThan(0.75);
    expect(near.p).toBeLessThan(0.95); // 10% he does not play at all
  });

  it("says 100% once the target is reached, and a live card keeps what it has", () => {
    expect(core.lineupChance(200, [done(50), done(50), done(50), done(50)])!.p).toBe(1);
    const live = core.lineupChance(240, [done(50), done(50), done(50), done(50), { state: "live", raw: 30, multiplier: 1.1, entry: e(10) }])!;
    expect(live.now).toBeCloseTo(253);
    expect(live.p).toBe(1);
  });

  it("says nothing without a target, a bonus, or an answer for a card still to score", () => {
    expect(core.lineupChance(null, [ahead(60)])).toBeNull();
    expect(core.lineupChance(300, [{ state: "to play", raw: null, multiplier: null, entry: e(60) }])).toBeNull();
    expect(core.lineupChance(300, [{ state: "to play", raw: null, multiplier: 1, entry: null }])).toBeNull();
  });
});
