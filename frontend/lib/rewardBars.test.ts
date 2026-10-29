import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, firstPaid, leagueArt, pinnedKeys, prizeKind, prizeLabel, rankLabel, readPrefs, readable, rungs, toggle } from "./rewardBars";

const level = (lo: number, hi: number, prize: { cash?: number; essence?: number; card?: boolean; xp?: number }, bar: number | null) => ({
  lo, hi, cash: prize.cash ?? 0, essence: prize.essence ?? 0, card: prize.card ?? false, xp: prize.xp ?? 0, bar,
});
const laliga = {
  key: "LALIGA EA SPORTS | Limited", name: "LaLiga", rarity: "limited", group: "In-season", kind: "rank" as const, size: null, paidTo: 1500,
  bar: 317.26, low: 305.74, high: 332.3, latest: 332.3, samples: 5, byWeek: [{ week: "23–27 Oct", score: 332.3 }],
  reward: { cash: 0, essence: 250, card: false },
  ladder: [level(1, 1, { cash: 2000 }, 525), level(651, 1500, { essence: 250 }, 317.26), level(1501, 2000, { xp: 1000 }, 295.39)],
};
const PLAYED = ["LALIGA EA SPORTS | Limited", "Champion | Limited"];

describe("reward bars", () => {
  it("reads the block the job writes, an older one without XP or played too, and refuses anything else", () => {
    const block = { version: 1, latest: "23–27 Oct", weeks: ["23–27 Oct"], competitions: [laliga], unread: [], played: PLAYED };
    expect(readable(block)?.played).toEqual(PLAYED);
    const old = { ...block, played: undefined, competitions: [{ ...laliga, ladder: [{ lo: 1, hi: 1, cash: 10, essence: 0, card: false, bar: 500 }] }] };
    expect(readable(old)?.played).toEqual([]);
    expect(readable(old)?.competitions[0]?.ladder[0]?.xp).toBe(0);
    expect(readable({ ...block, version: 2 })).toBeNull();
    expect(readable({ ...block, competitions: [{ ...laliga, kind: "guess" }] })).toBeNull();
  });

  it("names each level by its ranks and what it gives; an XP level is never paid", () => {
    expect(rankLabel("rank", { lo: 1, hi: 1 })).toBe("1st");
    expect(rankLabel("rank", { lo: 22, hi: 22 })).toBe("22nd");
    expect(rankLabel("rank", { lo: 651, hi: 1500 })).toBe("651–1,500");
    expect(rankLabel("room", { lo: 3, hi: 3 })).toBe("3rd");
    expect(rankLabel("target", { lo: 2, hi: 2 })).toBe("Step 2");
    expect(prizeLabel({ cash: 10, essence: 50, card: false })).toBe("$10 + 50 essence");
    expect(prizeLabel({ cash: 0, essence: 0, card: true })).toBe("a card");
    expect(prizeLabel({ cash: 0, essence: 0, card: false, xp: 1000 })).toBe("1,000 XP");
    expect(prizeKind(laliga.ladder[2]!)).toBe("xp");
    expect(firstPaid(laliga.ladder)).toBe(1); // 250 essence at 317, the XP level below does not count
  });

  it("puts a Pro board's best step on top, like every other ladder", () => {
    const pro = { kind: "target" as const, ladder: [level(2, 2, { cash: 10 }, 380), level(6, 6, { cash: 8000 }, 550)] };
    expect(rungs(pro).map((l) => l.lo)).toEqual([6, 2]);
  });

  it("the competitions you play are pinned first, unless you unpin them; your own pins follow", () => {
    expect(pinnedKeys(DEFAULT_PREFS, PLAYED)).toEqual(PLAYED);
    const unpinned = toggle(DEFAULT_PREFS, "Champion | Limited", "pin", PLAYED);
    expect(pinnedKeys(unpinned, PLAYED)).toEqual(["LALIGA EA SPORTS | Limited"]);
    expect(pinnedKeys(toggle(unpinned, "Champion | Limited", "pin", PLAYED), PLAYED)).toEqual(PLAYED); // pinned back
    const mine = toggle(DEFAULT_PREFS, "All Star | Rare", "pin", PLAYED);
    expect(pinnedKeys(mine, PLAYED)).toEqual([...PLAYED, "All Star | Rare"]);
    expect(pinnedKeys(toggle(mine, "LALIGA EA SPORTS | Limited", "hide", PLAYED), PLAYED)).toEqual(["Champion | Limited", "All Star | Rare"]);
  });

  it("a saved choice from before played pins still reads; a broken one falls back to the default", () => {
    expect(readPrefs(JSON.stringify({ pinned: ["x"], hidden: [] }))).toEqual({ pinned: ["x"], hidden: [], unpinned: [] });
    expect(readPrefs("{oops")).toEqual(DEFAULT_PREFS);
  });

  it("draws a league with Sorare's own icon and colour, and has none for a league it does not know", () => {
    expect(leagueArt("Champion | Limited")?.icon).toBe("https://frontend-assets.sorare.com/football/so5_league/seasonal-champions/icon.svg?v=1");
    expect(leagueArt("European Champions | Limited")?.icon).toMatch(/^https:\/\/assets\.sorare\.com\//);
    expect(leagueArt("Europa Contenders | Pro")).toBeNull();
  });
});
