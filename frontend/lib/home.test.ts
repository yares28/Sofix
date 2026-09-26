import { describe, expect, it } from "vitest";
import recorded from "../e2e/fixtures/grid-response.json";
import { SHOCK, runStats } from "./grid";
import {
  boardHref, chanceLabel, dateRange, difficultyMosaic, fixtureDays, gameweekHead, tableSummary,
} from "./home";
import { gameweekMatches } from "./matches";
import type { ApiResponse, FixtureGrid, GridCell, GridTeam } from "./types";

// The recorded grid the browser tests use: GW1–GW6 played, GW7 under way, a break, then GW8 on 9 Oct.
const grid = (recorded as ApiResponse<FixtureGrid>).data!;
const col = (number: number) => grid.matchdays.findIndex((md) => md.number === number);

describe("date ranges", () => {
  it("writes them the board's way", () => {
    expect(dateRange("2026-10-09T19:00:00Z", "2026-10-12T19:00:00Z")).toBe("9–12 Oct");
    expect(dateRange("2026-09-30T19:00:00Z", "2026-10-02T19:00:00Z")).toBe("30 Sep – 2 Oct");
    expect(dateRange("2026-10-25T00:00:00Z", "2026-10-25T00:00:00Z")).toBe("25 Oct");
  });
});

describe("head", () => {
  it("counts the days and hours to the first kickoff of a coming gameweek", () => {
    const first = Date.parse(grid.matchdays[col(8)]!.date_from);
    expect(first).toBe(Math.min(...gameweekMatches(grid, col(8)).matches.map((m) => Date.parse(m.kickoff))));
    const head = gameweekHead(grid, col(8), new Date(first - (17 * 24 + 5) * 3_600_000 - 60_000));
    expect(head.state).toMatchObject({ kind: "upcoming", days: 17, hours: 5, confirmed: true });
    expect(head.number).toBe(8);
  });

  it("shows a gameweek under way as games done out of games", () => {
    const { state } = gameweekHead(grid, col(7), new Date("2026-09-19T20:00:00Z"));
    expect(state.kind).toBe("live");
    if (state.kind === "live") expect(state.played).toBeLessThan(state.total);
  });

  it("counts the shocks of a played gameweek with the board's own threshold", () => {
    // GW6 is done although Levante v Athletic moved to 21 Oct: the backend's matchday flag decides.
    const { state } = gameweekHead(grid, col(6), new Date("2026-09-21T12:00:00Z"));
    const done = gameweekMatches(grid, col(6)).matches.filter((m) => m.homeCell.status === "finished");
    const shocks = done.filter((m) => m.homeCell.review && m.homeCell.review.surprise < SHOCK).length;
    expect(state).toEqual({ kind: "played", shocks, total: done.length });
    expect(done.length).toBe(9);
  });

  it("is under way from the first regular kickoff, even before a result arrives", () => {
    const first = Date.parse(grid.matchdays[col(8)]!.date_from);
    expect(gameweekHead(grid, col(8), new Date(first + 60_000)).state).toMatchObject({ kind: "live", played: 0 });
  });

  it("shows how the matches fall across the days and names the clearest favourite", () => {
    const head = gameweekHead(grid, col(8), new Date("2026-09-26T12:00:00Z"));
    expect(head.days.map((day) => [day.weekday, day.day, day.matches, day.done])).toEqual([
      ["Fri", "9", 1, 0],
      ["Sat", "10", 4, 0],
      ["Sun", "11", 4, 0],
      ["Mon", "12", 1, 0],
    ]);
    expect(head.spotlight).toMatchObject({
      label: "Clearest",
      pick: "home",
      home: { code: "FCB" },
      away: { code: "GET" },
      detail: "Barcelona to win",
      score: null,
    });
    expect(head.spotlight?.chance).toBeGreaterThan(0.7);
    expect(head.spotlight?.bar?.home).toBe(head.spotlight?.chance);
  });

  it("points a played gameweek at its least expected result", () => {
    const head = gameweekHead(grid, col(6), new Date("2026-09-21T12:00:00Z"));
    expect(head.spotlight).toMatchObject({
      label: "Least expected",
      pick: null,
      home: { code: "ALA" },
      away: { code: "VAL" },
      score: [0, 1],
      bar: null,
    });
    expect(head.days.some((day) => day.done < day.matches)).toBe(true); // the game moved to October
  });

  it("points a live gameweek at the match that is on", () => {
    const head = gameweekHead(grid, col(7), new Date("2026-09-19T20:00:00Z"));
    expect(head.spotlight?.label).toBe("Live");
    expect(head.days.some((day) => day.done > 0 && day.done < day.matches)).toBe(true);
  });
});

