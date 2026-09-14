import type { Bucket } from "../lib/grid";
import type { GridCell } from "../lib/types";

interface Props {
  cells: GridCell[];
  bucketOf: (cell: GridCell) => Bucket | null;
  cellKey: (cell: GridCell) => string;
}

function Tile({ cell, bucket, compact, dataKey }: { cell: GridCell; bucket: Bucket | null; compact: boolean; dataKey: string }) {
  const venue = compact ? cell.venue : cell.venue === "H" ? "Home" : "Away";

  if (cell.status === "finished" && cell.result) {
    const { goals_for, goals_against, outcome } = cell.result;
    return (
      <div className={`cell result ${compact ? "compact" : ""}`} data-key={dataKey}>
        <span className="opp">{cell.opponent_code}</span>
        <span className={`score ${outcome}`}>{goals_for}–{goals_against}</span>
      </div>
    );
  }
  if (cell.status === "postponed") {
    return (
      <div className={`cell muted ${compact ? "compact" : ""}`} data-key={dataKey}>
        <span className="opp">{cell.opponent_code}</span>
        <span className="venue">Postponed</span>
      </div>
    );
  }
  return (
    <div className={`cell ${bucket ? `f${bucket}` : "muted"} ${compact ? "compact" : ""}`} data-key={dataKey}>
      <span className="opp">{cell.opponent_code}</span>
      <span className="venue">
        {cell.status === "live" ? "Live" : venue}
        {!cell.date_confirmed && !compact && <span className="tbc" aria-label="date to be confirmed"> · TBC</span>}
      </span>
    </div>
  );
}

export default function FixtureCell({ cells, bucketOf, cellKey }: Props) {
  if (cells.length === 0) return <div className="cell blank" aria-label="No match" />;
  const compact = cells.length > 1;
  return (
    <div className={compact ? "stack" : undefined}>
      {cells.map((cell) => (
        <Tile key={cell.fixture_id} cell={cell} bucket={bucketOf(cell)} compact={compact} dataKey={cellKey(cell)} />
      ))}
    </div>
  );
}
