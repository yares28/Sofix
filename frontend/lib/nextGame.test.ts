import { describe, expect, it } from "vitest";
import { gameLine, nextGames, sourceChances } from "./nextGame";
import type { GameweekPlan, PlayerGame, PlayingPlayer } from "./play";

const game = (kickoff: string, extra: Partial<PlayerGame> = {}) =>
  ({ kickoff, competition: "laliga-es", opponent: "Getafe CF", opponentCrest: null, venue: "H", ...extra }) as PlayerGame;
const player = (name: string, games: PlayerGame[], extra: Partial<PlayingPlayer> = {}) => ({ name, games, ...extra }) as PlayingPlayer;
const week = (number: number, players: PlayingPlayer[]) => ({ gameweek: { number }, playing: { players } }) as unknown as GameweekPlan;

const NOW = new Date("2026-10-01T10:00:00Z");

describe("the chance to start each source gives", () => {
  it("lists Futbol Fantasy, Sorare and Sofix in the order the app trusts them, with the one it uses", () => {
    const one = player("A", [], { sources: { sofix: 0.54, futbolfantasy: 0.8, sorare: 0.7 }, startSource: "sorare" });
    expect(sourceChances(one)).toEqual({
      list: [
        { source: "futbolfantasy", percent: 80 },
        { source: "sorare", percent: 70 },
        { source: "sofix", percent: 54 },
      ],
      used: "sorare",
    });
  });

  it("falls back to his one chance when the payload has no split, and to nothing when it has none", () => {
    expect(sourceChances(player("A", [], { pStart: 0.6, startSource: "sofix" }))).toEqual({ list: [{ source: "sofix", percent: 60 }], used: "sofix" });
    expect(sourceChances(player("A", []))).toEqual({ list: [], used: null });
  });
});

describe("his next game", () => {
  it("is the earliest game still to come over every week the payload holds, with the chances of that game", () => {
    const weeks = [
      week(19, [player("A", [game("2026-09-30T18:00:00Z")], { pStart: 0.9, startSource: "sofix" })]),
      week(21, [player("A", [game("2026-10-10T16:30:00Z", { opponent: "RC Celta", venue: "A" })], { pStart: 0.8, startSource: "futbolfantasy", sources: { futbolfantasy: 0.8, sorare: 0.7, sofix: 0.5 } })]),
      week(20, [player("A", [game("2026-10-17T16:30:00Z")], { pStart: 0.5, startSource: "sofix" })]),
    ];
    const next = nextGames(weeks, NOW).get("A")!;
    expect(next.game.opponent).toBe("RC Celta");
    expect(next.game.venue).toBe("A");
    expect(next.week).toBe(21);
    expect(next.chances.used).toBe("futbolfantasy");
    expect(next.chances.list).toHaveLength(3);
  });

  it("is keyed by his player slug when the payload has one, else by his name", () => {
    const weeks = [week(21, [player("Pau Cubarsí", [game("2026-10-10T16:30:00Z")], { player: "pau-cubarsi" })])];
    const map = nextGames(weeks, NOW);
    expect(map.get("pau-cubarsi")?.game.opponent).toBe("Getafe CF");
    expect(map.get("Pau Cubarsí")).toBeUndefined();
  });

  it("uses a later game's own number when the first has kicked off, and no split of the sources", () => {
    const weeks = [
      week(21, [
        player("A", [game("2026-09-30T18:00:00Z"), game("2026-10-03T18:00:00Z", { pStart: 0.7, pOn: 0.8, startSource: "futbolfantasy" })], { pStart: 0.9, startSource: "sofix", sources: { sofix: 0.9 } }),
      ]),
    ];
    const next = nextGames(weeks, NOW).get("A")!;
    expect(next.kickoff).toBe("2026-10-03T18:00:00Z");
    expect(next.chances).toEqual({ list: [{ source: "futbolfantasy", percent: 70 }], used: "futbolfantasy" });
  });

  it("is absent for a player with no game still to come", () => {
    expect(nextGames([week(19, [player("A", [game("2026-09-30T18:00:00Z")])])], NOW).size).toBe(0);
  });
});

describe("the line under a card", () => {
  it("says the opponent, the side he plays for and the kickoff in Madrid time", () => {
    expect(gameLine(game("2026-10-10T16:30:00Z"))).toBe("v Getafe CF · Sat 18:30");
    expect(gameLine(game("2026-10-10T16:30:00Z", { venue: "A", opponent: "RC Celta" }))).toBe("@ RC Celta · Sat 18:30");
  });
});