describe("fixtures tile", () => {
  it("groups a coming gameweek by day, in kickoff order, naming the likelier winner", () => {
    const days = fixtureDays(grid, col(8));
    const rows = days.flatMap((d) => d.rows);
    expect(rows).toHaveLength(gameweekMatches(grid, col(8)).matches.length);
    expect(days[0]!.label).toMatch(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} [A-Z][a-z]{2}$/);
    for (const row of rows) {
      expect(row.when).toMatch(/^(\d{2}:\d{2}|TBC)$/);
      if (row.chances && row.lead) {
        expect(row.lead.chance).toBe(Math.max(row.chances.home, row.chances.away));
      }
    }
  });

  it("shows a played game's score and the chance the board gave it", () => {
    const rows = fixtureDays(grid, col(6)).flatMap((d) => d.rows);
    const played = rows.filter((r) => r.status === "finished");
    expect(played.every((r) => r.when === "FT" && r.score !== null && r.lead === null)).toBe(true);
    expect(played.some((r) => r.given !== null)).toBe(true);
  });

  it("lists a game moved weeks later on its own day, still to come", () => {
    const days = fixtureDays(grid, col(6));
    const moved = days[days.length - 1]!;
    expect(moved.label).toBe("Wed 21 Oct");
    expect(moved.rows[0]).toMatchObject({ status: "scheduled", score: null });
  });
});

describe("difficulty mosaic", () => {
  it("ranks every club by expected points still to come over five gameweeks, like the board", () => {
    const mosaic = difficultyMosaic(grid, col(8));
    expect(mosaic.gameweeks).toEqual([8, 9, 10, 11, 12]);
    expect(mosaic.rows).toHaveLength(grid.teams.length);
    const totals = mosaic.rows.map((r) => r.total ?? -1);
    expect(totals).toEqual([...totals].sort((a, b) => b - a));
    const top = mosaic.rows[0]!;
    const finished = grid.matchdays.map((md) => md.finished);
    expect(top.total).toBe(runStats(top.team, col(8), col(8) + 5, "overall", grid.lens_scales.overall, finished).total);
    expect(top.cells.every((c) => c.kind === "game" && c.bucket !== null)).toBe(true);
  });

  it("marks played, blank, postponed and double gameweeks", () => {
    const cell = (status: GridCell["status"]): GridCell => ({ ...grid.teams[0]!.cells[col(8)]![0]!, status });
    const team: GridTeam = { ...grid.teams[0]!, cells: [[cell("finished")], [], [cell("postponed")], [cell("scheduled"), cell("scheduled")], [cell("scheduled")]] };
    const tiny: FixtureGrid = { ...grid, teams: [team], matchdays: grid.matchdays.slice(0, 5) };
    expect(difficultyMosaic(tiny, 0).rows[0]!.cells.map((c) => (c.kind === "game" ? `game×${c.games}` : c.kind))).toEqual([
      "played", "blank", "postponed", "game×2", "game×1",
    ]);
  });

  it("has fewer columns at the end of the season", () => {
    expect(difficultyMosaic(grid, grid.matchdays.length - 2).gameweeks).toHaveLength(2);
  });
});

describe("table tile", () => {
  const chances = [
    { code: grid.teams[0]!.code, title: 0.9, relegation: 0 },
    { code: grid.teams[1]!.code, title: 0.09, relegation: 0 },
    { code: grid.teams[2]!.code, title: 0.01, relegation: 0.3 },
    { code: grid.teams[3]!.code, title: 0, relegation: 0.97 },
    { code: grid.teams[4]!.code, title: 0, relegation: 0.76 },
    { code: grid.teams[5]!.code, title: 0, relegation: 0.02 },
  ];

  it("gives the top four and the three likeliest title winners and relegations", () => {
    const summary = tableSummary(grid, col(8), chances);
    expect(summary.top.map((r) => r.position)).toEqual([1, 2, 3, 4]);
    expect(summary.title.map((t) => t.chance)).toEqual([0.9, 0.09, 0.01]);
    expect(summary.relegation.map((t) => t.chance)).toEqual([0.97, 0.76, 0.3]);
  });

  it("runs the standings to the selected gameweek once it's played, else to the latest results", () => {
    expect(tableSummary(grid, col(4), chances).after).toBe(4);
    expect(tableSummary(grid, col(8), chances).after).toBe(6); // GW7 is still being played
  });

  it("works without chances (the projection failed) and before any game", () => {
    expect(tableSummary(grid, col(8), null).title).toEqual([]);
    const blank: FixtureGrid = { ...grid, teams: grid.teams.map((t) => ({ ...t, cells: t.cells.map((cells) => cells.map((c) => ({ ...c, status: "scheduled" as const, result: null }))) })), matchdays: grid.matchdays.map((md) => ({ ...md, finished: false })) };
    expect(tableSummary(blank, 0, null).after).toBeNull();
  });
});

describe("labels and links", () => {
  it("rounds chances without claiming certainty", () => {
    expect(chanceLabel(0.9)).toBe("90%");
    expect(chanceLabel(0.999)).toBe(">99%");
    expect(chanceLabel(0.003)).toBe("<1%");
  });

  it("keeps the gameweek in a tile's link unless it's the default one", () => {
    expect(boardHref("/fixtures", grid, col(7), col(7))).toBe("/fixtures");
    expect(boardHref("/table", grid, col(8), col(7))).toBe("/table?gw=8");
  });
});
