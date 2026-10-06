"use client";

import { useMemo } from "react";
import type { FixtureGrid } from "../lib/types";
import Crest from "./Crest";

/**
 * Season · Difficulty's hero (canvas board "5 · Season · Difficulty"): who has the kindest run over the rounds in view,
 * as the points the forecast expects them to take, and the five colours the grid uses.
 */
export default function DifficultyHero({ grid, start, end }: { grid: FixtureGrid; start: number; end: number }) {
  const best = useMemo(() => {
    const totals = grid.teams.map((team) => ({
      team,
      points: team.cells.slice(start, end).flat().reduce((sum, cell) => sum + (cell.prediction?.expected_points ?? 0), 0),
    }));
    return totals.sort((a, b) => b.points - a.points)[0] ?? null;
  }, [grid, start, end]);
  const first = grid.matchdays[start]?.number;
  const last = grid.matchdays[Math.max(start, end - 1)]?.number;
  const games = end - start;
  if (!best || first === undefined) return null;
  return (
    <section className="df-hero">
      <h1>Who has the kindest run</h1>
      <p className="df-sub">{first === last ? `Round ${first}` : `Rounds ${first} to ${last}`}, every club</p>
      <p className="df-big">
        <Crest team={best.team} size={84} />
        <b>{best.points.toFixed(1)}</b>
        <span>
          points {best.team.name} should take from the next {games === 1 ? "game" : games}
        </span>
      </p>
    </section>
  );
}

/** The grid's five colours, easiest first: Sorare's score bands (app/globals.css, --fdr1 to --fdr5). */
export function DifficultyLegend() {
  return (
    <ul className="df-legend" aria-label="Colours">
      {["Very favourite", "Favourite", "Even", "Underdog", "Big underdog"].map((label, i) => (
        <li key={label}>
          <i style={{ background: `var(--fdr${i + 1}-bg)` }} />
          {label}
        </li>
      ))}
    </ul>
  );
}
