import { describe, expect, it } from "vitest";
import {
  DEFAULT_VIEW, cellBucket, cellLabel, columnTotal, formatDay, formatKickoff, formatLensValue, openingColumn,
  parseViewState, positionPicks, relativeTime, runStats, scaleBucket, serializeViewState, sortTeams, windowRange,
} from "./grid";
import type { Bucket, DifficultyLabel, FixtureGrid, GridCell, GridTeam, LensScale } from "./types";

const OVERALL: LensScale = { cuts: [37.4, 48.6, 61.1, 71.3], higher_is_easier: false };
const ATTACK: LensScale = { cuts: [2.0, 1.6, 1.2, 0.9], higher_is_easier: true };
const LABELS: Record<Bucket, DifficultyLabel> = { 1: "Easy", 2: "Easy-ish", 3: "Normal", 4: "Hard-ish", 5: "Hard" };

let nextId = 1;

function cell(
  overrides: Partial<GridCell> & { difficulty?: number; xg?: number; cs?: number; ep?: number; bucket?: Bucket } = {},
): GridCell {
  const { difficulty = 50, xg = 1.3, cs = 0.3, ep = 1.4, bucket, ...rest } = overrides;
  const resolved = bucket ?? scaleBucket(difficulty, OVERALL);
  return {
    fixture_id: nextId++,
    opponent_code: "OPP",
    venue: "H",
    kickoff_utc: "2026-09-20T19:00:00Z",
    date_confirmed: true,
    rescheduled: false,
    status: "scheduled",
    result: null,
    prediction: {
      difficulty, label: LABELS[resolved], bucket: resolved, expected_points: ep,
      probabilities: { win: 0.4, draw: 0.25, loss: 0.35 }, clean_sheet: cs, xg_for: xg, xg_against: 1.1,
    },
    weather: null,
    ...rest,
  };
}

function team(code: string, cells: GridCell[][]): GridTeam {
  return { code, name: `Team ${code}`, color: "#000000", crest_url: null, cells };
}

describe("scaleBucket", () => {
  it("overall: inclusive upper bounds from the API scale", () => {
    expect([10, 37.4, 37.5, 48.6, 61.1, 71.3, 71.4, 99].map((v) => scaleBucket(v, OVERALL))).toEqual([1, 1, 2, 2, 3, 4, 5, 5]);
  });

  it("higher-is-easier lenses: more xG is easier", () => {
    expect([2.5, 2.0, 1.99, 1.3, 1.0, 0.5].map((v) => scaleBucket(v, ATTACK))).toEqual([1, 1, 2, 3, 4, 5]);
  });
});

describe("cellBucket", () => {
  it("uses the API's label bucket on the overall lens, even when the rounded score says otherwise", () => {
    // 48.6 is inside Easy-ish by threshold, but the backend labelled the unrounded 48.64 as Normal
    const boundary = cell({ difficulty: 48.6, bucket: 3 });
    expect(cellBucket(boundary, "overall", OVERALL)).toBe(3);
    expect(boundary.prediction?.label).toBe("Normal");
  });

  it("uses the lens scale for attack and nothing for unpredicted cells", () => {
    expect(cellBucket(cell({ xg: 2.3 }), "attack", ATTACK)).toBe(1);
    expect(cellBucket(cell({ prediction: null }), "attack", ATTACK)).toBeNull();
  });
});

describe("windowRange", () => {
  it("clamps start and end to the season", () => {
    expect(windowRange(38, 35, 8)).toEqual({ start: 35, end: 38 });
    expect(windowRange(38, -3, 5)).toEqual({ start: 0, end: 5 });
    expect(windowRange(38, 99, 3)).toEqual({ start: 37, end: 38 });
    expect(windowRange(0, 0, 8)).toEqual({ start: 0, end: 0 });
  });
});

describe("runStats", () => {
  it("averages rated games, totals expected points with blanks as 0, and counts blanks and doubles", () => {
    const t = team("AAA", [
      [cell({ difficulty: 20, ep: 2.2 })],
      [cell({ difficulty: 60, venue: "A", ep: 1.0 })],
      [cell({ status: "finished", prediction: null })],
      [],
      [cell({ difficulty: 30, ep: 2.0 }), cell({ difficulty: 50, ep: 1.5 })],
    ]);
    const stats = runStats(t, 0, 5, "overall", OVERALL);
    expect(stats.average).toBeCloseTo(40);
    expect(stats.total).toBeCloseTo(6.7);
    expect({ ...stats, average: 0, total: 0 }).toEqual({
      average: 0, total: 0, fixtures: 4, blanks: 1, doubles: 1, home: 3, buckets: [1, 3, 1, 3],
    });
    expect(runStats(t, 2, 3, "overall", OVERALL).total).toBeNull(); // only a played game
  });

  it("does not count a blank in an already finished matchday", () => {
    const t = team("AAA", [[], [cell({ ep: 1.5 })]]);
    expect(runStats(t, 0, 2, "overall", OVERALL, [true, false])).toMatchObject({ blanks: 0, total: 1.5 });
    expect(runStats(t, 0, 2, "overall", OVERALL, [false, false])).toMatchObject({ blanks: 1, total: 1.5 });
  });
});

