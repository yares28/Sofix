import type { Bucket } from "../lib/grid";
import type { GridCell } from "../lib/types";

interface Props {
  cells: GridCell[];
  showTbc: boolean; // false when the column header already says the matchday's dates are TBC
  bucketOf: (cell: GridCell) => Bucket | null;
  cellKey: (cell: GridCell) => string;
  labelOf: (cell: GridCell) => string;
  row: number;
  column: number;
}

interface TileProps {
  cell: GridCell;
  bucket: Bucket | null;
  compact: boolean;
  dataKey: string;
  label: string;
  row: number;
  column: number;
  showTbc: boolean;
}

/** A button, so every fixture can be reached and read without a mouse; details open in the tooltip. */
function Tile({ cell, bucket, compact, dataKey, label, row, column, showTbc }: TileProps) {
  const common = {
    type: "button" as const,
    "data-key": dataKey,
    "data-row": row,
    "data-col": column,
    "aria-label": label,
  };
  const size = compact ? "compact" : "";

  if (cell.status === "finished" && cell.result) {
    const { goals_for, goals_against, outcome } = cell.result;
    return (
      <button {...common} className={`cell result ${size}`}>
        <span className="opp">{cell.opponent_code}</span>
        <span className={`score ${outcome}`}>
          {goals_for}–{goals_against}
        </span>
      </button>
    );
  }
  if (cell.status === "postponed") {
    return (
      <button {...common} className={`cell muted ${size}`}>
        <span className="opp">{cell.opponent_code}</span>
        <span className="venue">Postponed</span>
      </button>
    );
  }
  return (
    <button {...common} className={`cell ${bucket ? `f${bucket}` : "muted"} ${size}`}>
      <span className="opp">{cell.opponent_code}</span>
      <span className="venue">
        {cell.status === "live" ? (
          "Live"
        ) : compact ? (
          cell.venue
        ) : (
          <>
            {/* Narrow screens show H / A (CSS picks one). */}
            <span className="venue-long">{cell.venue === "H" ? "Home" : "Away"}</span>
            <span className="venue-short">{cell.venue}</span>
          </>
        )}
        {showTbc && !cell.date_confirmed && !compact && <span className="tbc"> · TBC</span>}
      </span>
    </button>
  );
}

export default function FixtureCell({ cells, bucketOf, cellKey, labelOf, row, column, showTbc }: Props) {
  if (cells.length === 0) {
    return (
      <div className="cell blank">
        <span className="visually-hidden">No match</span>
      </div>
    );
  }
  const compact = cells.length > 1;
  return (
    <div className={compact ? "stack" : undefined}>
      {compact && (
        <span className="double-badge" aria-hidden="true">
          ×{cells.length}
        </span>
      )}
      {cells.map((cell) => (
        <Tile
          key={cell.fixture_id}
          cell={cell}
          bucket={bucketOf(cell)}
          compact={compact}
          dataKey={cellKey(cell)}
          label={labelOf(cell)}
          row={row}
          column={column}
          showTbc={showTbc}
        />
      ))}
    </div>
  );
}
