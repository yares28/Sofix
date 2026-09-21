"use client";

import Link from "next/link";
import { Fragment, useState, type CSSProperties } from "react";
import {
  LENS_COPY, PRICE_OPTIONS, cellBucket, decimalOdds, formatTotal, marketLabels, marketLines, playedValue, type Horizon, type PriceOption, type RunStats,
} from "../lib/grid";
import type { FixtureGrid, GridCell, GridMatchday, GridTeam, Lens } from "../lib/types";
import Crest from "./Crest";
import { FixtureChip } from "./FixtureChips";
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
const TITLES: Record<Lens, string> = {
  overall: "Expected points", attack: "Expected goals", defence: "Expected clean sheets", odds: "Market odds",
  record: "Wins vs its rating", market_record: "Wins vs its odds",
};
const COLUMNS: Record<Lens, string> = {
  overall: "xPts", attack: "xG", defence: "xCS", odds: "Mkt/gm", record: "Gap", market_record: "Gap",
};
const CHANCE: Record<Lens, string> = {
  overall: "Win chance · market", odds: "Win chance · market", attack: "Scoring chance · market", defence: "Clean-sheet chance · market",
  record: "Win chance · market", market_record: "Win chance · market",
};

/**
 * Every club ranked over the window. Next: the gameweek's prices in columns and the market's chance as a bar.
 * Next 3 / 5 / 8: one tile per gameweek with the price picked in the Price menu. Odds ranks by the bookmakers.
 */
export default function ExpectedPointsCard(props: Props) {
  const { grid, ranked, stats, start, end, lens, pins } = props;
  const copy = LENS_COPY[lens];
  const names = new Map(grid.teams.map((team) => [team.code, team.name]));
  const gameweeks = grid.matchdays.slice(start, end);
  const single = props.horizon === "next";

  // The price shown in tiles. Overall and Odds share one list, so a choice carries between them.
  const [choice, setChoice] = useState<{ options: PriceOption[]; index: number }>({ options: PRICE_OPTIONS[lens], index: 0 });
  const options = PRICE_OPTIONS[lens];
  const option = options[choice.options === options ? choice.index : 0] ?? options[0]!;
  const priced = (column: number) => grid.teams.some((team) => (team.cells[column] ?? []).some((cell) => cell.market));
  const labels = marketLabels(lens);

  // On the Next horizon the clubs that have already played sit under a line, still showing what the board
  // expected of them, instead of dropping to the bottom with a dash next to every other blank club.
  const gone = (team: GridTeam) =>
    single && (team.cells[start] ?? []).some((cell) => cell.status === "finished" || cell.status === "live");
  const valueOf = (team: GridTeam) => {
    const cell = shown(team.cells[start] ?? []);
    return cell ? playedValue(cell, lens) : null;
  };
  const toPlay = single ? ranked.filter((team) => !gone(team)) : ranked;
  const played = single ? ranked.filter(gone).sort((a, b) => (valueOf(b) ?? -1) - (valueOf(a) ?? -1)) : [];
  const rows = [...toPlay, ...played];

  return (
    <section className="card bento-card ladder-card" aria-labelledby="ladder-title">
      <header className="bento-head list-head">
        <h2 id="ladder-title" className="bento-title">{TITLES[lens]}</h2>
        <div className="bento-controls">
          <SegmentedControl<OverviewHorizon> label="Horizon" value={props.horizon} onChange={props.onHorizon} options={HORIZONS} />
          <SegmentedControl<Lens> label="Lens" value={lens} onChange={props.onLens} options={LENSES} />
        </div>
      </header>

      <div className="list-columns ladder-row">
        <span className="list-rank" aria-hidden="true">#</span>
        <span aria-hidden="true">Club</span>
        <span className="list-num" aria-hidden="true">{COLUMNS[lens]}</span>
        {single ? (
          <span className="ladder-games next-line" style={{ "--prices": labels.length } as CSSProperties} aria-hidden="true">
            <span>{gameweeks[0] ? `GW${gameweeks[0].number}` : ""}</span>
            {labels.map((label, i) => (
              <span key={label} className={`price ${i === 0 ? "lead" : ""}`}>{label}</span>
            ))}
            <span className="mkt-head">{CHANCE[lens]}</span>
          </span>
        ) : (
          <span className="ladder-games tiles-head" data-count={gameweeks.length}>
            <span className="gw-labels" aria-hidden="true">
              {gameweeks.map((md, i) => (
                <span key={md.number} className={priced(start + i) ? "" : "unpriced"}>
                  GW{md.number}
                  {gameweeks.length <= 3 && !priced(start + i) && <span className="unpriced-note"> · not priced</span>}
                </span>
              ))}
            </span>
            <label className="price-menu">
              <span>Price</span>
              <select
                value={options.indexOf(option)}
                onChange={(event) => setChoice({ options, index: Number(event.target.value) })}
                aria-label="Price shown in each gameweek's tile"
              >
                {options.map((o, i) => (
                  <option key={o.label} value={i}>{o.label}</option>
                ))}
              </select>
            </label>
          </span>
        )}
      </div>

      <ol className="list-rows">
        {rows.map((team, i) => {
          const isPlayed = i >= toPlay.length;
          const cells = team.cells.slice(start, end);
          const total = isPlayed ? valueOf(team) : (stats.get(team.code)?.total ?? null);
          return (
            <Fragment key={team.code}>
              {isPlayed && i === toPlay.length && (
                <li className="list-divider">
                  <span>Already played</span>
                </li>
              )}
            <li className={`ladder-row ${isPlayed ? "played" : ""} ${pins.includes(team.code) ? "pinned" : ""}`}>
              <span className="list-rank" aria-hidden="true">{isPlayed ? "" : i + 1}</span>
              <Link href={`/team/${team.code}`} prefetch={false} className="list-club">
                <Crest team={team} size={22} />
                <span className="list-name">{team.name}</span>
                {pins.includes(team.code) && <span className="visually-hidden">, pinned</span>}
              </Link>
              <span className="list-num strong">
                {total === null ? "—" : formatTotal(total, lens)}
                <span className="visually-hidden"> {copy.totalLong}</span>
              </span>
              {single ? (
                <NextLine grid={grid} cells={cells[0] ?? []} lens={lens} labels={labels} />
              ) : (
                <Tiles grid={grid} columns={cells} lens={lens} option={option} />
              )}
              <span className="visually-hidden">
                ; {inWords(cells, gameweeks, names, lens, single ? null : option)}
              </span>
            </li>
            </Fragment>
          );
        })}
      </ol>
    </section>
  );
}

