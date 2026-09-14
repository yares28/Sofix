"use client";

import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { useTileTooltip } from "../hooks/useTileTooltip";
import { useViewState } from "../hooks/useViewState";
import {
  LENS_COPY, formatDay, openingColumn, runStats, sortTeams, windowRange, withPinsFirst,
  type SortKey, type SortState, type View, type ViewState,
} from "../lib/grid";
import type { FixtureGrid, GridCell, GridTeam, ModelNote } from "../lib/types";
import BoardToolbar from "./BoardToolbar";
import PlanningInsights from "./PlanningInsights";
import SegmentedControl from "./SegmentedControl";
import TeamRow from "./TeamRow";
import Tooltip from "./Tooltip";

// A matchday's dates count as "to be confirmed" when most of its remaining games have no fixed kickoff yet.
const TBC_SHARE = 0.5;

function sameKey(a: SortKey, b: SortKey): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind !== "matchday" || a.column === (b as { column: number }).column;
}

interface Props {
  grid: FixtureGrid;
  notes: ModelNote[];
  initialView: ViewState;
  pinsInUrl: boolean; // a shared link's pins win over the ones saved in this browser
}

export default function FixtureBoard({ grid, notes, initialView, pinsInUrl }: Props) {
  const total = grid.matchdays.length;
  const opening = useMemo(() => openingColumn(grid), [grid]);
  const finished = useMemo(() => grid.matchdays.map((md) => md.finished), [grid]);
  const knownCodes = useMemo(() => new Set(grid.teams.map((team) => team.code)), [grid]);
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

  const { state, setState, patch, togglePin, pinMany } = useViewState(initialView, pinsInUrl, knownCodes);
  const { view, lens, horizon, pins, played } = state;
  const [sort, setSort] = useState<SortState>({ key: { kind: "team" }, dir: "asc" });
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query); // typing stays responsive; rows update right after

  const minStart = played ? 0 : opening;
  const fromIndex = state.from === null ? -1 : grid.matchdays.findIndex((md) => md.number === state.from);
  const { start, end } = windowRange(
    total,
    Math.max(minStart, fromIndex >= 0 ? fromIndex : opening),
    horizon === "all" ? total : Number(horizon),
  );
  const columns = grid.matchdays.slice(start, end);
  const scale = grid.lens_scales[lens];
  const copy = LENS_COPY[lens];

  // A matchday sort only applies while that column is visible.
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
  const stepTo = (column: number) => patch({ from: grid.matchdays[column]?.number ?? null });
  const togglePlayed = () =>
    setState((current) => ({
      ...current,
      played: !current.played,
      // hiding played rounds again: jump back to the opening matchday if the window is in the past
      from: current.played && start < opening ? null : current.from,
    }));

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
    onTogglePin: togglePin,
  });
  const lensNotes = notes.filter((note) => note.lens === null || note.lens === lens);

  return (
    <>
      <section className="hero">
        <div>
          <div className="eyebrow">LaLiga · Season {grid.season}</div>
          <h1>Fixtures &amp; Difficulty</h1>
        </div>
        <SegmentedControl<View>
          label="View"
          size="lg"
          value={view}
          onChange={(next) => patch({ view: next })}
          options={[{ value: "plain", label: "Fixtures" }, { value: "fdr", label: "Difficulty" }]}
        />
      </section>

      <PlanningInsights
        teams={grid.teams}
        stats={stats}
        matchdays={grid.matchdays}
        start={start}
        end={end}
        lens={lens}
        pins={pins}
        onTogglePin={togglePin}
        onPin={pinMany}
      />

      <section className="card board">
        <BoardToolbar
          view={view}
          lens={lens}
          horizon={horizon}
          played={played}
          first={columns[0]}
          last={columns[columns.length - 1]}
          canGoBack={start > minStart}
          canGoForward={start < total - 1 && (horizon === "all" || end < total)}
          showPlayedToggle={opening > 0}
          query={query}
          onBack={() => stepTo(start - 1)}
          onForward={() => stepTo(start + 1)}
          onTogglePlayed={togglePlayed}
          onHorizon={(next) => patch({ horizon: next })}
          onLens={(next) => patch({ lens: next })}
          onQuery={setQuery}
        />

        <div className={`scroll ${view === "plain" ? "plain" : ""}`}>
          {/* Handlers are delegated to the tile buttons inside (see useTileTooltip). */}
          <table {...tableHandlers}>
            <caption className="visually-hidden">
              LaLiga fixtures by team, {columns.length ? `matchdays ${columns[0]!.number} to ${columns[columns.length - 1]!.number}` : "no matchdays"}
              {view === "fdr" ? `, rated with the ${copy.label.toLowerCase()} lens from 1 (${copy.easy.toLowerCase()}) to 5 (${copy.hard.toLowerCase()})` : ""}.
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
                      <button type="button" className="sort" onClick={() => toggleSort(key)} aria-label={`Sort by matchday ${md.number}, ${formatDay(md.date_from)}${columnTbc[column] ? ", dates to be confirmed" : ""}`}>
                        <span className="gw">MD{md.number}<span className="arrow" aria-hidden="true">↓</span></span>
                        <span className="date">
                          {formatDay(md.date_from)}
                          {columnTbc[column] && <span className="tbc-mark"> · TBC</span>}
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
      </section>

      <p className="footnote">
        {copy.hint}. Blank weeks count 0 and double weeks count both games. “TBC” on a matchday means most kickoff times
        aren’t fixed yet. Click a team for its season, the pin to keep it on top, a matchday or Total to sort.
      </p>
      {lensNotes.map((note) => (
        <p key={note.text} className="footnote note">
          Model note: {note.text}
        </p>
      ))}
      <p className="footnote attribution">
        Model {grid.model_version ?? "not run yet"}. Fixtures, results and crests: football-data.org. Match history:
        football-data.co.uk.{" "}
        <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Weather data by Open-Meteo.com</a>{" "}
        (<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>).
      </p>
      <Tooltip ref={tooltip} />
    </>
  );
}
