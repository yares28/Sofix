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
  drawerCards: (plan: { pics?: unknown[]; cardsUsed?: number }) => { pics: string[]; more: number };
  DRAWER_CARDS: number;
  benchOnChance: (entry: { pStart?: number; pOn?: number }) => number | null;
  comesOnScore: (entry: { on?: number; bench?: number }) => { score: number; words: string; tab: string };
  agoLabel: (iso: unknown, nowMs: number) => string | null;
  freshLabel: (iso: unknown, nowMs: number) => string | null;
  STALE_HOURS: number;
  staleness: (entry: { at?: string; over?: boolean }, nowMs: number) => { kind: "over" | "old"; hours: number } | null;
  topThree: (items: { key: string; x: number }[]) => Map<string, number>;
  isPickHeading: (text: unknown) => boolean;
  fixtureOf: (url: unknown) => string | null;
  gamesCount: (entry: { fixtures?: unknown }) => number;
  fixtureLine: (fixture: { kickoff?: string; venue?: string; opponent?: string }, timeZone?: string) => string | null;
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


describe("the cards of the plan in the drawer", () => {
  const pic = (n: number) => `https://assets.sorare.com/card/${n}/picture/x.png`;

  it("shows every card, and says how many more the plan uses when the lineup shows fewer", () => {
    expect(core.drawerCards({ pics: [1, 2, 3, 4, 5].map(pic), cardsUsed: 9 })).toEqual({ pics: [1, 2, 3, 4, 5].map(pic), more: 4 });
    expect(core.drawerCards({ pics: [1, 2, 3].map(pic), cardsUsed: 3 })).toEqual({ pics: [1, 2, 3].map(pic), more: 0 });
  });

  it("keeps a place for the \"+N\" when there are more cards than the drawer has room for", () => {
    const many = Array.from({ length: 14 }, (_, n) => pic(n));
    const shown = core.drawerCards({ pics: many, cardsUsed: 14 });
    expect(shown.pics).toEqual(many.slice(0, core.DRAWER_CARDS - 1));
    expect(shown.more).toBe(14 - (core.DRAWER_CARDS - 1));
  });

  it("draws nothing it should not: only Sorare's own pictures, and no \"+N\" from a count that is lower", () => {
    expect(core.drawerCards({ pics: [pic(1), "https://evil.example/x.png", 7], cardsUsed: 2 })).toEqual({ pics: [pic(1)], more: 1 });
    expect(core.drawerCards({ pics: [pic(1), pic(2)], cardsUsed: 1 }).more).toBe(0);
    expect(core.drawerCards({ pics: [pic(1)] })).toEqual({ pics: [pic(1)], more: 0 });
    expect(core.drawerCards({})).toEqual({ pics: [], more: 0 });
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

  it("writes a game as a day, a time and an opponent, with 'v' at home and 'at' away", () => {
    const away = { kickoff: "2026-10-02T16:45:00Z", venue: "A", opponent: "Hungary" };
    expect(core.fixtureLine(away, "Europe/Madrid")).toBe("Fri 18:45 · at Hungary");
    expect(core.fixtureLine({ ...away, kickoff: "2026-10-05T16:45:00Z", venue: "H", opponent: "Northern Ireland" }, "Europe/Madrid")).toBe("Mon 18:45 · v Northern Ireland");
    expect(core.fixtureLine(away, "UTC")).toBe("Fri 16:45 · at Hungary");
  });

  it("says nothing for a game it cannot read", () => {
    expect(core.fixtureLine({ venue: "H", opponent: "Spain" })).toBeNull();
    expect(core.fixtureLine({ kickoff: "soon", venue: "H", opponent: "Spain" })).toBeNull();
    expect(core.fixtureLine({ kickoff: "2026-10-02T16:45:00Z", venue: "H" })).toBeNull();
  });
});
