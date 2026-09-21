"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo } from "react";
import type { TableMode } from "../lib/grid";
import { currentTable, predictedTable, zone, type Outcome } from "../lib/table";
import type { FixtureGrid } from "../lib/types";
import Crest from "./Crest";
import SegmentedControl from "./SegmentedControl";
// The chart pulls in a charting library: only the Table tab should pay for it, and only in the browser.
const TableProgression = dynamic(() => import("./TableProgression"), {
  ssr: false,
  loading: () => <div className="progression" aria-hidden="true" />,
});

interface Props {
  grid: FixtureGrid;
  through: number | null; // a gameweek picked by hand: results up to it, projection stopped there. null = all
  mode: TableMode;
  onMode: (mode: TableMode) => void;
}

const OUTCOME_WORD: Record<Outcome, string> = { W: "won", D: "drew", L: "lost" };
const pct = (value: number) => (value >= 0.995 ? ">99%" : value > 0 && value < 0.005 ? "<1%" : `${Math.round(value * 100)}%`);

export default function LeagueTable({ grid, through, mode, onMode }: Props) {
  const last = grid.matchdays.length - 1;
  const atEnd = through === null || through >= last;
  const gameweek = through === null ? undefined : grid.matchdays[through];
  const current = useMemo(() => currentTable(grid, through ?? undefined), [grid, through]);
  // Only simulate when the predicted table is actually shown (5,000 seasons ≈ tens of ms).
  const predicted = useMemo(
    () => (mode === "predicted" ? predictedTable(grid, atEnd ? {} : { through }) : []),
    [grid, mode, through, atEnd],
  );
  const size = current.length;
  const when = gameweek ? `GW${gameweek.number}` : "now";

  return (
    <section className="card league" aria-labelledby="table-title">
      <header className="section-head">
        <div>
          <h2 id="table-title">
            {mode === "current" ? tableTitle(gameweek) : atEnd ? "Predicted final table" : `Projected table after ${when}`}
          </h2>
          <div className="insight-meta">
            {mode === "current"
              ? `${gameweek ? `Games played up to ${when}` : "Played games only"}. Ties: head-to-head once both games are played, then goal difference, then goals.`
              : `Points won so far plus expected points from every fixture ${atEnd ? "still to play" : `up to ${when}`}. Chances from 5,000 simulated seasons. The gameweek arrows at the top walk it forward.`}
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
        {/* Both modes share this skeleton, so nothing shifts when the toggle flips. */}
        <table className={`standings ${mode}`}>
          <caption className="visually-hidden">
            {mode === "current" ? `LaLiga ${grid.season} standings from played games` : `Projected LaLiga ${grid.season} table`}
          </caption>
          <colgroup>
            <col className="col-pos" />
            <col className="col-club" />
            <col span={7} className="col-num" />
            <col className="col-last" />
          </colgroup>
          <thead>
            {mode === "current" ? (
              <tr>
                <th scope="col" className="num pos">#</th>
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
            ) : (
              <tr>
                <th scope="col" className="num pos">#</th>
                <th scope="col" className="club">Club</th>
                <th scope="col" className="num"><abbr title="Played">P</abbr></th>
                <th scope="col" className="num"><abbr title="Points won so far">Pts</abbr></th>
                <th scope="col" className="num"><abbr title="Games still to play">To play</abbr></th>
                <th scope="col" className="num strong">
                  <abbr title="Expected points: won so far plus what the forecast expects from the games to come">xPts</abbr>
                </th>
                <th scope="col" className="num"><abbr title="Expected goal difference, from expected goals">xGD</abbr></th>
                <th scope="col" className="num">
                  <abbr title={atEnd ? "Chance of finishing first" : `Chance of leading after ${when}`}>1st</abbr>
                </th>
                <th scope="col" className="num">
                  <abbr title={atEnd ? "Chance of finishing in the top four" : `Chance of being in the top four after ${when}`}>Top 4</abbr>
                </th>
                <th scope="col" className="num">
                  <abbr title={atEnd ? "Chance of being relegated" : `Chance of being in the bottom three after ${when}`}>Down</abbr>
                </th>
              </tr>
            )}
          </thead>
          <tbody>
            {mode === "current"
              ? current.map((row) => {
                  const z = zone(row.position, size);
                  return (
                    <tr key={row.team.code} className={z?.className}>
                      <Position position={row.position} zoneLabel={z?.label} />
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
                })
              : predicted.map((row) => {
                  const z = zone(row.position, size);
                  const move = row.currentPosition - row.position;
                  return (
                    <tr key={row.team.code} className={z?.className}>
                      <Position position={row.position} zoneLabel={z?.label} move={move} from={row.currentPosition} />
                      <th scope="row" className="club"><ClubLink team={row.team} /></th>
                      <td className="num">{row.played}</td>
                      <td className="num">{row.points}</td>
                      <td className="num">{row.remaining}</td>
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
      </div>

      <ul className="zone-key" aria-label="Table colours">
        <li className="zone-ucl">Champions League</li>
        <li className="zone-uel">Europa League</li>
        <li className="zone-uecl">Conference League</li>
        <li className="zone-rel">Relegation</li>
      </ul>

      <TableProgression grid={grid} through={through} />
    </section>
  );
}

/** "Table after GW5" for a past gameweek that's done; "LaLiga table" otherwise. */
export function tableTitle(gameweek: { number: number; finished: boolean } | undefined): string {
  return gameweek?.finished ? `Table after GW${gameweek.number}` : "LaLiga table";
}

/** The same cell in both modes, so the first column never changes width: the badge is simply empty in Current. */
function Position({ position, zoneLabel, move, from }: { position: number; zoneLabel?: string; move?: number; from?: number }) {
  return (
    <td className="num pos">
      {position}
      <span className={`move ${move && move > 0 ? "up" : move && move < 0 ? "down" : ""}`} aria-hidden="true">
        {move === undefined ? "" : move > 0 ? `▲${move}` : move < 0 ? `▼${-move}` : ""}
      </span>
      {move !== undefined && (
        <span className="visually-hidden">{move ? `, ${Math.abs(move)} ${move > 0 ? "up" : "down"} from ${from}` : ", same as now"}</span>
      )}
      {zoneLabel && <span className="visually-hidden">, {zoneLabel}</span>}
    </td>
  );
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
