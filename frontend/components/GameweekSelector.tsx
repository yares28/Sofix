"use client";

import type { GridMatchday } from "../lib/types";
import { formatDay } from "../lib/grid";
import { Chevron } from "./Chevron";

interface Props {
  matchdays: GridMatchday[];
  column: number;
  opening: number;
  onSelect: (column: number) => void;
}

/** The app-wide gameweek: every tab and card starts from it. */
export default function GameweekSelector({ matchdays, column, opening, onSelect }: Props) {
  if (!matchdays.length) return null;
  const last = matchdays.length - 1;
  return (
    <div className="gw-selector" role="group" aria-label="Choose gameweek">
      <button type="button" className="gw-step" aria-label="Previous gameweek" disabled={column <= 0} onClick={() => onSelect(column - 1)}>
        <Chevron direction="left" />
      </button>
      <label className="visually-hidden" htmlFor="gw-select">
        Gameweek
      </label>
      <select id="gw-select" className="gw-select" value={column} onChange={(event) => onSelect(Number(event.target.value))}>
        {matchdays.map((md, i) => (
          <option key={md.number} value={i}>
            GW{md.number} · {formatDay(md.date_from)}
            {i === opening ? " · next" : md.finished ? " · played" : ""}
          </option>
        ))}
      </select>
      <button type="button" className="gw-step" aria-label="Next gameweek" disabled={column >= last} onClick={() => onSelect(column + 1)}>
        <Chevron direction="right" />
      </button>
      {column !== opening && (
        <button type="button" className="toggle gw-today" onClick={() => onSelect(opening)}>
          Back to GW{matchdays[opening]?.number}
        </button>
      )}
    </div>
  );
}
