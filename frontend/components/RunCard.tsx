import Link from "next/link";
import { cellBucket, type RunStats } from "../lib/grid";
import type { FixtureGrid, GridTeam } from "../lib/types";
import Crest from "./Crest";

interface Props {
  grid: FixtureGrid;
  label: "Kindest run" | "Toughest run";
  team: GridTeam;
  stats: RunStats; // overall lens: total = expected points
  start: number;
  end: number;
  windowLabel: string;
}

/** One club's run over the window: expected points out of the maximum, and each game as a tile. */
export default function RunCard({ grid, label, team, stats, start, end, windowLabel }: Props) {
  const games = team.cells.slice(start, end).flatMap((column) => (column.length ? column : [null]));
  const points = stats.total ?? 0;
  return (
    <article className="card bento-card run-card" aria-label={`${label}: ${team.name}`}>
      <header className="bento-head">
        <h2 className="bento-label">{label}</h2>
        <span className="bento-meta">{windowLabel}</span>
      </header>
      <div className="run-team">
        <Crest team={team} size={44} />
        <div>
          <Link href={`/team/${team.code}`} prefetch={false} className="run-name">{team.name}</Link>
          <div className="bento-sub">
            {points.toFixed(1)} expected points from {3 * stats.fixtures}
          </div>
        </div>
      </div>
      <ol className="run-tiles" style={{ gridTemplateColumns: `repeat(${Math.max(games.length, 1)}, minmax(0, 88px))` }}>
        {games.map((cell, i) => {
          if (!cell) {
            return (
              <li key={`blank-${i}`} className="run-tile blank">
                <span className="visually-hidden">No game</span>
              </li>
            );
          }
          const bucket = cellBucket(cell, "overall", grid.lens_scales.overall);
          const opponent = grid.teams.find((t) => t.code === cell.opponent_code)?.name ?? cell.opponent_code;
          return (
            <li key={cell.fixture_id} className={`run-tile ${bucket ? `f${bucket}` : "muted"}`}>
              <span className="opp" aria-hidden="true">{cell.opponent_code}</span>
              <span className="venue" aria-hidden="true">{cell.venue}</span>
              <span className="visually-hidden">
                {cell.venue === "H" ? "Home to" : "Away to"} {opponent}
                {cell.prediction ? `, ${cell.prediction.label.toLowerCase()}` : ""}
              </span>
            </li>
          );
        })}
      </ol>
    </article>
  );
}