describe("columnTotal", () => {
  it("is 0 for an upcoming blank, sums doubles, and is null when nothing can be rated", () => {
    expect(columnTotal([], "overall")).toBe(0);
    expect(columnTotal([], "overall", true)).toBeNull();
    expect(columnTotal([cell({ ep: 1.2 }), cell({ ep: 0.8 })], "overall")).toBeCloseTo(2.0);
    expect(columnTotal([cell({ cs: 0.4 }), cell({ cs: 0.1 })], "defence")).toBeCloseTo(0.5);
    expect(columnTotal([cell({ status: "finished", prediction: null })], "overall")).toBeNull();
  });
});

describe("sortTeams", () => {
  const easy = team("EAS", [[cell({ difficulty: 20, xg: 2.2, ep: 2.3 })]]);
  const hard = team("HAR", [[cell({ difficulty: 80, xg: 0.7, ep: 0.6 })]]);
  const none = team("NON", [[cell({ status: "finished", prediction: null })]]);
  const teams = [hard, none, easy];

  it("puts the easiest first ascending and teams without a value last in both directions", () => {
    const asc = sortTeams(teams, { key: { kind: "matchday", column: 0 }, dir: "asc" }, 0, 1, "overall");
    const desc = sortTeams(teams, { key: { kind: "matchday", column: 0 }, dir: "desc" }, 0, 1, "overall");
    expect(asc.map((t) => t.code)).toEqual(["EAS", "HAR", "NON"]);
    expect(desc.map((t) => t.code)).toEqual(["HAR", "EAS", "NON"]);
  });

  it("treats higher xG as easier on the attack lens, and sorts names alphabetically", () => {
    expect(sortTeams(teams, { key: { kind: "total" }, dir: "asc" }, 0, 1, "attack").map((t) => t.code)).toEqual(["EAS", "HAR", "NON"]);
    expect(sortTeams(teams, { key: { kind: "team" }, dir: "desc" }, 0, 1, "overall").map((t) => t.code)).toEqual(["NON", "HAR", "EAS"]);
  });

  it("ranks a double week above a single and a blank last, on the column and on the total", () => {
    const double = team("DBL", [[cell({ ep: 1.2 }), cell({ ep: 1.1 })]]);
    const single = team("SGL", [[cell({ ep: 2.0 })]]);
    const blank = team("BLK", [[]]);
    const order = (kind: "total" | "matchday") =>
      sortTeams([blank, single, double], { key: kind === "total" ? { kind } : { kind, column: 0 }, dir: "asc" }, 0, 1, "overall").map((t) => t.code);
    expect(order("matchday")).toEqual(["DBL", "SGL", "BLK"]);
    expect(order("total")).toEqual(["DBL", "SGL", "BLK"]);
  });
});

