import { cellBucket } from "../lib/grid";
import type { FixtureGrid, GridCell, Lens } from "../lib/types";

/** One game as a small coloured chip: opponent and venue. */
export function FixtureChip({ grid, cell, lens }: { grid: FixtureGrid; cell: GridCell | null; lens: Lens }) {
  if (!cell) return <span className="strip-chip blank">—</span>;
  const bucket = cellBucket(cell, lens, grid.lens_scales[lens]);
  return (
    <span className={`strip-chip ${bucket ? `f${bucket}` : "muted"}`}>
      {cell.opponent_code}
      <small>{cell.venue}</small>
    </span>
  );
}

/** A club's games in the window as chips (blank weeks as a dash, doubles as two chips). */
export default function FixtureChips({ grid, cells, lens, className = "" }: { grid: FixtureGrid; cells: GridCell[][]; lens: Lens; className?: string }) {
  const games = cells.flatMap((column) => (column.length ? column : [null]));
  return (
    <span className={`chips ${className}`} aria-hidden="true">
      {games.map((cell, i) => (
        <FixtureChip key={cell ? cell.fixture_id : `blank-${i}`} grid={grid} cell={cell} lens={lens} />
      ))}
    </span>
  );
}

/** The same games in words, for screen readers. */
export function gamesInWords(cells: GridCell[][], names: Map<string, string>): string {
  const games = cells.flat();
  if (!games.length) return "no games";
  return games
    .map((cell) => `${cell.venue === "H" ? "home to" : "away to"} ${names.get(cell.opponent_code) ?? cell.opponent_code}`)
    .join(", ");
}