/** The game a gameweek's tile or row shows: the first one with a price, else the first (a double shows +1). */
function shown(cells: GridCell[]): GridCell | null {
  return cells.find((cell) => cell.market) ?? cells[0] ?? null;
}

/** Next: the game, its prices for the lens, and the market's chance filling the rest of the row. */
function NextLine({ grid, cells, lens, labels }: { grid: FixtureGrid; cells: GridCell[]; lens: Lens; labels: string[] }) {
  const cell = shown(cells);
  const prices = cell?.market ? marketLines(cell.market, lens).map((line) => line.price) : labels.map(() => "—");
  return (
    <span className="ladder-games next-line" style={{ "--prices": labels.length } as CSSProperties} aria-hidden="true">
      <span className="next-game">
        <FixtureChip grid={grid} cell={cell} lens={lens} />
        {cells.length > 1 && <span className="next-more">+{cells.length - 1}</span>}
      </span>
      {prices.map((price, i) => (
        <span key={labels[i]} className={`price ${i === 0 ? "lead" : ""}`}>{price}</span>
      ))}
      <Chance cell={cell} lens={lens} />
    </span>
  );
}

function Chance({ cell, lens }: { cell: GridCell | null; lens: Lens }) {
  if (!cell) return <span className="mkt-note outline">No game</span>;
  if (cell.status === "finished" && cell.result) {
    return <span className="mkt-note">Played · {cell.result.goals_for}–{cell.result.goals_against}</span>;
  }
  if (cell.status === "live") return <span className="mkt-note">Live now</span>;
  if (cell.status === "postponed") return <span className="mkt-note">Postponed</span>;
  const m = cell.market;
  if (!m) return <span className="mkt-note outline">Not priced yet</span>;
  const lead = lens === "attack" ? m.scores : lens === "defence" ? m.clean_sheet : m.win;
  return (
    <span className="mkt-chance">
      {lens === "attack" || lens === "defence" ? (
        <span className="mkt-bar">
          <span className="win" style={{ flexGrow: lead }} />
          <span className="rest" style={{ flexGrow: 1 - lead }} />
        </span>
      ) : (
        <span className="mkt-bar">
          <span className="win" style={{ flexGrow: m.win }} />
          <span className="draw" style={{ flexGrow: m.draw }} />
          <span className="loss" style={{ flexGrow: m.loss }} />
        </span>
      )}
      <span className="mkt-pct">{Math.round(lead * 100)}%</span>
    </span>
  );
}

/** Next 3 / 5 / 8: one tile per gameweek filling the row, with the chosen price inside. */
function Tiles({ grid, columns, lens, option }: { grid: FixtureGrid; columns: GridCell[][]; lens: Lens; option: PriceOption }) {
  return (
    <span className="ladder-games tiles" data-count={columns.length} aria-hidden="true">
      {columns.map((cells, i) => {
        const cell = shown(cells);
        if (!cell) return <span key={`blank-${i}`} className="tile blank" />;
        const bucket = cellBucket(cell, lens, grid.lens_scales[lens]);
        const price = cell.market
          ? decimalOdds(option.probability(cell.market))
          : cell.status === "finished" ? "FT" : cell.status === "postponed" ? "PPD" : cell.status === "live" ? "Live" : "";
        return (
          <span key={cell.fixture_id} className={`tile ${bucket ? `f${bucket}` : "muted"}`}>
            <span className="tile-opp">
              {cell.opponent_code}
              <small className="venue">{cell.venue}</small>
              {cells.length > 1 && <small className="venue"> +{cells.length - 1}</small>}
            </span>
            {price && <span className="tile-price">{price}</span>}
          </span>
        );
      })}
    </span>
  );
}

function inWords(columns: GridCell[][], gameweeks: GridMatchday[], names: Map<string, string>, lens: Lens, option: PriceOption | null): string {
  return columns
    .map((cells, i) => {
      const games = cells.map((cell) => {
        const opponent = `${cell.venue === "H" ? "home to" : "away to"} ${names.get(cell.opponent_code) ?? cell.opponent_code}`;
        if (!cell.market) {
          const state = { finished: "played", live: "live now", postponed: "postponed", scheduled: "not priced yet" }[cell.status];
          return `${opponent}, ${state}`;
        }
        const prices = option
          ? `${option.short} price ${decimalOdds(option.probability(cell.market))}`
          : marketLines(cell.market, lens).map((line) => line.spoken).join(", ");
        return `${opponent}, ${prices}`;
      });
      return `gameweek ${gameweeks[i]?.number}: ${games.length ? games.join("; ") : "no game"}`;
    })
    .join(". ");
}