describe("planning helpers", () => {
  const md = (number: number) => ({ number, date_from: "2026-09-01T00:00:00Z", date_to: "2026-09-02T00:00:00Z", finished: false });
  const played = () => cell({ status: "finished", prediction: null, result: { goals_for: 1, goals_against: 0, outcome: "W" } });

  it("opens on the first matchday with fewer than half its games done", () => {
    const grid: FixtureGrid = {
      season: "2026/27", current_matchday: 1, model_version: null,
      lens_scales: { overall: OVERALL, attack: ATTACK, defence: ATTACK },
      matchdays: [md(1), md(2), md(3)],
      teams: [
        team("AAA", [[played()], [played()], [cell()]]),
        team("BBB", [[played()], [played()], [cell()]]),
        team("CCC", [[cell({ status: "postponed", prediction: null })], [cell()], [cell()]]),
        team("DDD", [[played()], [played()], [cell()]]),
      ],
    };
    expect(openingColumn(grid)).toBe(2); // MD1 fully done (one postponed), MD2 3 of 4 played
    expect(openingColumn({ ...grid, teams: grid.teams.map((t) => ({ ...t, cells: t.cells.map(() => [played()]) })) })).toBe(2);
  });

  it("ranks clubs to pick from by position: goals for forwards, clean sheets for defenders, a blend for midfielders", () => {
    const three = (xg: number, cs: number) => [0, 1, 2].map(() => [cell({ xg, cs })]);
    const teams = [
      team("STR", three(2.5, 0.1)), // scores a lot, concedes a lot
      team("WAL", three(0.8, 0.6)), // tight defence, blunt attack
      team("BAL", three(1.9, 0.5)), // good at both
      team("WEK", three(0.7, 0.1)),
      team("OFF", [[cell({ status: "finished", prediction: null })], [], []]), // nothing to rate
    ];
    const attack = new Map(teams.map((t) => [t.code, runStats(t, 0, 3, "attack", ATTACK, [true, true, true])]));
    const defence = new Map(teams.map((t) => [t.code, runStats(t, 0, 3, "defence", ATTACK, [true, true, true])]));
    const picks = positionPicks(teams, attack, defence, 3);

    expect(picks.forwards.map((p) => p.team.code)).toEqual(["STR", "BAL", "WAL"]);
    expect(picks.defenders.map((p) => p.team.code)).toEqual(["WAL", "BAL", "STR"]);
    expect(picks.midfielders.map((p) => p.team.code)).toEqual(["BAL", "STR", "WAL"]);
    expect(picks.forwards[0]).toMatchObject({ fixtures: 3 });
    expect(picks.forwards[0]!.xg).toBeCloseTo(7.5);
    expect(picks.defenders[0]!.cleanSheets).toBeCloseTo(1.8);
  });

  it("round-trips view state through the URL and ignores junk", () => {
    const known = new Set(["FCB", "RMA", "ATL"]);
    const state = { ...DEFAULT_VIEW, lens: "attack" as const, horizon: "5" as const, from: 7, pins: ["FCB", "ATL"], played: true };
    const query = serializeViewState(state);
    expect(query).toBe("lens=attack&h=5&from=7&pins=FCB%2CATL&played=1");
    expect({ ...DEFAULT_VIEW, ...parseViewState(new URLSearchParams(query), known) }).toEqual(state);
    expect(serializeViewState(DEFAULT_VIEW)).toBe("");
    expect(parseViewState(new URLSearchParams("lens=bogus&h=99&from=-2&pins=fcb,XXX,FCB,<script>&view=plain"), known)).toEqual({
      view: "plain",
      pins: ["FCB"],
    });
  });
});

describe("formatting", () => {
  it("formats lens values", () => {
    expect(formatLensValue(42.6, "overall")).toBe("43");
    expect(formatLensValue(1.456, "attack")).toBe("1.46");
    expect(formatLensValue(0.314, "defence")).toBe("31%");
  });

  it("shows Madrid time across the October DST change", () => {
    expect(formatKickoff("2026-10-24T19:00:00Z")).toBe("Sat 24 Oct, 21:00"); // CEST, UTC+2
    expect(formatKickoff("2026-10-25T19:00:00Z")).toBe("Sun 25 Oct, 20:00"); // CET, UTC+1
    expect(formatDay("2026-09-30T23:30:00Z")).toBe("1 Oct"); // already the next day in Madrid
  });

  it("labels tiles for screen readers", () => {
    const upcoming = cell({ difficulty: 48.6, bucket: 3, xg: 1.85, cs: 0.32 });
    expect(cellLabel(upcoming, "Barcelona", 6, "Getafe", "overall")).toBe(
      "Gameweek 6, Barcelona at home to Getafe, Sun 20 Sep, 21:00, difficulty 49 of 100, Normal",
    );
    expect(cellLabel(upcoming, "Barcelona", 6, "Getafe", "attack")).toMatch(/, expected goals 1\.85$/);
    expect(cellLabel(upcoming, "Barcelona", 6, "Getafe", "defence")).toMatch(/, clean sheet chance 32%$/);
    expect(cellLabel(cell({ date_confirmed: false, venue: "A" }), "Barcelona", 7, "Elche", "overall")).toMatch(
      /^Gameweek 7, Barcelona away to Elche, date to be confirmed, weekend of 20 Sep, difficulty/,
    );
    const played = cell({ status: "finished", prediction: null, result: { goals_for: 1, goals_against: 2, outcome: "L" } });
    expect(cellLabel(played, "Barcelona", 4, "Sevilla", "overall")).toBe("Gameweek 4, Barcelona at home to Sevilla, lost 1–2");
    expect(cellLabel(cell({ status: "postponed", prediction: null }), "Barcelona", 5, "Betis", "overall")).toBe(
      "Gameweek 5, Barcelona at home to Betis, postponed",
    );
  });

  it("describes relative time", () => {
    const now = new Date("2026-09-14T12:00:00Z");
    expect(relativeTime("2026-09-14T11:59:40Z", now)).toBe("just now");
    expect(relativeTime("2026-09-14T11:15:00Z", now)).toBe("45 min ago");
    expect(relativeTime("2026-09-14T06:00:00Z", now)).toBe("6 h ago");
    expect(relativeTime("2026-09-10T12:00:00Z", now)).toBe("4 days ago");
  });
});
