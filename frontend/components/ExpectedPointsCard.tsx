"use client";

import Link from "next/link";
import { LENS_COPY, formatTotal, marketLines, windowLabel, type Horizon, type RunStats } from "../lib/grid";
import type { FixtureGrid, GridCell, GridTeam, Lens } from "../lib/types";
import Crest from "./Crest";
import FixtureChips, { FixtureChip, gamesInWords } from "./FixtureChips";
import SegmentedControl from "./SegmentedControl";

export type OverviewHorizon = Exclude<Horizon, "all">;

interface Props {
  grid: FixtureGrid;
  ranked: GridTeam[]; // best run first
  stats: Map<string, RunStats>; // for the chosen lens
  start: number;
  end: number;
  lens: Lens;
  horizon: OverviewHorizon;
  pins: readonly string[];
  onHorizon: (horizon: OverviewHorizon) => void;
  onLens: (lens: Lens) => void;
}

const HORIZONS: { value: OverviewHorizon; label: string }[] = [
  { value: "next", label: "Next" },
  { value: "3", label: "Next 3" },
  { value: "5", label: "Next 5" },
  { value: "8", label: "Next 8" },
];
const LENSES = (Object.keys(LENS_COPY) as Lens[]).map((value) => ({ value, label: LENS_COPY[value].label }));
const TITLES: Record<Lens, string> = { overall: "Expected points", attack: "Expected goals", defence: "Expected clean sheets" };
const COLUMNS: Record<Lens, string> = { overall: "xPts", attack: "xG", defence: "xCS" };
const ODDS_HEAD: Record<Lens, string> = { overall: "W · D · L odds", attack: "Scoring odds", defence: "CS · conceding odds" };
// Bookmakers price a week or two ahead: odds sit beside the games for the short horizons only.
const ODDS_HORIZONS: readonly OverviewHorizon[] = ["next", "3"];

/** Every club ranked by what its games in the window are worth, with the games (and their odds) alongside. */
export default function ExpectedPointsCard(props: Props) {
  const { grid, ranked, stats, start, end, lens, pins } = props;
  const copy = LENS_COPY[lens];
  const names = new Map(grid.teams.map((team) => [team.code, team.name]));
  const withOdds = ODDS_HORIZONS.includes(props.horizon);
  const gameweeks = grid.matchdays.slice(start, end);
  const oddsColumns = { gridTemplateColumns: `repeat(${Math.max(gameweeks.length, 1)}, minmax(0, 1fr))` };

  return (
    <section className={`card bento-card ladder-card ${withOdds ? "with-odds" : ""}`} aria-labelledby="ladder-title">
      <header className="bento-head list-head">
        <h2 id="ladder-title" className="bento-title">{TITLES[lens]}</h2>
        <div className="bento-controls">
          <SegmentedControl<OverviewHorizon> label="Horizon" value={props.horizon} onChange={props.onHorizon} options={HORIZONS} />
          <SegmentedControl<Lens> label="Lens" value={lens} onChange={props.onLens} options={LENSES} />
        </div>
      </header>
      <div className="list-columns ladder-row" aria-hidden="true">
        <span className="list-rank">#</span>
        <span>Club</span>
        <span className="list-num">{COLUMNS[lens]}</span>
        {withOdds ? (
          <span className="ladder-games odds-grid" style={oddsColumns}>
            {gameweeks.map((md) => (
              <span key={md.number} className="odds-head">
                GW{md.number} <small>{ODDS_HEAD[lens]}</small>
              </span>
            ))}
          </span>
        ) : (
          <span className="ladder-games">{windowLabel(grid.matchdays, start, end)}</span>
        )}
      </div>
      <ol className="list-rows">
        {ranked.map((team, i) => {
          const total = stats.get(team.code)?.total ?? null;
          const cells = team.cells.slice(start, end);
          return (
            <li key={team.code} className={`ladder-row ${pins.includes(team.code) ? "pinned" : ""}`}>
              <span className="list-rank" aria-hidden="true">{i + 1}</span>
              <Link href={`/team/${team.code}`} prefetch={false} className="list-club">
                <Crest team={team} size={22} />
                <span className="list-name">{team.name}</span>
                {pins.includes(team.code) && <span className="visually-hidden">, pinned</span>}
              </Link>
              <span className="list-num strong">
                {total === null ? "—" : formatTotal(total)}
                <span className="visually-hidden"> {copy.totalLong}</span>
              </span>
              {withOdds ? (
                <span className="ladder-games odds-grid" style={oddsColumns} aria-hidden="true">
                  {cells.map((column, c) => (
                    <OddsCell key={gameweeks[c]?.number ?? c} grid={grid} cells={column} lens={lens} />
                  ))}
                </span>
              ) : (
                <FixtureChips grid={grid} cells={cells} lens={lens} className="ladder-games" />
              )}
              <span className="visually-hidden">
                ; {withOdds ? oddsInWords(cells, gameweeks.map((md) => md.number), names, lens) : gamesInWords(cells, names)}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** One gameweek for one club: the game's chip, then its odds for the lens (a double shows the first game, +1). */
function OddsCell({ grid, cells, lens }: { grid: FixtureGrid; cells: GridCell[]; lens: Lens }) {
  const cell = cells[0] ?? null;
  return (
    <span className="odds-cell">
      <FixtureChip grid={grid} cell={cell} lens={lens} />
      {cell &&
        (cell.market ? (
          <span className="odds">
            {marketLines(cell.market, lens).map((line) => (
              <span key={line.label} className="odds-line">
                <span className="odds-label">{line.label}</span> {line.price}
              </span>
            ))}
          </span>
        ) : (
          <span className="odds odds-none">{cell.status === "finished" ? "Played" : "No odds yet"}</span>
        ))}
      {cells.length > 1 && <span className="odds-more">+{cells.length - 1}</span>}
    </span>
  );
}

function oddsInWords(columns: GridCell[][], numbers: number[], names: Map<string, string>, lens: Lens): string {
  return columns
    .map((cells, i) => {
      const games = cells.map((cell) => {
        const opponent = `${cell.venue === "H" ? "home to" : "away to"} ${names.get(cell.opponent_code) ?? cell.opponent_code}`;
        const odds = cell.market ? marketLines(cell.market, lens).map((line) => line.spoken).join(", ") : "no odds yet";
        return `${opponent}, odds: ${odds}`;
      });
      return `gameweek ${numbers[i]}: ${games.length ? games.join("; ") : "no game"}`;
    })
    .join(". ");
}
