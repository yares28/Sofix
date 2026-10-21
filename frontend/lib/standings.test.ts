import { describe, expect, it } from "vitest";
import { chancesFromGoals, nextGame, standings, strengthNow } from "./standings";
import type { FixtureGrid, GridCell, GridTeam } from "./types";

const CODES = ["AAA", "BBB", "CCC", "DDD"];
// Double round robin of four clubs: six rounds, two games each.
const ROUNDS: [number, number][][] = [
  [[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]],
  [[1, 0], [3, 2]], [[2, 0], [3, 1]], [[3, 0], [2, 1]],
];
const scale = { cuts: [1, 2, 3, 4], higher_is_easier: false };

interface Season {
  now: number[]; // attack = −defence per club, today
  august: number[]; // the same before the season
  results: Record<string, [number, number]>; // "round-home" → score, for played games
}

function makeGrid({ now, august, results }: Season): FixtureGrid {
  const goals = (strength: number[], h: number, a: number) => [Math.exp(0.1 + 0.25 + strength[h]! + strength[a]! * -1), Math.exp(0.1 + strength[a]! - strength[h]!)] as const;
  const cells: GridCell[][][] = CODES.map(() => ROUNDS.map(() => []));
  let id = 1;
  ROUNDS.forEach((round, r) =>
    round.forEach(([h, a]) => {
      const score = results[`${r}-${h}`];
      const [gh, ga] = goals(now, h, a);
      const [oh, oa] = goals(august, h, a);
      const fixtureId = id++;
      for (const [me, them, venue] of [[h, a, "H"], [a, h, "A"]] as const) {
        const home = venue === "H";
        const c = chancesFromGoals(home ? gh : ga, home ? ga : gh);
        const o = chancesFromGoals(home ? oh : oa, home ? oa : oh);
        const [gf, ga2] = score ? (home ? score : [score[1], score[0]]) : [0, 0];
        cells[me]![r]!.push({
          fixture_id: fixtureId, opponent_code: CODES[them]!, venue,
          kickoff_utc: `2026-09-${String(10 + r).padStart(2, "0")}T19:00:00Z`, date_confirmed: true, rescheduled: false,
          status: score ? "finished" : "scheduled",
          result: score ? { goals_for: gf, goals_against: ga2, outcome: gf > ga2 ? "W" : gf === ga2 ? "D" : "L" } : null,
          prediction: score ? null : {
            difficulty: 50, label: "Even", bucket: 3, expected_points: 3 * c.win + c.draw,
            probabilities: { win: c.win, draw: c.draw, loss: c.loss }, clean_sheet: 0.3, xg_for: c.xgFor, xg_against: c.xgAgainst,
          },
          opening: { win: o.win, draw: o.draw, loss: o.loss, xg_for: o.xgFor, xg_against: o.xgAgainst },
        });
      }
    }),
  );
  const teams: GridTeam[] = CODES.map((code, i) => ({ code, name: `Team ${code}`, color: "#123456", crest_url: null, cells: cells[i]! }));
  return {
    competition: "PD", season: "2026/27", current_matchday: 3, model_version: null,
    lens_scales: { overall: scale, attack: scale, defence: scale, odds: scale, record: scale, market_record: scale },
    matchdays: ROUNDS.map((_, r) => ({ number: r + 1, date_from: "2026-09-01T00:00:00Z", date_to: "2026-09-02T00:00:00Z", finished: r < 2 })),
    teams,
  };
}

// AAA was the best club in August, but lost both its games and the model now rates it lowest.
const results: Season["results"] = { "0-0": [0, 2], "0-2": [1, 1], "1-0": [0, 1], "1-1": [2, 0] };
const season: Season = { now: [-0.4, 0.2, 0.1, 0.1], august: [0.5, 0, -0.2, -0.3], results };
const grid = makeGrid(season);
const code = (rows: { team: GridTeam }[]) => rows.map((row) => row.team.code);
const sum = (values: number[]) => values.reduce((s, v) => s + v, 0);

