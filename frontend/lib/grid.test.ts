import { describe, expect, it } from "vitest";
import {
  cellBucket, formatDay, formatKickoff, formatLensValue, relativeTime, runStats, scaleBucket, sortTeams, windowRange,
} from "./grid";
import type { Bucket, DifficultyLabel, GridCell, GridTeam, LensScale } from "./types";

const OVERALL: LensScale = { cuts: [37.4, 48.6, 61.1, 71.3], higher_is_easier: false };
const ATTACK: LensScale = { cuts: [2.0, 1.6, 1.2, 0.9], higher_is_easier: true };
const LABELS: Record<Bucket, DifficultyLabel> = { 1: "Easy", 2: "Easy-ish", 3: "Normal", 4: "Hard-ish", 5: "Hard" };

let nextId = 1;

function cell(
  overrides: Partial<GridCell> & { difficulty?: number; xg?: number; cs?: number; bucket?: Bucket } = {},
): GridCell {
  const { difficulty = 50, xg = 1.3, cs = 0.3, bucket, ...rest } = overrides;
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
      difficulty, label: LABELS[resolved], bucket: resolved, expected_points: 1.4,
      probabilities: { win: 0.4, draw: 0.25, loss: 0.35 }, clean_sheet: cs, xg_for: xg, xg_against: 1.1,
    },
    weather: null,
    ...rest,
  };
}

function team(code: string, cells: GridCell[][]): GridTeam {
  return { code, name: `Team ${code}`, color: "#000000", cells };
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
  it("averages only predicted games in the window and counts home games", () => {
    const t = team("AAA", [
      [cell({ difficulty: 20 })],
      [cell({ difficulty: 60, venue: "A" })],
      [cell({ status: "finished", prediction: null })],
      [],
      [cell({ difficulty: 90 })],
    ]);
    const stats = runStats(t, 0, 4, "overall", OVERALL);
    expect(stats).toEqual({ average: 40, fixtures: 2, home: 1, buckets: [1, 3] });
    expect(runStats(t, 2, 4, "overall", OVERALL).average).toBeNull();
  });
});

describe("sortTeams", () => {
  const easy = team("EAS", [[cell({ difficulty: 20, xg: 2.2 })]]);
  const hard = team("HAR", [[cell({ difficulty: 80, xg: 0.7 })]]);
  const none = team("NON", [[]]);
  const teams = [hard, none, easy];

  it("puts the easiest first ascending and teams without a value last in both directions", () => {
    const asc = sortTeams(teams, { key: { kind: "matchday", column: 0 }, dir: "asc" }, 0, 1, "overall");
    const desc = sortTeams(teams, { key: { kind: "matchday", column: 0 }, dir: "desc" }, 0, 1, "overall");
    expect(asc.map((t) => t.code)).toEqual(["EAS", "HAR", "NON"]);
    expect(desc.map((t) => t.code)).toEqual(["HAR", "EAS", "NON"]);
  });

  it("treats higher xG as easier on the attack lens, and sorts names alphabetically", () => {
    expect(sortTeams(teams, { key: { kind: "average" }, dir: "asc" }, 0, 1, "attack").map((t) => t.code)).toEqual(["EAS", "HAR", "NON"]);
    expect(sortTeams(teams, { key: { kind: "team" }, dir: "desc" }, 0, 1, "overall").map((t) => t.code)).toEqual(["NON", "HAR", "EAS"]);
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

  it("describes relative time", () => {
    const now = new Date("2026-09-14T12:00:00Z");
    expect(relativeTime("2026-09-14T11:59:40Z", now)).toBe("just now");
    expect(relativeTime("2026-09-14T11:15:00Z", now)).toBe("45 min ago");
    expect(relativeTime("2026-09-14T06:00:00Z", now)).toBe("6 h ago");
    expect(relativeTime("2026-09-10T12:00:00Z", now)).toBe("4 days ago");
  });
});
