import type { Bucket } from "../lib/grid";
import type { GridCell } from "../lib/types";

interface Props {
  cells: GridCell[];
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
}

/** A button, so every fixture can be reached and read without a mouse; details open in the tooltip. */
function Tile({ cell, bucket, compact, dataKey, label, row, column }: TileProps) {
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
  const venue = compact ? cell.venue : cell.venue === "H" ? "Home" : "Away";
  return (
    <button {...common} className={`cell ${bucket ? `f${bucket}` : "muted"} ${size}`}>
      {/* The number repeats the colour, for colour-blind readers and greyscale prints. */}
      {bucket && !compact && <span className="bucket-num">{bucket}</span>}
      <span className="opp">{cell.opponent_code}</span>
      <span className="venue">
        {cell.status === "live" ? "Live" : venue}
        {!cell.date_confirmed && !compact && <span className="tbc"> · TBC</span>}
      </span>
    </button>
  );
}

export default function FixtureCell({ cells, bucketOf, cellKey, labelOf, row, column }: Props) {
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
        />
      ))}
    </div>
  );
}
