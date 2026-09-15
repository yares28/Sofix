"use client";

import { useMemo } from "react";
import {
  kindestAndToughest, overviewWindow, positionPicks, runStats, sortTeams, windowLabel as labelFor, type Horizon, type TableMode,
} from "../lib/grid";
import type { FixtureGrid, Lens } from "../lib/types";
import ExpectedPointsCard from "./ExpectedPointsCard";
import GameweekCard from "./GameweekCard";
import PicksCard from "./PicksCard";
import RunCard from "./RunCard";
import TableCard from "./TableCard";

interface Props {
  grid: FixtureGrid;
  column: number; // the app-wide gameweek every card starts from
  tableThrough: number | null; // standings after this column; null = every result so far
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
 * The Difficulty tab's bento: three equal columns. Top row: kindest and toughest runs, the next gameweek, who to
 * pick. Bottom row: every club ranked over the window (two columns) beside the table, rows lined up.
 * Every card covers the same window, starting at the app-wide gameweek.
 */
export default function Overview(props: Props) {
  const { grid, column, finished, lens, pins } = props;
  const { start, end, horizon } = overviewWindow(grid.matchdays.length, column, props.horizon);

  const over = useMemo(() => {
    const statsFor = (which: Lens) =>
      new Map(grid.teams.map((team) => [team.code, runStats(team, start, end, which, grid.lens_scales[which], finished)]));
    const byLens = { overall: statsFor("overall"), attack: statsFor("attack"), defence: statsFor("defence"), odds: statsFor("odds") };
    const rank = (which: Lens) =>
      sortTeams(grid.teams, { key: { kind: "total" }, dir: "asc" }, start, end, which, byLens[which], finished);
    return {
      byLens,
      ranked: rank(lens),
      runs: kindestAndToughest(grid.teams, byLens.overall),
      picks: positionPicks(grid.teams, byLens.attack, byLens.defence, 5),
    };
  }, [grid, start, end, lens, finished]);

  const windowLabel = labelFor(grid.matchdays, start, end);

  return (
    <div className="bento">
      <div className="bento-runs">
        {over.runs ? (
          <>
            <RunCard grid={grid} label="Kindest run" team={over.runs.kindest} stats={over.byLens.overall.get(over.runs.kindest.code)!} start={start} end={end} windowLabel={windowLabel} />
            <RunCard grid={grid} label="Toughest run" team={over.runs.toughest} stats={over.byLens.overall.get(over.runs.toughest.code)!} start={start} end={end} windowLabel={windowLabel} />
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
