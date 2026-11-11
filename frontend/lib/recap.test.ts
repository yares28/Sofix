import { describe, expect, it, vi } from "vitest";
import * as table from "./table";
import recorded from "../e2e/fixtures/grid-response.json";
import { bestCards, daysSince, latestPlayed, lockText, madridDay, planRows, roundBoard, skyline, tableAfter, weekGames, weekNews } from "./recap";
import type { Lineup, Plan, PlayerGame, PlayingPlayer } from "./play";
import type { ApiResponse, FixtureGrid } from "./types";

const grid = (recorded as ApiResponse<FixtureGrid>).data!;
const col = (number: number) => grid.matchdays.findIndex((md) => md.number === number);

const game = (extra: Partial<PlayerGame> = {}): PlayerGame => ({
  kickoff: "2026-10-10T12:00:00Z", competition: "LaLiga", opponent: "Athletic Club", opponentCrest: null, venue: "H", ...extra,
});
const player = (name: string, x: number, extra: Partial<PlayingPlayer> = {}) =>
  ({ name, x, pos: "MID", pic: `${name}.png`, rarity: "limited", games: [game()], ...extra }) as PlayingPlayer;

describe("bestCards", () => {
  it("takes the best by xScore across positions, ties by name, with his first game and start chance", () => {
    const cards = bestCards([player("B", 40), player("A", 40), player("C", 55, { pStart: 0.6, games: [game({ pStart: 0.95, startSource: "futbolfantasy", venue: "A", opponent: "Elche" })] })], 2);
    expect(cards.map((c) => c.name)).toEqual(["C", "A"]);
    expect(cards[0]).toMatchObject({ start: 0.95, source: "futbolfantasy", game: "at Elche, Sat" });
  });
});

describe("skyline", () => {
  it("counts places moved in the round: the place after it against the place after the round before", () => {
    const column = col(8);
    const after = table.predictedTable(grid, { through: column, simulations: 0 });
    const before = new Map(table.predictedTable(grid, { through: column - 1, simulations: 0 }).map((r) => [r.team.code, r.position]));
    const rows = skyline(grid, column);
    expect(rows.map((r) => r.position)).toEqual(after.map((r) => r.position));
    for (const row of rows) expect(row.moved).toBe(before.get(row.team.code)! - row.position);
    expect(rows.reduce((sum, r) => sum + r.moved, 0)).toBe(0);
  });
  it("marks LaLiga's European places and relegation, and gives each club its next game's FDR after the round", () => {
    const rows = skyline(grid, col(8));
    expect(rows.slice(0, 4).every((r) => r.zone === "zone-ucl")).toBe(true);
    expect(rows[4]!.zone).toBe("zone-uel");
    expect(rows[5]!.zone).toBe("zone-uecl");
    expect(rows.slice(-3).every((r) => r.zone === "zone-rel")).toBe(true);
    const team = grid.teams.find((t) => t.code === rows[0]!.team.code)!;
    const next = team.cells.slice(col(8) + 1).find((c) => c.length)?.[0];
    expect(rows[0]!.next?.value ?? null).toBe(next?.prediction?.difficulty ?? null);
  });
  it("finds the latest round with a finished game", () => {
    const latest = latestPlayed(grid);
    expect(grid.teams.some((t) => t.cells[latest]?.some((c) => c.status === "finished"))).toBe(true);
    expect(grid.teams.some((t) => t.cells.slice(latest + 1).some((cells) => cells.some((c) => c.status === "finished")))).toBe(false);
  });
});

describe("weekGames", () => {
  it("takes every game of the week's days from any round, once, in kickoff order, with only what the stubs draw", () => {
    const round = roundBoard(grid, col(8));
    const days = round.map((m) => madridDay(m.kickoff)).sort();
    const games = weekGames(grid, "PD", days[0]!, days.at(-1)!);
    expect(games.map((g) => g.id).sort()).toEqual(round.map((m) => m.fixtureId).sort());
    expect(new Set(games.map((g) => g.id)).size).toBe(games.length);
    expect(games.map((g) => Date.parse(g.kickoff))).toEqual([...games.map((g) => Date.parse(g.kickoff))].sort((a, b) => a - b));
    const forecast = games.find((g) => g.win !== null)!;
    expect(forecast.win! + forecast.draw! + forecast.loss!).toBeCloseTo(1, 2);
    expect(forecast.home).toMatchObject({ name: expect.any(String), code: expect.any(String) });
    expect(Object.keys(forecast).sort()).toEqual(["away", "both", "comp", "confirmed", "cs", "day", "draw", "home", "id", "kickoff", "live", "loss", "score", "win", "xd", "xg"]);
  });
  it("leaves out games outside the window and gives none for a week without games", () => {
    const round = roundBoard(grid, col(8));
    const first = madridDay(round[0]!.kickoff);
    expect(weekGames(grid, "PD", first, first).every((g) => g.day === first)).toBe(true);
    expect(weekGames(grid, "PD", "1999-01-01", "1999-01-07")).toEqual([]);
  });
  it("says a game Madrid's day, not UTC's: 23:30 UTC on a Saturday is Sunday in Madrid", () => {
    expect(madridDay("2026-11-07T23:30:00Z")).toBe("2026-11-08");
  });
});

