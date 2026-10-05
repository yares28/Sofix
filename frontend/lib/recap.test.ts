import { describe, expect, it } from "vitest";
import recorded from "../e2e/fixtures/grid-response.json";
import { bestCards, daysSince, lockText, planRows, roundBoard, tableAfter, weekNews } from "./recap";
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

describe("roundBoard and tableAfter", () => {
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
