import { describe, expect, it } from "vitest";
import { europeGames } from "./europe";
import type { GameweekPlan, PlayerGame, PlayingPlayer } from "./play";
import type { Week } from "./weeks";

const game = (over: Partial<PlayerGame>): PlayerGame => ({ kickoff: "2026-10-14T19:00:00Z", competition: "uefa-champions-league", opponent: "Roma", opponentCrest: null, venue: "H", ...over });
const player = (name: string, club: string, games: PlayerGame[]) => ({ name, player: name, club, crest: `${club}.png`, games }) as unknown as PlayingPlayer;
const plan = (players: PlayingPlayer[]) => ({ playing: { players } }) as unknown as GameweekPlan;
const week = (id: string, from: string, gw: string | null) => ({ id, from, gw }) as Week;

describe("europeGames", () => {
  it("keeps only European games of your players, one row per match, labelled with the competition", () => {
    const players = [
      player("a", "Atlético Madrid", [game({ opponent: "Stuttgart", venue: "A", opponentCrest: "stu.png" }), game({ competition: "laliga-es", opponent: "Getafe" })]),
      player("b", "Atlético Madrid", [game({ opponent: "Stuttgart", venue: "A" })]),
      player("c", "Stuttgart", [game({ opponent: "Atlético Madrid", venue: "H" })]),
      player("d", "Getafe", [game({ competition: "uefa-europa-conference-league", kickoff: "2026-10-15T16:45:00Z", opponent: "Lugano" })]),
    ];
    const gw22 = week("2026-10-13", "2026-10-13T14:00:00Z", "22");
    const rows = europeGames(plan(players), gw22, [gw22]);
    expect(rows.map((row) => [row.competition, row.home.name, row.away.name, row.players])).toEqual([
      ["Champions League", "Stuttgart", "Atlético Madrid", 3],
      ["Conference League", "Getafe", "Lugano", 1],
    ]);
    expect(rows[0]!.home.crest).toBe("stu.png");
  });

  it("a game shows under one week when two LaLiga rounds share its Sorare game week", () => {
    const players = [player("a", "Real Betis", [game({ kickoff: "2026-10-21T19:00:00Z", opponent: "Feyenoord" })])];
    const first = week("2026-10-17", "2026-10-17T14:00:00Z", "24");
    const second = week("2026-10-21", "2026-10-21T17:00:00Z", "24");
    expect(europeGames(plan(players), first, [first, second])).toHaveLength(0);
    expect(europeGames(plan(players), second, [first, second])).toHaveLength(1);
  });

  it("nothing without a Sorare plan", () => {
    expect(europeGames(null, week("x", "2026-10-13T14:00:00Z", "22"), [])).toEqual([]);
  });
});
