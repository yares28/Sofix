"use client";

import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { useTileTooltip } from "../hooks/useTileTooltip";
import {
  LENS_COPY, formatDay, runStats, sortTeams, withPinsFirst, type Horizon, type SortKey, type SortState,
} from "../lib/grid";
import type { FixtureGrid, GridCell, GridTeam, Lens } from "../lib/types";
import BoardToolbar from "./BoardToolbar";
import NextGameweek from "./NextGameweek";
import TeamRow from "./TeamRow";
import Tooltip from "./Tooltip";

// A gameweek's dates count as "to be confirmed" when most of its remaining games have no fixed kickoff yet.
const TBC_SHARE = 0.5;

function sameKey(a: SortKey, b: SortKey): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind !== "matchday" || a.column === (b as { column: number }).column;
}

interface Props {
  grid: FixtureGrid;
  start: number;
  end: number;
  lens: Lens;
  horizon: Horizon;
  pins: readonly string[];
  onHorizon: (horizon: Horizon) => void;
  onLens: (lens: Lens) => void;
  onTogglePin: (code: string) => void;
}

/** The full team × gameweek grid (or one gameweek's match cards with the Next horizon). */
export default function DifficultyGrid({ grid, start, end, lens, horizon, pins, onHorizon, onLens, onTogglePin }: Props) {
  const finished = useMemo(() => grid.matchdays.map((md) => md.finished), [grid]);
  const teamsByCode = useMemo(() => new Map(grid.teams.map((team) => [team.code, team])), [grid]);
  const cellIndex = useMemo(() => {
    const index = new Map<string, { team: GridTeam; cell: GridCell; matchday: number }>();
    grid.teams.forEach((team) =>
      team.cells.forEach((cells, column) =>
        cells.forEach((cell) => {
          const matchday = grid.matchdays[column];
          if (matchday) index.set(`${team.code}-${cell.fixture_id}`, { team, cell, matchday: matchday.number });
        }),
      ),
    );
    return index;
  }, [grid]);
  const columnTbc = useMemo(
    () =>
      grid.matchdays.map((_, column) => {
        const open = grid.teams.flatMap((team) => team.cells[column] ?? []).filter((cell) => cell.status === "scheduled");
        return open.length > 0 && open.filter((cell) => !cell.date_confirmed).length / open.length > TBC_SHARE;
      }),
    [grid],
  );

  const [sort, setSort] = useState<SortState>({ key: { kind: "team" }, dir: "asc" });
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query); // typing stays responsive; rows update right after
  const columns = grid.matchdays.slice(start, end);
  const scale = grid.lens_scales[lens];
  const copy = LENS_COPY[lens];

  // A gameweek sort only applies while that column is visible.
  const activeSort = useMemo<SortState>(
    () =>
      sort.key.kind === "matchday" && (sort.key.column < start || sort.key.column >= end)
        ? { key: { kind: "team" }, dir: "asc" }
        : sort,
    [sort, start, end],
  );
  const stats = useMemo(
    () => new Map(grid.teams.map((team) => [team.code, runStats(team, start, end, lens, scale, finished)])),
    [grid, start, end, lens, scale, finished],
  );
  const sorted = useMemo(
    () => sortTeams(grid.teams, activeSort, start, end, lens, stats, finished),
    [grid, activeSort, start, end, lens, stats, finished],
  );
  const { pinned, others } = useMemo(() => withPinsFirst(sorted, pins), [sorted, pins]);
  const { tooltip, tableHandlers } = useTileTooltip(cellIndex, teamsByCode, pinned.length + others.length, start, end);

  // Total bars are relative to the spread of this window.
  const barPercents = useMemo(() => {
    const totals = [...stats.values()].map((s) => s.total).filter((v): v is number => v !== null);
    const [low, high] = [Math.min(...totals), Math.max(...totals)];
    return new Map(
      [...stats].map(([code, s]) => [code, s.total === null ? null : Math.round(12 + ((s.total - low) / (high - low || 1)) * 88)]),
    );
  }, [stats]);

  const toggleSort = useCallback(
    (key: SortKey) =>
      setSort((current) =>
        sameKey(current.key, key) ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
      ),
    [],
  );
  const sortClass = (key: SortKey) => (sameKey(activeSort.key, key) ? `sorted ${activeSort.dir}` : "");
  const ariaSort = (key: SortKey) =>
    sameKey(activeSort.key, key) ? (activeSort.dir === "asc" ? "ascending" : "descending") : undefined;

  const q = deferredQuery.trim().toLowerCase();
  const rowProps = (team: GridTeam, rowIndex: number) => ({
    team,
    rowIndex,
    start,
    end,
    lens,
    scale,
    stats: stats.get(team.code)!,
    barPercent: barPercents.get(team.code) ?? null,
    isPinned: pins.includes(team.code),
    matchesSearch: !q || team.name.toLowerCase().includes(q) || team.code.toLowerCase().includes(q),
    matchdays: grid.matchdays,
    columnTbc,
    teamsByCode,
    onTogglePin,
  });

  return (
    <section id="grid" className="card board" aria-label="Fixture grid">
      <BoardToolbar
        lens={lens}
        horizon={horizon}
        first={columns[0]}
        last={columns[columns.length - 1]}
        query={query}
        onHorizon={onHorizon}
        onLens={onLens}
        onQuery={setQuery}
      />

      {horizon === "next" ? (
        <NextGameweek grid={grid} column={start} />
      ) : (
        <div className="scroll">
          {/* Handlers are delegated to the tile buttons inside (see useTileTooltip). */}
          <table {...tableHandlers}>
            <caption className="visually-hidden">
              LaLiga fixtures by team, {columns.length ? `gameweeks ${columns[0]!.number} to ${columns[columns.length - 1]!.number}` : "no gameweeks"}
              {`, rated with the ${copy.label.toLowerCase()} lens from 1 (${copy.easy.toLowerCase()}) to 5 (${copy.hard.toLowerCase()})`}.
              {pins.length ? " Pinned teams are listed first." : ""} Use the arrow keys to move between fixtures.
            </caption>
            <thead>
              <tr>
                <th scope="col" className={`team-col sortable ${sortClass({ kind: "team" })}`} aria-sort={ariaSort({ kind: "team" })}>
                  <button type="button" className="sort" onClick={() => toggleSort({ kind: "team" })} aria-label="Sort by team name">
                    <span className="gw">Team<span className="arrow" aria-hidden="true">↓</span></span>
                  </button>
                </th>
                {columns.map((md, i) => {
                  const column = start + i;
                  const key: SortKey = { kind: "matchday", column };
                  return (
                    <th key={md.number} scope="col" className={`sortable ${md.finished ? "past" : ""} ${sortClass(key)}`} aria-sort={ariaSort(key)}>
                      <button type="button" className="sort" onClick={() => toggleSort(key)} aria-label={`Sort by gameweek ${md.number}, ${formatDay(md.date_from)}${columnTbc[column] ? ", dates to be confirmed" : ""}`}>
                        <span className="gw">GW{md.number}<span className="arrow" aria-hidden="true">↓</span></span>
                        <span className="date">
                          {formatDay(md.date_from)}
                          {columnTbc[column] && (
                            <span className="tbc-mark">
                              <span className="tbc-dot"> · </span>TBC
                            </span>
                          )}
                        </span>
                      </button>
                    </th>
                  );
                })}
                <th scope="col" className={`avg-col sortable ${sortClass({ kind: "total" })}`} aria-sort={ariaSort({ kind: "total" })}>
                  <button type="button" className="sort" onClick={() => toggleSort({ kind: "total" })} aria-label={`Sort by total ${copy.totalLong}`}>
                    <span className="gw">Total<span className="arrow" aria-hidden="true">↓</span></span>
                    <span className="date">{copy.total}</span>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {pinned.map((team, i) => <TeamRow key={team.code} {...rowProps(team, i)} />)}
              {pinned.length > 0 && others.length > 0 && (
                <tr className="pin-divider" aria-hidden="true">
                  <td colSpan={columns.length + 2} />
                </tr>
              )}
              {others.map((team, i) => <TeamRow key={team.code} {...rowProps(team, pinned.length + i)} />)}
            </tbody>
          </table>
        </div>
      )}
      <Tooltip ref={tooltip} />
    </section>
  );
}
