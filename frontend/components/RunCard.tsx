"use client";

import Link from "next/link";
import { useState } from "react";
import { cellBucket, type RunStats } from "../lib/grid";
import type { FixtureGrid, GridTeam } from "../lib/types";
import { Chevron } from "./Chevron";
import Crest from "./Crest";

export interface RunView {
  label: string;
  team: GridTeam;
  stats: RunStats; // overall lens: total = expected points
  /** Expected points per game above (+) or below (−) the club's usual level; absent for a points view. */
  swing?: number;
}

interface Props {
  grid: FixtureGrid;
  /** The views this card cycles through with its arrow: points first, then the schedule swing. */
  views: RunView[];
  start: number;
  end: number;
  windowLabel: string;
}

/** One club's run over the window: what it is worth, and each game as a tile. The arrow swaps which question it answers. */
export default function RunCard({ grid, views, start, end, windowLabel }: Props) {
  const [index, setIndex] = useState(0);
  const view = views[index % views.length]!;
  const next = views[(index + 1) % views.length]!;
  const { team, stats, swing } = view;
  const games = team.cells.slice(start, end).flatMap((column) => (column.length ? column : [null]));
  const summary =
    swing === undefined
      ? `${(stats.total ?? 0).toFixed(1)} expected points from ${3 * stats.fixtures}`
      : `${swing >= 0 ? "+" : "−"}${Math.abs(swing).toFixed(1)} points a game ${swing >= 0 ? "above" : "below"} its usual`;
  return (
    <article className="card bento-card run-card" aria-label={`${view.label}: ${team.name}`}>
      <header className="bento-head">
        <h2 className="bento-label">{view.label}</h2>
        <span className="run-head-end">
          <span className="bento-meta">{windowLabel}</span>
          {views.length > 1 && (
            <button
              type="button"
              className="run-switch"
              aria-label={`Show ${next.label.toLowerCase()}`}
              onClick={() => setIndex((i) => (i + 1) % views.length)}
            >
              <Chevron direction="right" />
            </button>
          )}
        </span>
      </header>
      <div className="run-team">
        <Crest team={team} size={44} />
        <div>
          <Link href={`/team/${team.code}`} prefetch={false} className="run-name">{team.name}</Link>
          <div className="bento-sub">{summary}</div>
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
