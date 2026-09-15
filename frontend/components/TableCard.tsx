"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { TableMode } from "../lib/grid";
import { currentTable, predictedTable, zone, type Outcome } from "../lib/table";
import type { FixtureGrid, GridTeam } from "../lib/types";
import { CardLink } from "./CardLink";
import Crest from "./Crest";
import { tableTitle } from "./LeagueTable";
import SegmentedControl from "./SegmentedControl";

interface Props {
  grid: FixtureGrid;
  through: number | null; // standings after this gameweek column; null = every result so far
  mode: TableMode;
  onMode: (mode: TableMode) => void;
  onOpenTable: () => void;
}

interface Row {
  team: GridTeam;
  position: number;
  points: string;
  detail: React.ReactNode; // form (current) or movement (predicted)
  spoken: string;
}

const OUTCOME_WORD: Record<Outcome, string> = { W: "won", D: "drew", L: "lost" };

/** The whole table in one column: form and points now, or the predicted finish. */
export default function TableCard({ grid, through, mode, onMode, onOpenTable }: Props) {
  const rows = useMemo<Row[]>(() => {
    if (mode === "current") {
      return currentTable(grid, through ?? undefined).map((row) => ({
        team: row.team,
        position: row.position,
        points: String(row.points),
        detail: (
          <span className="form-dots">
            {row.form.map((outcome, i) => <span key={i} className={`form-dot ${outcome}`} />)}
          </span>
        ),
        spoken: `${row.points} points, last ${row.form.length}: ${row.form.map((o) => OUTCOME_WORD[o]).join(", ") || "no games"}`,
      }));
    }
    return predictedTable(grid, { simulations: 0 }).map((row) => { // projected points only: no chances shown here
      const move = row.currentPosition - row.position;
      return {
        team: row.team,
        position: row.position,
        points: row.projectedPoints.toFixed(1),
        detail: <span className={`move ${move > 0 ? "up" : move < 0 ? "down" : ""}`}>{move > 0 ? `▲${move}` : move < 0 ? `▼${-move}` : "–"}</span>,
        spoken: `${row.projectedPoints.toFixed(1)} projected points, ${move ? `${Math.abs(move)} ${move > 0 ? "up" : "down"} from ${row.currentPosition}` : "same as now"}`,
      };
    });
  }, [grid, mode, through]);

  return (
    <section className="card bento-card table-card" aria-labelledby="table-card-title">
      <header className="bento-head list-head">
        <h2 id="table-card-title" className="bento-title">
          {mode === "current" && through !== null && grid.matchdays[through]?.finished ? tableTitle(grid.matchdays[through]) : "Table"}
        </h2>
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
      <div className="list-columns table-row" aria-hidden="true">
        <span className="list-rank">#</span>
        <span>Club</span>
        <span>{mode === "current" ? "Form" : "Move"}</span>
        <span className="list-num">Pts</span>
      </div>
      <ol className="list-rows">
        {rows.map((row) => {
          const z = zone(row.position, rows.length);
          return (
            <li key={row.team.code} className={`table-row ${z?.className ?? ""}`}>
              <span className="list-rank zone-mark" aria-hidden="true">{row.position}</span>
              <Link href={`/team/${row.team.code}`} prefetch={false} className="list-club">
                <Crest team={row.team} size={22} />
                <span className="list-name">{row.team.name}</span>
              </Link>
              <span aria-hidden="true">{row.detail}</span>
              <span className="list-num strong" aria-hidden="true">{row.points}</span>
              <span className="visually-hidden">
                , {row.position}{z ? ` (${z.label})` : ""}: {row.spoken}
              </span>
            </li>
          );
        })}
      </ol>
      <CardLink onClick={onOpenTable}>Full table</CardLink>
    </section>
  );
}
