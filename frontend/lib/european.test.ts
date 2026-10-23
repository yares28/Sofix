import { expect, it } from "vitest";
import { competitionOf } from "./competitions";
import { currentTable, zone } from "./table";
import { standings } from "./standings";
import { crestSource } from "../components/Crest";
import { FixtureGridSchema } from "./schema";
import type { FixtureGrid, GridCell } from "./types";
import { seasonEntries, leaguePhaseEntries, pointsTrend } from "./team";

function grid(): FixtureGrid {
  const scale = { cuts: [1, 2, 3, 4], higher_is_easier: false };
  const teams = Array.from({ length: 36 }, (_, i) => ({ code: `C${i}`, name: `Club ${i}`, color: "#123456", crest_url: null, cells: Array.from({ length: 9 }, (): GridCell[] => []) }));
  for (let i = 0; i < 36; i++) for (const [k, d] of [1, 3, 5, 7].entries()) {
    const other = (i + d) % 36, round = 2 * k + i % 2;
    for (const [me, them, venue] of [[i, other, "H"], [other, i, "A"]] as const) teams[me]!.cells[round]!.push({
      fixture_id: i * 4 + k, opponent_code: teams[them]!.code, venue, phase: "league", neutral: false,
      kickoff_utc: `2026-10-${round + 10}T19:00:00Z`, date_confirmed: true, rescheduled: false,
      status: round < 3 ? "finished" : "scheduled", result: round < 3 ? { goals_for: 0, goals_against: 0, outcome: "D" } : null,
      prediction: round < 3 ? null : { difficulty: 55, label: "Even", bucket: 3, expected_points: 1.35, probabilities: { win: .35, draw: .3, loss: .35 }, clean_sheet: .3, xg_for: 1.5, xg_against: 1.5 },
    });
  }
  teams[0]!.cells[8]!.push({ ...teams[0]!.cells[0]![0]!, phase: "knockout", result: { goals_for: 10, goals_against: 0, outcome: "W" } });
  return { competition: "CL", season: "2026/27", current_matchday: 4, model_version: "test", lens_scales: { overall: scale, attack: scale, defence: scale, odds: scale, record: scale, market_record: scale }, teams,
    matchdays: Array.from({ length: 9 }, (_, i) => ({ number: i + 1, date_from: `2026-10-${i + 10}T00:00:00Z`, date_to: `2026-10-${i + 10}T23:59:00Z`, finished: i < 3 })) };
}

it("recognizes validated European competitions and preserves phase/neutral fields", () => {
  expect(competitionOf("CL")).toBe("CL"); expect(competitionOf("EL")).toBe("EL"); expect(competitionOf("CONF")).toBe("CONF");
  const parsed = FixtureGridSchema.parse(grid());
  expect(parsed.teams[0]!.cells[0]![0]).toMatchObject({ phase: "league", neutral: false });
});

it("keeps knockout results out of the 36-club league-phase table", () => {
  const rows = currentTable(grid());
  expect(rows).toHaveLength(36);
  expect(rows.every(r => r.points === 3 && r.played === 3 && r.position === 1)).toBe(true);
  expect(zone(8, 36, "CONF")?.label).toBe("Round of 16");
  expect(zone(24, 36, "CL")?.label).toBe("Knockout play-off");
  expect(zone(25, 36, "CL")?.label).toBe("Eliminated");
});

it("keeps knockout results visible in the team calendar without awarding league points", () => {
  const board=grid(), entries=seasonEntries(board,board.teams[0]!);
  expect(entries.some(e=>e.cell?.phase==="knockout")).toBe(true);
  const trend=pointsTrend(leaguePhaseEntries(entries));
  expect(trend.filter(p=>p.kind==="actual").reduce((n,p)=>n+p.value,0)).toBe(3);
  expect(trend).toHaveLength(8);
});

it("uses banked league points plus remaining validated forecasts and UEFA cutoffs", () => {
  const rows = standings(grid(), { mode: "expected", simulations: 100 });
  expect(rows.every(r => Math.abs(r.xPts - 9.75) < .00001)).toBe(true);
  const sum = (key: "ucl" | "uel" | "uecl" | "rel") => rows.reduce((n, r) => n + r[key], 0);
  expect(sum("ucl")).toBeCloseTo(8); expect(sum("uel")).toBeCloseTo(16);
  expect(sum("uecl")).toBeCloseTo(24); expect(sum("rel")).toBeCloseTo(12);
});

it("allows only the exact UEFA team crest path", () => {
  expect(crestSource("https://img.uefa.com/imgml/TP/teams/logos/70x70/50080.png")).toContain("50080.png");
  for (const url of ["https://img.uefa.com/other.png", "https://img.uefa.com.evil/50080.png", "https://img.uefa.com/imgml/TP/teams/logos/70x70/50080.png?evil=1"]) expect(crestSource(url)).toBeNull();
});
