import { describe, expect, it } from "vitest";
import {
  DEFAULT_VIEW, cellBucket, horizonSize, cellLabel, columnTotal, formatDay, formatEdge, formatKickoff, formatLensValue, formatShortKickoff,
  PRICE_OPTIONS, VIEW_PATH, decimalOdds, legacyBoardUrl, lensValue, mostPointsComing, playedValue, recordCopy, runValue, scheduleSwing, marketLabels, marketLines, openingColumn, overviewWindow, parseViewState, positionPicks, selectedColumn, windowLabel, relativeTime, runStats, scaleBucket, serializeViewState, sortTeams, windowRange,
} from "./grid";
import type { Bucket, CellRecord, DifficultyLabel, FixtureGrid, GridCell, GridTeam, LensScale } from "./types";

const OVERALL: LensScale = { cuts: [37.4, 48.6, 61.1, 71.3], higher_is_easier: false };
const ATTACK: LensScale = { cuts: [2.0, 1.6, 1.2, 0.9], higher_is_easier: true };
const LABELS: Record<Bucket, DifficultyLabel> = { 1: "Very favourite", 2: "Favourite", 3: "Even", 4: "Underdog", 5: "Big underdog" };

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
    // 48.6 is inside Favourite by threshold, but the backend labelled the unrounded 48.64 as Even
    const boundary = cell({ difficulty: 48.6, bucket: 3 });
    expect(cellBucket(boundary, "overall", OVERALL)).toBe(3);
    expect(boundary.prediction?.label).toBe("Even");
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
      lens_scales: { overall: OVERALL, attack: ATTACK, defence: ATTACK, odds: ATTACK, record: ATTACK, market_record: ATTACK },
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
    const state = { ...DEFAULT_VIEW, lens: "attack" as const, horizon: "8" as const, gw: 7, pins: ["FCB", "ATL"] };
    const query = serializeViewState(state);
    expect(query).toBe("lens=attack&h=8&gw=7&pins=FCB%2CATL");
    expect({ ...DEFAULT_VIEW, ...parseViewState(new URLSearchParams(query), known) }).toEqual(state);
    expect(serializeViewState(DEFAULT_VIEW)).toBe("");
    expect(parseViewState(new URLSearchParams("from=9&board=grid&played=1"), known)).toEqual({ gw: 9 }); // old links
    expect(parseViewState(new URLSearchParams("lens=bogus&h=99&gw=-2&pins=fcb,XXX,FCB,<script>&view=plain"), known)).toEqual({
      view: "plain",
      pins: ["FCB"],
    });
  });

  it("supports the Table tab, the Next horizon and old Next GW links", () => {
    const known = new Set(["FCB"]);
    const table = { ...DEFAULT_VIEW, view: "table" as const, table: "predicted" as const };
    expect(serializeViewState(table)).toBe("t=predicted"); // the tab is the path now: /table
    expect(VIEW_PATH[table.view]).toBe("/table");
    expect({ ...DEFAULT_VIEW, ...parseViewState(new URLSearchParams("view=table&t=predicted"), known) }).toEqual(table);
    expect(parseViewState(new URLSearchParams("h=next"), known)).toEqual({ horizon: "next" });
    expect(parseViewState(new URLSearchParams("view=next"), known)).toEqual({ view: "fdr", horizon: "next" });
    expect(horizonSize("next", 38)).toBe(1);
    expect(horizonSize("5", 38)).toBe(5);
    expect(horizonSize("all", 38)).toBe(38);
  });

  it("sends links from when the board lived at / to its new pages, and leaves home links alone", () => {
    const at = (query: string) => legacyBoardUrl(new URLSearchParams(query));
    expect(at("view=table&t=predicted")).toBe("/table?t=predicted");
    expect(at("view=plain&gw=7")).toBe("/fixtures?gw=7");
    expect(at("view=next")).toBe("/difficulty?h=next");
    expect(at("h=3&lens=odds")).toBe("/difficulty?h=3&lens=odds");
    expect(at("from=6&board=grid")).toBe("/difficulty?gw=6");
    expect(at("pins=FCB")).toBe("/difficulty?pins=FCB");
    expect(at("gw=8")).toBeNull();
    expect(at("")).toBeNull();
  });

  it("picks the most and fewest points coming per game, so game counts don't decide", () => {
    const early = cell({ status: "finished", prediction: null, result: { goals_for: 0, goals_against: 0, outcome: "D" } });
    const teams = [
      team("DBL", [[cell({ ep: 1.5 }), cell({ ep: 1.5 })], [cell({ ep: 1.5 })]]), // double week: biggest total, average run
      team("TOP", [[cell({ ep: 2.2 })], [cell({ ep: 2.0 })]]),
      team("ERL", [[early], [cell({ ep: 1.3 })]]), // already played: smallest total, not the fewest
      team("LOW", [[cell({ ep: 0.9 })], [cell({ ep: 0.8 })]]),
      team("OFF", [[], []]),
    ];
    const stats = new Map(teams.map((t) => [t.code, runStats(t, 0, 2, "overall", OVERALL, [false, false])]));
    expect(mostPointsComing(teams, stats)).toMatchObject({ best: { code: "TOP" }, worst: { code: "LOW" } });
    expect(mostPointsComing(teams.slice(3), stats)).toBeNull();
  });

  it("ranks the schedule swing against each club's own level, not against other clubs", () => {
    // STRONG is the best club but its two games are exactly its usual level; WEAK is poor with a soft opening.
    const strong = team("STR", [[cell({ ep: 2.2 })], [cell({ ep: 2.2 })], [cell({ ep: 2.2 })], [cell({ ep: 2.2 })]]);
    const weak = team("WEA", [[cell({ ep: 1.2 })], [cell({ ep: 1.2 })], [cell({ ep: 0.4 })], [cell({ ep: 0.4 })]]);
    const grind = team("GRI", [[cell({ ep: 0.8 })], [cell({ ep: 0.8 })], [cell({ ep: 1.6 })], [cell({ ep: 1.6 })]]);
    const teams = [strong, weak, grind];
    const finished = [false, false, false, false];
    const window = new Map(teams.map((t) => [t.code, runStats(t, 0, 2, "overall", OVERALL, finished)]));
    const rest = new Map(teams.map((t) => [t.code, runStats(t, 0, 4, "overall", OVERALL, finished)]));
    const swings = scheduleSwing(teams, window, rest)!;
    expect(swings.best.team.code).toBe("WEA");
    expect(swings.best.swing).toBeCloseTo(0.4, 5); // 1.2 a game against a 0.8 usual
    expect(swings.worst.team.code).toBe("GRI");
    expect(swings.worst.swing).toBeCloseTo(-0.4, 5);
  });

  it("needs twice the window left before it calls a schedule soft", () => {
    const teams = [
      team("AAA", [[cell({ ep: 2.0 })], [cell({ ep: 2.0 })], [cell({ ep: 0.5 })]]),
      team("BBB", [[cell({ ep: 0.5 })], [cell({ ep: 0.5 })], [cell({ ep: 2.0 })]]),
    ];
    const finished = [false, false, false];
    const window = new Map(teams.map((t) => [t.code, runStats(t, 0, 2, "overall", OVERALL, finished)]));
    const rest = new Map(teams.map((t) => [t.code, runStats(t, 0, 3, "overall", OVERALL, finished)]));
    expect(scheduleSwing(teams, window, rest)).toBeNull(); // only 3 games left for a 2-game window
  });

  it("finds the selected gameweek's column, falling back to the opening one", () => {
    const mds = [4, 5, 6, 7].map((number) => ({ number }));
    expect(selectedColumn(mds, 6, 1)).toBe(2);
    expect(selectedColumn(mds, null, 1)).toBe(1);
    expect(selectedColumn(mds, 40, 1)).toBe(1);
  });

  it("rates the odds lens per priced game, coloured from the odds scale even without a prediction", () => {
    const market = (win: number, draw: number) => ({
      win, draw, loss: 1 - win - draw, scores: 0.7, scores_2plus: 0.35, clean_sheet: 0.3, concedes_2plus: 0.25, both_score: 0.49,
      expected_points: 3 * win + draw, bookmakers: 8, fetched_at: "2026-09-14T08:00:00Z",
    });
    const ODDS: LensScale = { cuts: [0.6, 0.45, 0.3, 0.18], higher_is_easier: true };
    const played = cell({ status: "finished", prediction: null, result: { goals_for: 1, goals_against: 0, outcome: "W" } });
    const early = team("ERL", [[played], [cell({ market: market(0.5, 0.25) })]]); // played GW1 early: one priced game
    const full = team("FUL", [[cell({ market: market(0.4, 0.3) })], [cell({ market: market(0.4, 0.3) })]]);
    const stats = new Map([early, full].map((t) => [t.code, runStats(t, 0, 2, "odds", ODDS)]));
    expect(stats.get("ERL")!.total).toBeCloseTo(1.75); // per game, not dragged down by the game already played
    expect(stats.get("FUL")!.total).toBeCloseTo(1.5);
    expect(sortTeams([full, early], { key: { kind: "total" }, dir: "asc" }, 0, 2, "odds", stats).map((t) => t.code)).toEqual(["ERL", "FUL"]);

    const double = [cell({ market: market(0.6, 0.2) }), cell({ market: market(0.2, 0.3) })];
    expect(columnTotal(double, "odds")).toBeCloseTo((2.0 + 0.9) / 2);
    expect(columnTotal([], "odds")).toBeNull(); // a blank week isn't a zero-priced game
    const noPrediction = cell({ prediction: null, market: market(0.62, 0.2) });
    expect(cellBucket(noPrediction, "odds", ODDS)).toBe(1);
    expect(cellBucket(cell(), "odds", ODDS)).toBeNull();
    expect(cellLabel(cell(), "Team A", 6, "Team B", "odds")).toMatch(/not priced by bookmakers yet$/);
    expect(PRICE_OPTIONS.odds.map((o) => o.label)).toEqual(["Win", "Draw", "Loss", "Win or draw", "Both score"]);
    expect(decimalOdds(PRICE_OPTIONS.overall[3]!.probability(market(0.5, 0.25)))).toBe("1.33"); // double chance
    expect(marketLabels("defence")).toEqual(["CS", "Conc 2+"]);
  });

  it("turns fair probabilities into decimal odds for each lens", () => {
    expect(decimalOdds(0.5)).toBe("2.00");
    expect(decimalOdds(0.004)).toBe("99+");
    expect(decimalOdds(0)).toBe("—");
    const market = {
      win: 0.625, draw: 0.25, loss: 0.125, scores: 0.8, scores_2plus: 0.4, clean_sheet: 0.32, concedes_2plus: 0.2, both_score: 0.54, expected_points: 2.125,
      bookmakers: 9, fetched_at: "2026-09-14T08:00:00Z",
    };
    expect(marketLines(market, "overall").map((l) => `${l.label} ${l.price}`)).toEqual(["W 1.60", "D 4.00", "L 8.00"]);
    expect(marketLines(market, "attack").map((l) => `${l.label} ${l.price}`)).toEqual(["Scores 1.25", "2+ 2.50", "BTS 1.85"]);
    expect(marketLines(market, "defence").map((l) => l.spoken)).toEqual(["clean sheet 3.13", "to concede 2 or more 5.00"]);
  });

  it("sizes the overview window from the opening gameweek and labels it", () => {
    expect(overviewWindow(38, 5, "5")).toEqual({ start: 5, end: 10, horizon: "5" });
    expect(overviewWindow(38, 5, "all")).toEqual({ start: 5, end: 13, horizon: "8" });
    expect(overviewWindow(38, 37, "8")).toEqual({ start: 37, end: 38, horizon: "8" }); // last gameweek of the season
    const mds = [6, 7, 8, 9, 10].map((number) => ({ number }));
    expect(windowLabel(mds, 0, 5)).toBe("GW6–GW10");
    expect(windowLabel(mds, 2, 3)).toBe("GW8");
    expect(windowLabel([], 0, 0)).toBe("");
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
    expect(formatShortKickoff("2026-10-24T19:00:00Z")).toBe("Sat 21:00");
    expect(formatDay("2026-09-30T23:30:00Z")).toBe("1 Oct"); // already the next day in Madrid
  });

  it("labels tiles for screen readers", () => {
    const upcoming = cell({ difficulty: 48.6, bucket: 3, xg: 1.85, cs: 0.32 });
    expect(cellLabel(upcoming, "Barcelona", 6, "Getafe", "overall")).toBe(
      "Gameweek 6, Barcelona at home to Getafe, Sun 20 Sep, 21:00, difficulty 49 of 100, Even",
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

describe("played games", () => {
  const forecast = { expected_points: 1.9, probabilities: { win: 0.55, draw: 0.25, loss: 0.2 }, xg_for: 1.6, xg_against: 1.0, clean_sheet: 0.3 };
  const played = (over: Partial<GridCell> = {}) =>
    cell({
      status: "finished",
      result: { goals_for: 2, goals_against: 1, outcome: "W" },
      review: { outcome_chance: 0.55, points: 3, expected_points: 1.9, surprise: 1 },
      prediction: { ...cell().prediction!, ...forecast },
      ...over,
    });

  it("keeps the forecast out of every total and scale", () => {
    // The cell carries a prediction now, so the guard has to be the status, not the missing forecast.
    expect(lensValue(played(), "overall")).toBeNull();
    expect(runValue(played(), "overall")).toBeNull();
    expect(columnTotal([played()], "overall")).toBeNull();
    const team: GridTeam = { code: "SEV", name: "Sevilla", color: "#000000", crest_url: null, cells: [[played()], [cell()]] };
    const stats = runStats(team, 0, 2, "overall", OVERALL, [true, false]);
    expect(stats.fixtures).toBe(1); // only the game still to come is rated
  });

  it("still says what the forecast was worth, for the Next list", () => {
    expect(playedValue(played(), "overall")).toBe(1.9);
    expect(playedValue(played(), "attack")).toBe(1.6);
    expect(playedValue(played(), "odds")).toBeNull(); // prices go once a game kicks off
    expect(playedValue(cell(), "overall")).toBeNull(); // not played yet
  });

  it("says how the forecast did in the spoken label", () => {
    expect(cellLabel(played(), "Sevilla", 6, "Barcelona", "overall")).toBe(
      "Gameweek 6, Sevilla at home to Barcelona, won 2–1, the board gave that result 55%",
    );
  });
});

describe("record lenses", () => {
  const EDGE: LensScale = { cuts: [0.06, 0.02, -0.02, -0.06], higher_is_easier: true };
  const rec = (edge: number, games = 40): CellRecord => ({ band: "35-50%", games, wins: 18, rate: 0.45, league: 0.44, edge });

  it("colours by the edge, and needs a record rather than a prediction", () => {
    const beats = cell({ record: rec(0.08) });
    const short = cell({ record: rec(-0.07) });
    expect(cellBucket(beats, "record", EDGE)).toBe(1);
    expect(cellBucket(short, "record", EDGE)).toBe(5);
    expect(cellBucket(cell({ record: null }), "record", EDGE)).toBeNull();
    // the price-banded lens reads its own field, so an unpriced fixture has no tile
    expect(cellBucket(beats, "market_record", EDGE)).toBeNull();
    expect(cellBucket(cell({ record_price: rec(0.03) }), "market_record", EDGE)).toBe(2);
  });

  it("averages over a run instead of adding up", () => {
    expect(columnTotal([cell({ record: rec(0.04) }), cell({ record: rec(0.02) })], "record")).toBeCloseTo(0.03, 6);
    expect(columnTotal([], "record")).toBeNull(); // a blank week is not an edge of 0
    const team: GridTeam = { code: "SEV", name: "Sevilla", color: "#000000", crest_url: null,
      cells: [[cell({ record: rec(0.04) })], [cell({ record: rec(-0.02) })], []] };
    expect(runStats(team, 0, 3, "record", EDGE, [false, false, false]).total).toBeCloseTo(0.01, 6);
  });

  it("formats an edge as signed points", () => {
    expect(formatEdge(0.064)).toBe("+6 pts");
    expect(formatEdge(-0.041)).toBe("−4 pts");
    expect(formatEdge(0.002)).toBe("level");
    expect(formatLensValue(0.05, "record")).toBe("+5 pts");
  });

  it("says what the record is in the spoken label", () => {
    const withRecord = cell({ record: rec(0.05, 63) });
    expect(cellLabel(withRecord, "Sevilla", 6, "Barcelona", "record")).toMatch(/Wins 45% of games rated \d+%, 18 of 63, \+5 pts against the league/);
    expect(cellLabel(cell({ record: null }), "Sevilla", 6, "Barcelona", "record")).toMatch(/No record at this rating yet/);
  });

  it("writes the record as a sentence, with the band under it", () => {
    const priced = recordCopy(rec(0.05, 63), 0.3846, true);
    expect(priced.headline).toBe("Wins 45% of games at odds 2.60 (38%)");
    expect(priced.evidence).toBe("18 of 63 priced 35–50% · league 44% · +5 pts");
    expect(recordCopy(rec(0.05, 63), 0.3, false).headline).toBe("Wins 45% of games rated 30%");
    expect(recordCopy(null, 0.3, false)).toEqual({ headline: "No record at this rating yet", evidence: null });
    expect(recordCopy(null, null, true).headline).toBe("No record at these odds yet");
  });
});
