"use client";

import { useMemo } from "react";
import {
  mostPointsComing, overviewWindow, positionPicks, runStats, scheduleSwing, sortTeams, windowLabel as labelFor, type Horizon, type RunStats, type TableMode,
} from "../lib/grid";
import type { FixtureGrid, GridTeam, Lens } from "../lib/types";
import ExpectedPointsCard from "./ExpectedPointsCard";
import GameweekCard from "./GameweekCard";
import PicksCard from "./PicksCard";
import RunCard, { type RunView } from "./RunCard";
import TableCard from "./TableCard";

interface Props {
  grid: FixtureGrid;
  column: number; // the app-wide gameweek every card starts from
  tableThrough: number | null; // a gameweek picked by hand; null = every result so far
  finished: readonly boolean[];
  lens: Lens;
  horizon: Horizon;
  tableMode: TableMode;
  pins: readonly string[];
  onHorizon: (horizon: Horizon) => void;
  onLens: (lens: Lens) => void;
  onTableMode: (mode: TableMode) => void;
  onTogglePin: (code: string) => void;
  onOpenMatches: () => void;
  onOpenTable: () => void;
}

/**
 * The Difficulty tab's bento: three equal columns. Top row: the two run cards (most and fewest points coming,
 * each with an arrow to the matching schedule swing), the next gameweek, who to pick. Bottom row: every club ranked over the window (two columns) beside the table, rows lined up.
 * Every card covers the same window, starting at the app-wide gameweek.
 */
export default function Overview(props: Props) {
  const { grid, column, finished, lens, pins } = props;
  const { start, end, horizon } = overviewWindow(grid.matchdays.length, column, props.horizon);

  const over = useMemo(() => {
    const statsFor = (which: Lens) =>
      new Map(grid.teams.map((team) => [team.code, runStats(team, start, end, which, grid.lens_scales[which], finished)]));
    const byLens: Record<Lens, Map<string, RunStats>> = {
      overall: statsFor("overall"),
      attack: statsFor("attack"),
      defence: statsFor("defence"),
      odds: statsFor("odds"),
      record: statsFor("record"),
      market_record: statsFor("market_record"),
    };
    // The swing baseline is the club's own level over everything it has left from the same gameweek.
    const rest = new Map(
      grid.teams.map((team) => [team.code, runStats(team, start, grid.matchdays.length, "overall", grid.lens_scales.overall, finished)]),
    );
    const rank = (which: Lens) =>
      sortTeams(grid.teams, { key: { kind: "total" }, dir: "asc" }, start, end, which, byLens[which], finished);
    return {
      byLens,
      ranked: rank(lens),
      runs: mostPointsComing(grid.teams, byLens.overall),
      swings: scheduleSwing(grid.teams, byLens.overall, rest),
      picks: positionPicks(grid.teams, byLens.attack, byLens.defence, 5),
    };
  }, [grid, start, end, lens, finished]);

  const windowLabel = labelFor(grid.matchdays, start, end);

  // Each card holds two views and an arrow between them: the points it is due, then how that compares
  // with the club's own usual level. Two cards instead of four, one layout instead of two.
  const runViews = (side: "best" | "worst"): RunView[] => {
    const statsOf = (team: GridTeam) => over.byLens.overall.get(team.code)!;
    const run = over.runs![side];
    const views: RunView[] = [{ label: side === "best" ? "Most points coming" : "Fewest points coming", team: run, stats: statsOf(run) }];
    const swing = over.swings?.[side];
    if (swing) {
      views.push({
        label: side === "best" ? "Softest schedule" : "Hardest schedule",
        team: swing.team,
        stats: statsOf(swing.team),
        swing: swing.swing,
      });
    }
    return views;
  };

  return (
    <div className="bento">
      <div className="bento-runs">
        {over.runs ? (
          <>
            <RunCard grid={grid} start={start} end={end} windowLabel={windowLabel} views={runViews("best")} />
            <RunCard grid={grid} start={start} end={end} windowLabel={windowLabel} views={runViews("worst")} />
          </>
        ) : (
          <article className="card bento-card">
            <h2 className="bento-label">No games left to rate in this window</h2>
            <p className="bento-sub">Pick a later gameweek to compare runs.</p>
          </article>
        )}
      </div>
      <GameweekCard grid={grid} column={column} onDetails={props.onOpenMatches} />
      <PicksCard grid={grid} picks={over.picks} start={start} end={end} windowLabel={windowLabel} pins={pins} onTogglePin={props.onTogglePin} />
      <ExpectedPointsCard
        grid={grid}
        ranked={over.ranked}
        stats={over.byLens[lens]}
        start={start}
        end={end}
        lens={lens}
        horizon={horizon}
        pins={pins}
        onHorizon={props.onHorizon}
        onLens={props.onLens}
      />
      <TableCard grid={grid} through={props.tableThrough} mode={props.tableMode} onMode={props.onTableMode} onOpenTable={props.onOpenTable} />
    </div>
  );
}
