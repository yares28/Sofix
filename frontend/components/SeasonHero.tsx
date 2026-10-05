"use client";

import { useMemo } from "react";
import { predictedTable, type PredictedRow } from "../lib/table";
import type { FixtureGrid } from "../lib/types";
import Crest from "./Crest";

/**
 * Season · Table's hero (canvas board "4 · Season · Table"): the season played out 5,000 times from today's forecasts,
 * the favourite's chance of the title, and the three races (title, top four, going down), four clubs each.
 */
const pct = (v: number) => (v >= 0.995 ? ">99%" : v > 0 && v < 0.005 ? "<1%" : `${Math.round(v * 100)}%`);

export default function SeasonHero({ grid }: { grid: FixtureGrid }) {
  const rows = useMemo(() => predictedTable(grid, {}), [grid]);
  const race = (pick: (row: PredictedRow) => number, skipSure = false) =>
    [...rows]
      .filter((row) => pick(row) >= 0.005 && !(skipSure && pick(row) >= 0.995))
      .sort((a, b) => pick(b) - pick(a))
      .slice(0, 4);
  const leader = [...rows].sort((a, b) => b.title - a.title)[0];
  const races = [
    { name: "Title", rows: race((r) => r.title), pick: (r: PredictedRow) => r.title },
    // Clubs already certain of the top four are not a race; the next four are.
    { name: "Top four", rows: race((r) => r.top4, true), pick: (r: PredictedRow) => r.top4 },
    { name: "Going down", rows: race((r) => r.relegation), pick: (r: PredictedRow) => r.relegation },
  ];
  if (!leader) return null;
  return (
    <section className="st-hero">
      <div className="st-lead">
        <h1>The season, played out</h1>
        <p className="st-sub">5,000 seasons from today&apos;s forecasts</p>
        <p className="st-big">
          <Crest team={leader.team} size={84} />
          <b>{pct(leader.title)}</b>
          <span>chance {leader.team.name} win the league</span>
        </p>
      </div>
      <div className="st-races">
        {races.map((r, i) => (
          <article key={r.name} className="st-race" style={{ animationDelay: `${0.06 * (i + 1)}s` }} aria-label={r.name}>
            <h2>{r.name}</h2>
            <ol>
              {r.rows.map((row) => (
                <li key={row.team.code}>
                  <Crest team={row.team} size={20} />
                  <span>{row.team.name}</span>
                  <b>{pct(r.pick(row))}</b>
                </li>
              ))}
              {r.rows.length === 0 ? <li className="st-none">No club in it yet</li> : null}
            </ol>
          </article>
        ))}
      </div>
    </section>
  );
}
