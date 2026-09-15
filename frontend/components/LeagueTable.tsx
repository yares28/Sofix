"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { TableMode } from "../lib/grid";
import { currentTable, predictedTable, zone, type Outcome } from "../lib/table";
import type { FixtureGrid } from "../lib/types";
import Crest from "./Crest";
import SegmentedControl from "./SegmentedControl";

interface Props {
  grid: FixtureGrid;
  through: number | null; // standings after this gameweek column; null = every result so far
  mode: TableMode;
  onMode: (mode: TableMode) => void;
}

const OUTCOME_WORD: Record<Outcome, string> = { W: "won", D: "drew", L: "lost" };
const pct = (value: number) => (value >= 0.995 ? ">99%" : value > 0 && value < 0.005 ? "<1%" : `${Math.round(value * 100)}%`);

export default function LeagueTable({ grid, through, mode, onMode }: Props) {
  const current = useMemo(() => currentTable(grid, through ?? undefined), [grid, through]);
  const gameweek = through === null ? undefined : grid.matchdays[through];
  // Only simulate when the predicted table is actually shown (5,000 seasons ≈ tens of ms).
  const predicted = useMemo(() => (mode === "predicted" ? predictedTable(grid) : []), [grid, mode]);
  const size = current.length;

  return (
    <section className="card league" aria-labelledby="table-title">
      <header className="section-head">
        <div>
          <h2 id="table-title">{mode === "current" ? tableTitle(gameweek) : "Predicted final table"}</h2>
          <div className="insight-meta">
            {mode === "current"
              ? `${gameweek ? `Games played up to GW${gameweek.number}` : "Played games only"}. Ties: head-to-head once both games are played, then goal difference, then goals.`
              : "Points so far plus expected points from every remaining fixture. Chances from 5,000 simulated seasons."}
          </div>
        </div>
        <SegmentedControl<TableMode>
          label="Table"
          value={mode}
          onChange={onMode}
          options={[
            { value: "current", label: "Current" },
            { value: "predicted", label: "Predicted" },
          ]}
        />
      </header>

      <div className="table-scroll">
        {mode === "current" ? (
          <table className="standings">
            <caption className="visually-hidden">LaLiga {grid.season} standings from played games</caption>
            <thead>
              <tr>
                <th scope="col" className="num">#</th>
                <th scope="col" className="club">Club</th>
                <th scope="col" className="num"><abbr title="Played">P</abbr></th>
                <th scope="col" className="num"><abbr title="Won">W</abbr></th>
                <th scope="col" className="num"><abbr title="Drawn">D</abbr></th>
                <th scope="col" className="num"><abbr title="Lost">L</abbr></th>
                <th scope="col" className="num wide"><abbr title="Goals for and against">Goals</abbr></th>
                <th scope="col" className="num"><abbr title="Goal difference">GD</abbr></th>
                <th scope="col" className="num strong"><abbr title="Points">Pts</abbr></th>
                <th scope="col" className="form-col">Form</th>
              </tr>
            </thead>
            <tbody>
              {current.map((row) => {
                const z = zone(row.position, size);
                return (
                  <tr key={row.team.code} className={z?.className}>
                    <td className="num pos">
                      {row.position}
                      {z && <span className="visually-hidden">, {z.label}</span>}
                    </td>
                    <th scope="row" className="club"><ClubLink team={row.team} /></th>
                    <td className="num">{row.played}</td>
                    <td className="num">{row.won}</td>
                    <td className="num">{row.drawn}</td>
                    <td className="num">{row.lost}</td>
                    <td className="num wide">{row.goalsFor}–{row.goalsAgainst}</td>
                    <td className="num">{signed(row.goalDifference)}</td>
                    <td className="num strong">{row.points}</td>
                    <td className="form-col">
                      <span className="form">
                        {row.form.map((outcome, i) => (
                          <span key={i} className={`form-chip ${outcome}`} aria-hidden="true">{outcome}</span>
                        ))}
                        <span className="visually-hidden">
                          Last {row.form.length}: {row.form.map((o) => OUTCOME_WORD[o]).join(", ") || "no games"}
                        </span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table className="standings predicted">
            <caption className="visually-hidden">Predicted final LaLiga {grid.season} table</caption>
            <thead>
              <tr>
                <th scope="col" className="num">#</th>
                <th scope="col" className="club">Club</th>
                <th scope="col" className="num"><abbr title="Points now">Now</abbr></th>
                <th scope="col" className="num"><abbr title="Games left">Left</abbr></th>
                <th scope="col" className="num"><abbr title="Expected points from the games left">+Exp</abbr></th>
                <th scope="col" className="num strong"><abbr title="Projected final points">Pts</abbr></th>
                <th scope="col" className="num"><abbr title="Projected goal difference">GD</abbr></th>
                <th scope="col" className="num">Title</th>
                <th scope="col" className="num">Top 4</th>
                <th scope="col" className="num"><abbr title="Relegation">Down</abbr></th>
              </tr>
            </thead>
            <tbody>
              {predicted.map((row) => {
                const z = zone(row.position, size);
                const move = row.currentPosition - row.position;
                return (
                  <tr key={row.team.code} className={z?.className}>
                    <td className="num pos">
                      {row.position}
                      <span className={`move ${move > 0 ? "up" : move < 0 ? "down" : ""}`} aria-hidden="true">
                        {move > 0 ? `▲${move}` : move < 0 ? `▼${-move}` : ""}
                      </span>
                      <span className="visually-hidden">
                        {move ? `, ${Math.abs(move)} ${move > 0 ? "up" : "down"} from ${row.currentPosition}` : ", same as now"}
                      </span>
                      {z && <span className="visually-hidden">, {z.label}</span>}
                    </td>
                    <th scope="row" className="club"><ClubLink team={row.team} /></th>
                    <td className="num">{row.points}</td>
                    <td className="num">{row.remaining}</td>
                    <td className="num">+{row.expectedToCome.toFixed(1)}</td>
                    <td className="num strong">{row.projectedPoints.toFixed(1)}</td>
                    <td className="num">{signed(Math.round(row.projectedGoalDifference))}</td>
                    <td className="num"><Chance value={row.title} /></td>
                    <td className="num"><Chance value={row.top4} /></td>
                    <td className="num"><Chance value={row.relegation} bad /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <ul className="zone-key" aria-label="Table colours">
        <li className="zone-ucl">Champions League</li>
        <li className="zone-uel">Europa League</li>
        <li className="zone-uecl">Conference League</li>
        <li className="zone-rel">Relegation</li>
      </ul>
    </section>
  );
}

/** "Table after GW5" for a past gameweek that's done; "LaLiga table" otherwise. */
export function tableTitle(gameweek: { number: number; finished: boolean } | undefined): string {
  return gameweek?.finished ? `Table after GW${gameweek.number}` : "LaLiga table";
}

function ClubLink({ team }: { team: FixtureGrid["teams"][number] }) {
  return (
    <Link href={`/team/${team.code}`} prefetch={false} className="club-link">
      <Crest team={team} size={22} />
      <span className="club-name">{team.name}</span>
    </Link>
  );
}

function Chance({ value, bad = false }: { value: number; bad?: boolean }) {
  const strength = Math.min(1, value);
  return (
    <span className={`chance ${bad ? "bad" : ""} ${value < 0.005 ? "none" : ""}`} style={{ ["--p" as string]: strength }}>
      {value < 0.005 ? "–" : pct(value)}
    </span>
  );
}

const signed = (value: number) => (value > 0 ? `+${value}` : String(value));