describe("standings", () => {
  it("actual ranks by real points and adds the games to come at today's forecasts", () => {
    const rows = standings(grid, { mode: "actual", simulations: 400 });
    expect(rows[rows.length - 1]!.team.code).toBe("AAA"); // no points from two games
    const aaa = rows.find((row) => row.team.code === "AAA")!;
    expect(aaa.points).toBe(0);
    const toCome = grid.teams[0]!.cells.flat().filter((c) => c.prediction).map((c) => c.prediction!.expected_points);
    expect(aaa.xPts).toBeCloseTo(sum(toCome), 6);
    // Every simulated season has one champion, four in the top four, one fifth, one sixth (none here) and three down.
    expect(sum(rows.map((r) => r.title))).toBeCloseTo(1, 6);
    expect(sum(rows.map((r) => r.ucl))).toBeCloseTo(4, 6);
    expect(sum(rows.map((r) => r.rel))).toBeCloseTo(3, 6);
  });

  it("expected prices every game at today's strength, so form moves it and results don't count twice", () => {
    const expected = standings(grid, { mode: "expected", simulations: 400 });
    expect(code(expected)[0]).toBe("BBB"); // the strongest club today
    expect(code(expected)[3]).toBe("AAA");
    // AAA wins its next games in another world: today's model rates it top, and Expected follows.
    const recovered = makeGrid({ ...season, now: [0.6, 0.2, 0.1, 0.1] });
    expect(code(standings(recovered, { mode: "expected", simulations: 0 }))[0]).toBe("AAA");
    // Its real results don't move Expected: a different score in a played game leaves it as it was.
    const luckier = makeGrid({ ...season, results: { ...results, "0-0": [3, 0] } });
    expect(standings(luckier, { mode: "expected", simulations: 0 }).map((r) => r.xPts))
      .toEqual(standings(grid, { mode: "expected", simulations: 0 }).map((r) => r.xPts));
  });

  it("predicted is August's season and nothing since changes it", () => {
    const predicted = standings(grid, { mode: "predicted", simulations: 400 });
    expect(code(predicted)).toEqual(["AAA", "BBB", "CCC", "DDD"]);
    const later = makeGrid({ ...season, now: [0.6, -0.5, 0, 0], results: { ...results, "0-0": [5, 0] } });
    expect(standings(later, { mode: "predicted", simulations: 400 }).map((r) => [r.team.code, r.xPts, r.title]))
      .toEqual(predicted.map((r) => [r.team.code, r.xPts, r.title]));
    expect(predicted[0]!.title).not.toBe(standings(grid, { mode: "expected", simulations: 400 }).find((r) => r.team.code === "AAA")!.title);
  });

  it("home and away count only those games, while the chances stay the full table's", () => {
    const total = standings(grid, { mode: "predicted", simulations: 200 });
    const home = standings(grid, { mode: "predicted", split: "home", simulations: 200 });
    const away = standings(grid, { mode: "predicted", split: "away", simulations: 200 });
    for (const row of total) {
      const h = home.find((r) => r.team.code === row.team.code)!;
      const a = away.find((r) => r.team.code === row.team.code)!;
      expect(h.xPts + a.xPts).toBeCloseTo(row.xPts, 6);
      expect(h.title).toBe(row.title);
    }
    // The real home table: BBB's only home game so far was its 2–0 win.
    const actualHome = standings(grid, { mode: "actual", split: "home", simulations: 0 });
    expect(actualHome.find((r) => r.team.code === "BBB")).toMatchObject({ played: 1, points: 3 });
  });

  it("stops the season at a gameweek when asked", () => {
    const early = standings(grid, { mode: "predicted", stop: 2, simulations: 0 }); // the first three rounds
    const aaa = grid.teams[0]!.cells.slice(0, 3).flat().map((c) => 3 * c.opening!.win + c.opening!.draw);
    expect(early.find((r) => r.team.code === "AAA")!.xPts).toBeCloseTo(sum(aaa), 6);
  });
});

describe("strengthNow", () => {
  it("reads each club's strength back from today's forecasts, and prices a game already played", () => {
    const price = strengthNow(grid)!;
    const exact = chancesFromGoals(Math.exp(0.1 + 0.25 - 0.4 - 0.2), Math.exp(0.1 + 0.2 + 0.4)); // AAA at home to BBB
    const got = price(0, 1);
    expect(got.win).toBeCloseTo(exact.win, 4);
    expect(got.xgFor).toBeCloseTo(exact.xgFor, 4);
  });
});

describe("nextGame", () => {
  it("is the earliest game not yet played", () => {
    expect(nextGame(grid.teams[0]!)?.kickoff_utc).toBe("2026-09-12T19:00:00Z");
  });
});
