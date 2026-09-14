"use client";

import Link from "next/link";
import { memo } from "react";
import { BUCKET_STRONG, cellBucket, cellLabel, formatTotal, scaleBucket, type RunStats } from "../lib/grid";
import type { GridMatchday, GridTeam, Lens, LensScale } from "../lib/types";
import Crest from "./Crest";
import FixtureCell from "./FixtureCell";

interface Props {
  team: GridTeam;
  rowIndex: number;
  start: number;
  end: number;
  lens: Lens;
  scale: LensScale;
  stats: RunStats;
  barPercent: number | null;
  isPinned: boolean;
  matchesSearch: boolean;
  matchdays: GridMatchday[];
  columnTbc: readonly boolean[];
  teamsByCode: Map<string, GridTeam>;
  onTogglePin: (code: string) => void;
}

/** One team's row. Memoised: typing in search or hovering only re-renders rows whose props changed. */
function TeamRow({
  team, rowIndex, start, end, lens, scale, stats, barPercent, isPinned, matchesSearch, matchdays, columnTbc,
  teamsByCode, onTogglePin,
}: Props) {
  return (
    <tr className={`${matchesSearch ? "" : "dim"} ${isPinned ? "pinned" : ""}`}>
      <th scope="row" className="team-col">
        <div className="team">
          <Link href={`/team/${team.code}`} prefetch={false} className="team-link">
            <Crest team={team} />
            <span className="team-name">{team.name}</span>
          </Link>
          <button
            type="button"
            className="pin"
            onClick={() => onTogglePin(team.code)}
            aria-pressed={isPinned}
            aria-label={`Pin ${team.name}`}
            title={isPinned ? "Unpin" : "Pin to the top"}
          >
            <PinIcon filled={isPinned} />
          </button>
        </div>
      </th>
      {team.cells.slice(start, end).map((cells, i) => {
        const column = start + i;
        const matchday = matchdays[column]?.number ?? column + 1;
        return (
          <td key={matchday}>
            <FixtureCell
              cells={cells}
              row={rowIndex}
              column={column}
              showTbc={!columnTbc[column]}
              cellKey={(cell) => `${team.code}-${cell.fixture_id}`}
              bucketOf={(cell) => cellBucket(cell, lens, scale)}
              labelOf={(cell) =>
                cellLabel(cell, team.name, matchday, teamsByCode.get(cell.opponent_code)?.name ?? cell.opponent_code, lens)
              }
            />
          </td>
        );
      })}
      <td className="avg-col">
        {stats.total === null || barPercent === null ? (
          <span className="avg-empty">—</span>
        ) : (
          <div className="avg">
            <span className="avg-num">{formatTotal(stats.total)}</span>
            <div className="bar">
              <span
                style={{
                  width: `${barPercent}%`,
                  background: BUCKET_STRONG[stats.average === null ? 3 : scaleBucket(stats.average, scale)],
                }}
              />
            </div>
          </div>
        )}
        {(stats.blanks > 0 || stats.doubles > 0) && (
          <div className="run-badges">
            {stats.doubles > 0 && <span className="badge double">{stats.doubles > 1 ? `${stats.doubles}×` : ""}×2</span>}
            {stats.blanks > 0 && <span className="badge blank">{stats.blanks} blank</span>}
          </div>
        )}
      </td>
    </tr>
  );
}

function PinIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M9 3h6l-1 6 3 3v2h-4v7l-1 1-1-1v-7H7v-2l3-3-1-6z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default memo(TeamRow);
