"use client";

import Link from "next/link";
import {
  useEffect, useMemo, useRef, useState,
  type FocusEvent as ReactFocusEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent,
} from "react";
import {
  BUCKET_STRONG, LENS_COPY, MAX_PINS, cellBucket, cellLabel, formatDay, formatTotal, openingColumn, parsePins, runStats,
  scaleBucket, serializeViewState, sortTeams, windowRange, withPinsFirst,
  type Horizon, type SortKey, type SortState, type View, type ViewState,
} from "../lib/grid";
import type { FixtureGrid, GridCell, GridTeam, Lens } from "../lib/types";
import CellTooltip from "./CellTooltip";
import Crest from "./Crest";
import FixtureCell from "./FixtureCell";
import PlanningInsights from "./PlanningInsights";
import SegmentedControl from "./SegmentedControl";
import Tooltip, { type TooltipHandle } from "./Tooltip";

const HORIZONS: { value: Horizon; label: string }[] = [
  { value: "3", label: "Next 3" },
  { value: "5", label: "Next 5" },
  { value: "8", label: "Next 8" },
  { value: "all", label: "All" },
];
const LENSES: { value: Lens; label: string }[] = (Object.keys(LENS_COPY) as Lens[]).map((lens) => ({
  value: lens,
  label: LENS_COPY[lens].label,
}));
const ARROWS: Record<string, [number, number] | undefined> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};
const PINS_KEY = "fixturediff:pins";

function sameKey(a: SortKey, b: SortKey): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind !== "matchday" || a.column === (b as { column: number }).column;
}

interface Props {
  grid: FixtureGrid;
  initialView: ViewState;
  pinsInUrl: boolean; // a shared link's pins win over the ones saved in this browser
}