describe("roundBoard and tableAfter", () => {
  it("prepares the points-only round table without simulating unused finish probabilities", () => {
    const expected = table.predictedTable(grid, { through: col(8) }).map(row => [row.team.code, row.position, row.points, row.projectedPoints, row.currentPosition - row.position]);
    const predict = vi.spyOn(table, "predictedTable");
    const shown = tableAfter(grid, col(8));
    expect(predict.mock.calls[0]?.[1]).toMatchObject({ through: col(8), simulations: 0 });
    expect(shown.map(row => [row.team.code, row.position, row.now, row.after, row.moved])).toEqual(expected);
    predict.mockRestore();
  });
  it("keeps each selected-round fixture's backend FDR, including doubles and missing predictions", () => {
    const changed = structuredClone(grid), column = col(8), team = changed.teams[0]!;
    const game = team.cells[column]![0]!;
    team.cells[column] = [game, { ...game, fixture_id: game.fixture_id + 99999, prediction: null }];
    const row = tableAfter(changed, column).find(r => r.team.code === team.code)!;
    expect(row.fdr).toHaveLength(2);
    expect(row.fdr[0]).toMatchObject({ id: game.fixture_id, value: game.prediction?.difficulty ?? null, bucket: game.prediction?.bucket ?? null });
    expect(row.fdr[1]).toMatchObject({ value: null, bucket: null });
    team.cells[column] = [];
    expect(tableAfter(changed, column).find(r => r.team.code === team.code)!.fdr).toEqual([]);
  });
  it("draws each match from the home side's forecast, the away side's own numbers kept", () => {
    const board = roundBoard(grid, col(8));
    expect(board.length).toBeGreaterThan(0);
    for (const match of board) {
      if (match.home.win === null || match.away.win === null || match.draw === null) continue;
      expect(match.home.win + match.draw + match.away.win).toBeCloseTo(1, 2);
      expect(match.home.favourite && match.away.favourite).toBe(false);
    }
  });

  it("orders the table after the round and counts places moved", () => {
    const rows = tableAfter(grid, col(8));
    expect(rows).toHaveLength(grid.teams.length);
    expect(rows.map((r) => r.position)).toEqual(rows.map((_, i) => i + 1));
    for (const row of rows) expect(row.after).toBeGreaterThanOrEqual(row.now);
  });
});

describe("planRows", () => {
  const lineup = (comp: string, x: number, tiers: Lineup["tiers"], pCard = 0): Lineup =>
    ({ comp, x, tiers, pCard, pReturn: tiers.reduce((s, t) => s + t.p, 0) + pCard, eEss: 10, eCash: 0 }) as Lineup;
  it("splits cash or essence from other prizes and puts the likeliest reward first", () => {
    const rows = planRows({ lineups: [lineup("A", 300, [{ essence: 100, p: 0.1 }]), lineup("B", 280, [{ cash: 5, p: 0.05 }, { essence: 50, p: 0.3 }], 0.02)] } as Plan);
    expect(rows.map((r) => r.lineup.comp)).toEqual(["B", "A"]);
    expect(rows[0]).toMatchObject({ other: 0.02 });
    expect(rows[0]!.cashOrEssence).toBeCloseTo(0.35, 5);
  });
});

describe("weekNews", () => {
  const ff = (kind: "out" | "doubt" | "available", since: string, note: string) => [game({ pStart: 0.5, ffStatus: { kind, cause: "Sobrecarga en el cuádriceps", since, note } })];
  it("reads how long ago a note started", () => {
    expect(daysSince("Desde 29/09 (6 días)")).toBe(6);
    expect(daysSince("Desde 02/10 (1 día)")).toBe(1);
    expect(daysSince(undefined)).toBeNull();
  });
  it("lists this week's knocks and the players cleared to play, not a long-standing injury", () => {
    const news = weekNews(
      [
        player("New", 40, { games: ff("doubt", "Desde 29/09 (6 días)", "Duda para la jornada 8") }),
        player("Old", 40, { games: ff("out", "Desde 12/08 (54 días)", "Baja hasta enero") }),
        player("Back", 40, { games: ff("available", "Desde 02/10 (3 días)", "Disponible para la jornada 8") }),
        player("Fit", 40),
      ],
      8,
      new Date("2026-10-05T10:00:00Z"),
    );
    expect(news.hurt.map((n) => n.name)).toEqual(["New"]);
    expect(news.back.map((n) => n.name)).toEqual(["Back"]);
    expect(news.hurt[0]).toMatchObject({ note: "Doubt for round 8", since: "since 29 Sep" });
    expect(news.back[0]!.note).toBe("Available for round 8");
  });
});

describe("lockText", () => {
  it("counts down in days, then hours, then minutes, and says when it has locked", () => {
    expect(lockText("2026-10-09T14:00:00Z", new Date("2026-10-05T10:00:00Z"))).toBe("Locks Fri 16:00, in 4 days");
    expect(lockText("2026-10-09T14:00:00Z", new Date("2026-10-09T09:00:00Z"))).toBe("Locks Fri 16:00, in 5 h");
    expect(lockText("2026-10-09T14:00:00Z", new Date("2026-10-09T13:50:00Z"))).toBe("Locks Fri 16:00, in 10 min");
    expect(lockText("2026-10-09T14:00:00Z", new Date("2026-10-09T15:00:00Z"))).toBe("Locked Fri 16:00");
  });
});
