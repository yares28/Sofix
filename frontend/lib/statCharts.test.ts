import { describe, expect, it } from "vitest";
import type { CollectionCard } from "./play";
import { AXES, chartWindow, clubShares, edge, lookAlikes, ordinal, profiles, scatterField, standing, valueOf, type ChartModel } from "./statCharts";

const KEYS = ["goals", "poss_won", ...AXES.FWD.filter((k) => k !== "goals")];
const values = (goals: number | null, possWon: number | null, rest = 1) => KEYS.map((k) => (k === "goals" ? goals : k === "poss_won" ? possWon : rest));
const player = (slug: string, pos: "FWD" | "MID", league: string, club: string, goals: number | null, possWon: number | null, rest = 1): ChartModel["players"][number] => ({
  slug, name: slug.toUpperCase(), pos, league, club, crest: null, card: `https://assets.sorare.com/card/${slug}.png`,
  windows: { l10: { starts: 10, avg: 50 + (goals ?? 0) * 10, values: values(goals, possWon, rest) }, cur: null },
});
const model: ChartModel = {
  asOf: "2026-10-25",
  keys: KEYS,
  onSheet: {},
  players: [
    player("a", "FWD", "LaLiga", "Getafe", 1.2, null, 3),
    player("b", "FWD", "LaLiga", "Getafe", 0.8, null, 3),
    player("c", "FWD", "LaLiga", "Getafe", 0.2, null, 1),
    player("d", "FWD", "LaLiga", "Getafe", 0, null, 1),
    player("e", "FWD", "Premier League", "Arsenal", 1.1, null, 3),
    player("m", "MID", "LaLiga", "Getafe", 0, 5, 2),
  ],
};
const w = chartWindow(model, "l10");

describe("chartWindow", () => {
  it("keeps the window's players and draws your rarest card", () => {
    const yours = [
      { player: "a", pic: "limited.png", rarity: "limited", inSeason: true },
      { player: "a", pic: "rare.png", rarity: "rare", inSeason: true },
    ] as CollectionCard[];
    const mine = chartWindow(model, "l10", yours);
    expect(mine.players.find((p) => p.slug === "a")).toMatchObject({ mine: true, card: "rare.png" });
    expect(mine.players.find((p) => p.slug === "b")).toMatchObject({ mine: false, card: "https://assets.sorare.com/card/b.png" });
    expect(chartWindow(model, "cur").players).toEqual([]); // nobody has three starts this season
  });
});

describe("scatterField", () => {
  it("leaves out a player off the stat's sheet instead of drawing him at 0", () => {
    const field = scatterField(w, { league: "LaLiga", pos: "ALL" }, "poss_won", "avg");
    expect(field.players.map((p) => p.slug)).toEqual(["m"]);
    expect(scatterField(w, { league: "LaLiga", pos: "ALL" }, "goals", "avg").players).toHaveLength(5); // a 0 is a real 0
  });

  it("says why it is empty", () => {
    expect(scatterField(w, { league: "LaLiga", pos: "FWD" }, "poss_won", "avg").empty).toBe("Possession won is not on a FWD's stat sheet");
    expect(scatterField(w, { league: "Serie A", pos: "ALL" }, "goals", "avg").empty).toBe("Nobody with enough starts here yet");
  });
});

describe("standing", () => {
  it("ranks from the top and ties share a place", () => {
    expect(standing([3, 2, 2, 1], 2)).toEqual({ rank: 2, of: 4 });
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd"]);
  });
});

describe("profiles and look-alikes", () => {
  it("places each player against his position in every league, ties counted half", () => {
    const prof = profiles(w, "FWD");
    const goals = AXES.FWD.indexOf("goals");
    expect(prof.get("a")![goals]).toBe(0.9); // above 4 of 5, his own value counted half
    expect(prof.get("d")![goals]).toBe(0.1);
    expect(prof.has("m")).toBe(false);
    expect(edge(prof.get("a")!, "FWD")).toEqual({ top: 10, key: "goals" });
  });

  it("finds the closest players of his position, from one league when asked", () => {
    const hub = w.players.find((p) => p.slug === "a")!;
    const all = lookAlikes(w, hub, "ALL");
    expect(all.map((x) => x.player.slug)).toEqual(["e", "b", "c", "d"]);
    expect(all[0]!.like).toBeGreaterThan(all[3]!.like);
    expect(all.find((x) => x.player.slug === "d")!.apart).toMatchObject({ more: false });
    expect(lookAlikes(w, hub, "LaLiga").map((x) => x.player.slug)).toEqual(["b", "c", "d"]);
  });
});

describe("clubShares", () => {
  it("shares a club's stat among its players and drops clubs with too few of them", () => {
    const clubs = clubShares(w, "LaLiga", "goals");
    expect(clubs.map((c) => c.name)).toEqual([]); // Getafe: three forwards score, the fourth and the midfielder do not
    const passing = clubShares(w, "LaLiga", "accurate_pass");
    expect(passing).toHaveLength(1);
    expect(passing[0]!.players.map((p) => p.player.slug)).toEqual(["a", "b", "m", "c", "d"]);
    expect(passing[0]!.players.reduce((s, p) => s + p.share, 0)).toBeCloseTo(1);
    expect(valueOf(w, w.players[0]!, "avg")).toBe(62);
  });
});
