"use client";

import { useMemo } from "react";
import type { FixtureGrid } from "../lib/types";
import { formatDay } from "../lib/grid";
import { competitionOf } from "../lib/competitions";
import { boardStats, calendarDay } from "../lib/allDifficulty";
import CompetitionPicker from "./CompetitionPicker";
import Crest from "./Crest";

export default function DifficultyHero({ grid, start, end }: { grid: FixtureGrid; start: number; end: number }) {
  const best = useMemo(() => grid.teams.map(team => ({ team,
    points: boardStats(grid, team, start, end, "overall").total,
  })).filter((t): t is typeof t & { points: number } => t.points !== null)
    .sort((a, b) => b.points - a.points)[0] ?? null, [grid, start, end]);
  const first = grid.matchdays[start];
  const last = grid.matchdays[Math.max(start, end - 1)];
  const games = best?.team.cells.slice(start, end).flat().filter(c => c.status !== "finished" && c.prediction).length ?? 0;
  return <section className="df-hero">
    <CompetitionPicker icons competition={competitionOf(grid.competition)} week={first ? calendarDay(first.date_from) : undefined} through={first?.date_to} />
    <div className="df-copy">
      <h1>Who has the kindest run</h1>
      {first && last && <p className="df-sub">{grid.competition === "ALL"
        ? `${formatDay(first.date_from)} – ${formatDay(last.date_to)} · All competitions`
        : first.number === last.number ? `GW${first.number}, every club` : `GW${first.number}–GW${last.number}, every club`}</p>}
      {best ? <p className="df-big">
        <Crest team={best.team} size={84} /><b>{best.points.toFixed(1)}</b>
        <span>points {best.team.name} should take from the next {games} {games === 1 ? "game" : "games"}</span>
      </p> : <p>No rated games in this window.</p>}
    </div>
  </section>;
}

export function DifficultyLegend() {
  return <ul className="df-legend" aria-label="Colours">
    {["Very favourite", "Favourite", "Even", "Underdog", "Big underdog"].map((label, i) =>
      <li key={label}><i style={{ background: `var(--fdr${i + 1}-bg)` }} />{label}</li>)}
  </ul>;
}
