import { cellBucket, type Position, type PositionPick } from "../lib/grid";
import type { FixtureGrid, GridCell, Lens } from "../lib/types";
import Crest from "./Crest";

interface Props {
  grid: FixtureGrid;
  picks: Record<Position, PositionPick[]>;
  start: number;
  end: number;
  windowLabel: string; // "next 8 GWs" / "GW7"
  pins: readonly string[];
  onTogglePin: (code: string) => void;
}

const CARDS: { position: Position; title: string; measure: string; lens: Lens; value: (p: PositionPick) => string }[] = [
  {
    position: "forwards",
    title: "Forwards",
    measure: "Most expected goals",
    lens: "attack",
    value: (p) => `${p.xg.toFixed(1)} xG`,
  },
  {
    position: "midfielders",
    title: "Midfielders",
    measure: "Goals first, clean sheets too",
    lens: "overall",
    value: (p) => `${p.xg.toFixed(1)} xG · ${p.cleanSheets.toFixed(1)} CS`,
  },
  {
    position: "defenders",
    title: "Defenders & keepers",
    measure: "Most expected clean sheets",
    lens: "defence",
    value: (p) => `${p.cleanSheets.toFixed(1)} CS`,
  },
];

const MAX_STRIP = 8;

/** Which clubs to buy players from, by position, over the visible window. Clicking a club pins it. */
export default function PickCards({ grid, picks, start, end, windowLabel, pins, onTogglePin }: Props) {
  if (CARDS.every((card) => picks[card.position].length === 0)) {
    return (
      <section className="insights single" aria-label="Picks by position">
        <article className="card insight">
          <h2 className="insight-label">No games to rate in this window</h2>
          <div className="insight-meta">Move the window forward to see picks.</div>
        </article>
      </section>
    );
  }

  return (
    <section className="insights picks" aria-label={`Picks by position, ${windowLabel}`}>
      {CARDS.map((card) => (
        <article key={card.position} className="card insight pick-card">
          <header className="pick-head">
            <h2 className="pick-title">{card.title}</h2>
            <span className="pick-measure">
              {card.measure} · {windowLabel}
            </span>
          </header>
          <ol className="pick-list">
            {picks[card.position].map((pick, rank) => {
              const pinned = pins.includes(pick.team.code);
              return (
                <li key={pick.team.code}>
                  <button
                    type="button"
                    className="pick"
                    aria-pressed={pinned}
                    onClick={() => onTogglePin(pick.team.code)}
                    aria-label={`${rank + 1}. ${pick.team.name}: ${card.value(pick)} over ${pick.fixtures} ${pick.fixtures === 1 ? "game" : "games"}. ${pinned ? "Unpin" : "Pin"}`}
                  >
                    <span className="pick-rank" aria-hidden="true">{rank + 1}</span>
                    <Crest team={pick.team} size={22} />
                    <span className="pick-name">{pick.team.name}</span>
                    <span className="pick-value">{card.value(pick)}</span>
                    <FixtureStrip grid={grid} cells={pick.team.cells.slice(start, end)} lens={card.lens} />
                  </button>
                </li>
              );
            })}
          </ol>
        </article>
      ))}
    </section>
  );
}

/** The club's next games in the window, coloured for this position (blank weeks shown as a dash). */
function FixtureStrip({ grid, cells, lens }: { grid: FixtureGrid; cells: GridCell[][]; lens: Lens }) {
  const games = cells.flatMap((column) => (column.length ? column : [null])).slice(0, MAX_STRIP);
  return (
    <span className="pick-strip" aria-hidden="true">
      {games.map((cell, i) => {
        if (!cell) return <span key={`blank-${i}`} className="strip-chip blank">—</span>;
        const bucket = cellBucket(cell, lens, grid.lens_scales[lens]);
        return (
          <span key={cell.fixture_id} className={`strip-chip ${bucket ? `f${bucket}` : "muted"}`}>
            {cell.opponent_code}
            <small>{cell.venue === "H" ? "H" : "A"}</small>
          </span>
        );
      })}
    </span>
  );
}