export default function FixtureBoard({ grid, initialView, pinsInUrl }: Props) {
  const total = grid.matchdays.length;
  const opening = useMemo(() => openingColumn(grid), [grid]);
  const finished = useMemo(() => grid.matchdays.map((md) => md.finished), [grid]);
  const knownCodes = useMemo(() => new Set(grid.teams.map((team) => team.code)), [grid]);

  const [state, setState] = useState<ViewState>(initialView);
  const [sort, setSort] = useState<SortState>({ key: { kind: "team" }, dir: "asc" });
  const [query, setQuery] = useState("");
  const tooltip = useRef<TooltipHandle>(null);
  const hoveredKey = useRef<string | null>(null);
  const lastPointer = useRef<string>("mouse");
  const patch = (next: Partial<ViewState>) => setState((current) => ({ ...current, ...next }));
  const { view, lens, horizon, pins, played } = state;

  // Pins saved in this browser, unless the link carried its own. Read after hydration (the server can't see storage).
  useEffect(() => {
    if (pinsInUrl) return;
    try {
      const saved = parsePins(window.localStorage.getItem(PINS_KEY), knownCodes);
      if (saved.length) setState((current) => ({ ...current, pins: saved }));
    } catch {
      // storage unavailable (private mode): pins just don't persist
    }
  }, [pinsInUrl, knownCodes]);

  // Keep the URL shareable and the pins remembered, without a navigation or a server round trip.
  const firstSync = useRef(true);
  useEffect(() => {
    if (firstSync.current) {
      firstSync.current = false;
      return;
    }
    const query = serializeViewState(state);
    window.history.replaceState(window.history.state, "", query ? `?${query}` : window.location.pathname);
    try {
      window.localStorage.setItem(PINS_KEY, state.pins.join(","));
    } catch {
      // ignore
    }
  }, [state]);

  const minStart = played ? 0 : opening;
  const fromIndex = state.from === null ? -1 : grid.matchdays.findIndex((md) => md.number === state.from);
  const desiredStart = fromIndex >= 0 ? fromIndex : opening;
  const { start, end } = windowRange(total, Math.max(minStart, desiredStart), horizon === "all" ? total : Number(horizon));
  const columns = grid.matchdays.slice(start, end);
  const firstColumn = columns[0];
  const lastColumn = columns[columns.length - 1];
  const scale = grid.lens_scales[lens];
  const copy = LENS_COPY[lens];

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
  const { pinned: pinnedRows, others } = withPinsFirst(sorted, pins);
  const rows = [...pinnedRows, ...others];

  useEffect(() => {
    const hide = () => {
      hoveredKey.current = null;
      tooltip.current?.hide();
    };
    const focusedTile = () => {
      const active = document.activeElement;
      return active instanceof HTMLElement && active.dataset.key && active.dataset.key === hoveredKey.current
        ? active
        : null;
    };
    // Scrolling moves the tiles: follow a keyboard-focused tile, otherwise hide.
    const onScroll = () => {
      const tile = focusedTile();
      if (tile) tooltip.current?.anchor(tile);
      else hide();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };
    const onPointerDown = (event: PointerEvent) => {
      lastPointer.current = event.pointerType;
      if (!(event.target as HTMLElement | null)?.closest?.("[data-key]")) hide(); // tap outside closes
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "mouse") lastPointer.current = "mouse";
    };
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true });
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointermove", onPointerMove);
    };
  }, []);

  // Total bars are relative to the spread of this window.
  const totals = [...stats.values()].map((s) => s.total).filter((v): v is number => v !== null);
  const [lowest, highest] = [Math.min(...totals), Math.max(...totals)];
  const barWidth = (value: number) => 12 + ((value - lowest) / (highest - lowest || 1)) * 88;

  const toggleSort = (key: SortKey) =>
    setSort((current) =>
      sameKey(current.key, key) ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );
  const sortClass = (key: SortKey) => (sameKey(activeSort.key, key) ? `sorted ${activeSort.dir}` : "");
  const ariaSort = (key: SortKey) =>
    sameKey(activeSort.key, key) ? (activeSort.dir === "asc" ? "ascending" : "descending") : undefined;
  const togglePin = (code: string) =>
    setState((current) => ({
      ...current,
      pins: current.pins.includes(code)
        ? current.pins.filter((pin) => pin !== code)
        : [...current.pins, code].slice(-MAX_PINS),
    }));
  const pinMany = (codes: string[]) =>
    setState((current) => ({ ...current, pins: [...new Set([...current.pins, ...codes])].slice(-MAX_PINS) }));
  const stepTo = (column: number) => patch({ from: grid.matchdays[column]?.number ?? null });
  const togglePlayed = () =>
    setState((current) => ({
      ...current,
      played: !current.played,
      // hiding played rounds again: jump back to the opening matchday if the window is in the past
      from: current.played && start < opening ? null : current.from,
    }));

  const showFor = (tile: HTMLElement) => {
    const key = tile.dataset.key;
    const entry = key ? cellIndex.get(key) : undefined;
    if (!key || !entry) return;
    hoveredKey.current = key;
    tooltip.current?.show(<CellTooltip {...entry} teams={teamsByCode} />);
    tooltip.current?.anchor(tile);
  };
  const tileOf = (target: EventTarget) => (target as HTMLElement).closest<HTMLElement>("[data-key]");

  // Keyboard focus opens the tooltip; mouse focus doesn't (hover already did).
  const onGridFocus = (event: ReactFocusEvent<HTMLTableElement>) => {
    const tile = tileOf(event.target);
    if (tile?.matches(":focus-visible")) showFor(tile);
  };
  const onGridBlur = (event: ReactFocusEvent<HTMLTableElement>) => {
    if (tileOf(event.target) && !tileOf(event.relatedTarget ?? document.body)) {
      hoveredKey.current = null;
      tooltip.current?.hide();
    }
  };
  // Touch has no hover: a tap opens the tooltip next to the tile.
  const onGridClick = (event: ReactMouseEvent<HTMLTableElement>) => {
    const tile = tileOf(event.target);
    if (tile && lastPointer.current === "touch") showFor(tile);
  };
  // Arrow keys move between fixtures (skipping blank weeks) instead of tabbing through every tile.
  const onGridKeyDown = (event: ReactKeyboardEvent<HTMLTableElement>) => {
    const step = ARROWS[event.key];
    const tile = tileOf(event.target);
    if (!step || !tile) return;
    const [dRow, dCol] = step;
    let row = Number(tile.dataset.row) + dRow;
    let col = Number(tile.dataset.col) + dCol;
    while (row >= 0 && row < rows.length && col >= start && col < end) {
      const next = event.currentTarget.querySelector<HTMLElement>(`[data-row="${row}"][data-col="${col}"]`);
      if (next) {
        event.preventDefault();
        next.focus();
        return;
      }
      row += dRow;
      col += dCol;
    }
  };
  const onGridMove = (event: ReactMouseEvent<HTMLTableElement>) => {
    if (lastPointer.current === "touch") return; // emulated mouse events after a tap
    const target = tileOf(event.target);
    const key = target?.dataset.key ?? null;
    if (!key) {
      hoveredKey.current = null;
      tooltip.current?.hide();
      return;
    }
    if (key !== hoveredKey.current) {
      hoveredKey.current = key;
      const entry = cellIndex.get(key);
      if (entry) tooltip.current?.show(<CellTooltip {...entry} teams={teamsByCode} />);
    }
    tooltip.current?.move(event.clientX, event.clientY);
  };

  const q = query.trim().toLowerCase();

  const renderRow = (team: GridTeam, rowIndex: number) => {
    const matches = !q || team.name.toLowerCase().includes(q) || team.code.toLowerCase().includes(q);
    const isPinned = pins.includes(team.code);
    const s = stats.get(team.code)!;
    return (
      <tr key={team.code} className={`${matches ? "" : "dim"} ${isPinned ? "pinned" : ""}`}>
        <th scope="row" className="team-col">
          <div className="team">
            <Link href={`/team/${team.code}`} prefetch={false} className="team-link">
              <Crest team={team} />
              <span className="team-name">{team.name}</span>
            </Link>
            <button
              type="button"
              className="pin"
              onClick={() => togglePin(team.code)}
              aria-pressed={isPinned}
              aria-label={`Pin ${team.name}`}
              title={isPinned ? "Unpin" : "Pin to the top"}
            >
              <PinIcon filled={isPinned} />
            </button>
          </div>
        </th>
        {team.cells.slice(start, end).map((cells, i) => {
          const matchday = grid.matchdays[start + i]?.number ?? start + i + 1;
          return (
            <td key={matchday}>
              <FixtureCell
                cells={cells}
                row={rowIndex}
                column={start + i}
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
          {s.total === null ? (
            <span className="avg-empty">—</span>
          ) : (
            <div className="avg">
              <span className="avg-num">{formatTotal(s.total)}</span>
              <div className="bar">
                <span
                  style={{
                    width: `${barWidth(s.total)}%`,
                    background: s.average === null ? BUCKET_STRONG[3] : BUCKET_STRONG[scaleBucket(s.average, scale)],
                  }}
                />
              </div>
            </div>
          )}
          {(s.blanks > 0 || s.doubles > 0) && (
            <div className="run-badges">
              {s.doubles > 0 && <span className="badge double">{s.doubles > 1 ? `${s.doubles}×` : ""}×2</span>}
              {s.blanks > 0 && <span className="badge blank">{s.blanks} blank</span>}
            </div>
          )}
        </td>
      </tr>
    );
  };

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
        <div className="toolbar">
          <div className="toolbar-nav">
            <div className="stepper">
              <button type="button" aria-label="Previous matchday" disabled={start <= minStart} onClick={() => stepTo(start - 1)}>
                <Chevron direction="left" />
              </button>
              <div className="range">
                {firstColumn && lastColumn ? `MD${firstColumn.number} – MD${lastColumn.number}` : "—"}
              </div>
              <button type="button" aria-label="Next matchday" disabled={start >= total - 1 || (horizon !== "all" && end >= total)} onClick={() => stepTo(start + 1)}>
                <Chevron direction="right" />
              </button>
            </div>
            {opening > 0 && (
              <button type="button" className="toggle" aria-pressed={played} onClick={togglePlayed} aria-label="Show played matchdays">
                <span className="toggle-long">Show played</span>
                <span className="toggle-short" aria-hidden="true">Played</span>
              </button>
            )}
          </div>
          <div className="toolbar-controls">
            <SegmentedControl<Horizon> label="Horizon" value={horizon} onChange={(next) => patch({ horizon: next })} options={HORIZONS} />
            <SegmentedControl<Lens> label="Lens" value={lens} onChange={(next) => patch({ lens: next })} options={LENSES} />
            {view === "fdr" && (
              <div className="legend">
                <span className="visually-hidden">Colour key, {copy.label} lens:</span>
                {copy.easy}
                {([1, 2, 3, 4, 5] as const).map((bucket) => (
                  <span key={bucket} className={`chip f${bucket}`} aria-hidden="true">{bucket}</span>
                ))}
                <span className="visually-hidden">(1 to 5)</span>
                {copy.hard}
              </div>
            )}
          </div>
          <div className="search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input type="search" aria-label="Search teams" placeholder="Search teams" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>

        <div className={`scroll ${view === "plain" ? "plain" : ""}`}>
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- delegated handlers for the tile buttons inside */}
          <table
            onMouseMove={onGridMove}
            onMouseLeave={() => { hoveredKey.current = null; tooltip.current?.hide(); }}
            onFocus={onGridFocus}
            onBlur={onGridBlur}
            onClick={onGridClick}
            onKeyDown={onGridKeyDown}
          >
            <caption className="visually-hidden">
              LaLiga fixtures by team, {firstColumn && lastColumn ? `matchdays ${firstColumn.number} to ${lastColumn.number}` : "no matchdays"}
              {view === "fdr" ? `, rated with the ${copy.label.toLowerCase()} lens from 1 (${copy.easy.toLowerCase()}) to 5 (${copy.hard.toLowerCase()})` : ""}.
              {pins.length ? ` Pinned teams are listed first.` : ""} Use the arrow keys to move between fixtures.
            </caption>
            <thead>
              <tr>
                <th scope="col" className={`team-col sortable ${sortClass({ kind: "team" })}`} aria-sort={ariaSort({ kind: "team" })}>
                  <button type="button" className="sort" onClick={() => toggleSort({ kind: "team" })} aria-label="Sort by team name">
                    <span className="gw">Team<span className="arrow" aria-hidden="true">↓</span></span>
                  </button>
                </th>
                {columns.map((md, i) => {
                  const key: SortKey = { kind: "matchday", column: start + i };
                  return (
                    <th key={md.number} scope="col" className={`sortable ${md.finished ? "past" : ""} ${sortClass(key)}`} aria-sort={ariaSort(key)}>
                      <button type="button" className="sort" onClick={() => toggleSort(key)} aria-label={`Sort by matchday ${md.number}, ${formatDay(md.date_from)}`}>
                        <span className="gw">MD{md.number}<span className="arrow" aria-hidden="true">↓</span></span>
                        <span className="date">{formatDay(md.date_from)}</span>
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
              {pinnedRows.map((team, i) => renderRow(team, i))}
              {pinnedRows.length > 0 && others.length > 0 && (
                <tr className="pin-divider" aria-hidden="true">
                  <td colSpan={columns.length + 2} />
                </tr>
              )}
              {others.map((team, i) => renderRow(team, pinnedRows.length + i))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="footnote">
        {copy.hint}. Blank weeks count 0 and double weeks count both games. Click a team for its season, the pin to keep it on top, a matchday or Total to sort.
        {lens === "defence" && " Clean-sheet chances currently run about 4 points high; ranking is unaffected."}
      </p>
      <p className="footnote attribution">
        Fixtures, results and crests: football-data.org. Match history: football-data.co.uk.{" "}
        <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Weather data by Open-Meteo.com</a>{" "}
        (<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>).
      </p>
      <Tooltip ref={tooltip} />
    </>
  );
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={direction === "left" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
    </svg>
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
