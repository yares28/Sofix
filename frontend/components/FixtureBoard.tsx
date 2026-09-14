"use client";

import {
  useEffect, useMemo, useRef, useState,
  type FocusEvent as ReactFocusEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent,
} from "react";
import {
  BUCKET_STRONG, LENS_COPY, cellBucket, cellLabel, formatDay, formatKickoff, formatLensValue, runStats, scaleBucket,
  sortTeams, windowRange, type SortKey, type SortState,
} from "../lib/grid";
import type { FixtureGrid, GridCell, GridTeam, Lens } from "../lib/types";
import Crest from "./Crest";
import FixtureCell from "./FixtureCell";
import InsightCards, { type Insight } from "./InsightCards";
import SegmentedControl from "./SegmentedControl";
import Tooltip, { type TooltipHandle } from "./Tooltip";

type View = "fdr" | "plain";
type Horizon = "3" | "5" | "8" | "all";

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
const percent = (value: number) => `${Math.round(value * 100)}%`;
const ARROWS: Record<string, [number, number] | undefined> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

function sameKey(a: SortKey, b: SortKey): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind !== "matchday" || a.column === (b as { column: number }).column;
}

export default function FixtureBoard({ grid }: { grid: FixtureGrid }) {
  const total = grid.matchdays.length;
  // Open on the current matchday; once the season is over, on the last one.
  const currentIndex = grid.current_matchday === null
    ? Math.max(0, total - 1)
    : Math.max(0, grid.matchdays.findIndex((md) => md.number === grid.current_matchday));

  const [view, setView] = useState<View>("fdr");
  const [lens, setLens] = useState<Lens>("overall");
  const [horizon, setHorizon] = useState<Horizon>("8");
  const [startColumn, setStartColumn] = useState(currentIndex);
  const [sort, setSort] = useState<SortState>({ key: { kind: "team" }, dir: "asc" });
  const [query, setQuery] = useState("");
  const [pinned, setPinned] = useState<ReadonlySet<string>>(new Set());
  const tooltip = useRef<TooltipHandle>(null);
  const hoveredKey = useRef<string | null>(null);
  const lastPointer = useRef<string>("mouse");

  const names = useMemo(() => new Map(grid.teams.map((team) => [team.code, team.name])), [grid]);
  const scales = grid.lens_scales;
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

  const { start, end } = windowRange(total, startColumn, horizon === "all" ? total : Number(horizon));
  const columns = grid.matchdays.slice(start, end);
  const firstColumn = columns[0];
  const lastColumn = columns[columns.length - 1];
  const scale = scales[lens];
  // A matchday sort only applies while that column is visible.
  const activeSort = useMemo<SortState>(
    () =>
      sort.key.kind === "matchday" && (sort.key.column < start || sort.key.column >= end)
        ? { key: { kind: "team" }, dir: "asc" }
        : sort,
    [sort, start, end],
  );
  const stats = useMemo(
    () => new Map(grid.teams.map((team) => [team.code, runStats(team, start, end, lens, scale)])),
    [grid, start, end, lens, scale],
  );
  const rows = useMemo(() => sortTeams(grid.teams, activeSort, start, end, lens, stats), [grid, activeSort, start, end, lens, stats]);

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
      document.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("scroll", onScroll, { capture: true });
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);

  // Average bars are relative to the spread of this window.
  const averages = [...stats.values()].map((s) => s.average).filter((v): v is number => v !== null);
  const [lowest, highest] = [Math.min(...averages), Math.max(...averages)];
  const barWidth = (value: number) => {
    const spread = highest - lowest || 1;
    const easeShare = lens === "overall" ? (highest - value) / spread : (value - lowest) / spread;
    return 12 + easeShare * 88;
  };

  const insights = useMemo<Insight[]>(() => {
    const overall = grid.teams
      .map((team) => ({ team, stats: runStats(team, start, end, "overall", scales.overall) }))
      .filter((entry) => entry.stats.average !== null);
    const attack = grid.teams
      .map((team) => ({ team, stats: runStats(team, start, end, "attack", scales.attack) }))
      .filter((entry) => entry.stats.average !== null);
    const byAverage = [...overall].sort((a, b) => a.stats.average! - b.stats.average!);
    const kindest = byAverage[0];
    const toughest = byAverage[byAverage.length - 1];
    if (!kindest || !toughest) return [];
    const bestAttack = [...attack].sort((a, b) => b.stats.average! - a.stats.average!)[0];
    const games = (s: { fixtures: number }) => `${s.fixtures} ${s.fixtures === 1 ? "game" : "games"}`;
    const cards: Insight[] = [
      { label: "Kindest run", dot: BUCKET_STRONG[1], ...kindest,
        describe: (s) => `Avg difficulty ${formatLensValue(s.average!, "overall")} over ${games(s)}` },
      { label: "Toughest run", dot: BUCKET_STRONG[5], ...toughest,
        describe: (s) => `Avg difficulty ${formatLensValue(s.average!, "overall")} over ${games(s)}` },
    ];
    if (bestAttack) {
      cards.push({ label: "Best for attackers", dot: "#0071e3", ...bestAttack,
        describe: (s) => `${formatLensValue(s.average!, "attack")} expected goals per game over ${games(s)}` });
    }
    return cards;
  }, [grid, start, end, scales]);

  const toggleSort = (key: SortKey) =>
    setSort((current) =>
      sameKey(current.key, key) ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );
  const sortClass = (key: SortKey) => (sameKey(activeSort.key, key) ? `sorted ${activeSort.dir}` : "");
  const ariaSort = (key: SortKey) =>
    sameKey(activeSort.key, key) ? (activeSort.dir === "asc" ? "ascending" : "descending") : undefined;
  const togglePin = (code: string) =>
    setPinned((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  const showFor = (tile: HTMLElement) => {
    const key = tile.dataset.key;
    const entry = key ? cellIndex.get(key) : undefined;
    if (!key || !entry) return;
    hoveredKey.current = key;
    tooltip.current?.show(<CellTooltip {...entry} names={names} />);
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
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-key]");
    const key = target?.dataset.key ?? null;
    if (!key) {
      hoveredKey.current = null;
      tooltip.current?.hide();
      return;
    }
    if (key !== hoveredKey.current) {
      hoveredKey.current = key;
      const entry = cellIndex.get(key);
      if (entry) tooltip.current?.show(<CellTooltip {...entry} names={names} />);
    }
    tooltip.current?.move(event.clientX, event.clientY);
  };

  const q = query.trim().toLowerCase();
  const averageOf = (team: GridTeam) => stats.get(team.code)!.average;

  return (
    <>
      <section className="hero">
        <div>
          <div className="eyebrow">LaLiga · Season {grid.season}</div>
          <h1>Fixtures &amp; Difficulty</h1>
          <p className="subtitle">Every run of games. Rated at a glance.</p>
        </div>
        <SegmentedControl
          label="View"
          size="lg"
          value={view}
          onChange={setView}
          options={[{ value: "plain", label: "Fixtures" }, { value: "fdr", label: "Difficulty" }]}
        />
      </section>

      <InsightCards insights={insights} />

      <section className="card board">
        <div className="toolbar">
          <div className="toolbar-nav">
            <div className="stepper">
              <button type="button" aria-label="Previous matchday" disabled={start === 0} onClick={() => setStartColumn(start - 1)}>
                <Chevron direction="left" />
              </button>
              <div className="range">
                {firstColumn && lastColumn ? `MD${firstColumn.number} – MD${lastColumn.number}` : "—"}
              </div>
              <button type="button" aria-label="Next matchday" disabled={start >= total - 1 || (horizon !== "all" && end >= total)} onClick={() => setStartColumn(start + 1)}>
                <Chevron direction="right" />
              </button>
            </div>
          </div>
          <div className="toolbar-controls">
            <SegmentedControl label="Horizon" value={horizon} onChange={setHorizon} options={HORIZONS} />
            <SegmentedControl label="Lens" value={lens} onChange={setLens} options={LENSES} />
            {view === "fdr" && (
              <div className="legend">
                <span className="visually-hidden">Colour key, {LENS_COPY[lens].label} lens:</span>
                {LENS_COPY[lens].easy}
                {([1, 2, 3, 4, 5] as const).map((bucket) => (
                  <span key={bucket} className={`chip f${bucket}`} aria-hidden="true">{bucket}</span>
                ))}
                <span className="visually-hidden">(1 to 5)</span>
                {LENS_COPY[lens].hard}
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
              {view === "fdr" ? `, rated with the ${LENS_COPY[lens].label.toLowerCase()} lens from 1 (${LENS_COPY[lens].easy.toLowerCase()}) to 5 (${LENS_COPY[lens].hard.toLowerCase()})` : ""}.
              Use the arrow keys to move between fixtures.
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
                <th scope="col" className={`avg-col sortable ${sortClass({ kind: "average" })}`} aria-sort={ariaSort({ kind: "average" })}>
                  <button type="button" className="sort" onClick={() => toggleSort({ kind: "average" })} aria-label={`Sort by ${LENS_COPY[lens].average.replace("Avg", "average")}`}>
                    <span className="gw">Avg<span className="arrow" aria-hidden="true">↓</span></span>
                    <span className="date">{LENS_COPY[lens].average.replace("Avg ", "")}</span>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((team, rowIndex) => {
                const matches = !q || team.name.toLowerCase().includes(q) || team.code.toLowerCase().includes(q);
                const dim = !matches || (pinned.size > 0 && !pinned.has(team.code));
                const average = averageOf(team);
                return (
                  <tr key={team.code} className={`${dim ? "dim" : ""} ${pinned.has(team.code) ? "pinned" : ""}`}>
                    <th scope="row" className="team-col">
                      <button type="button" className="team" onClick={() => togglePin(team.code)} aria-pressed={pinned.has(team.code)} aria-label={`Pin ${team.name}`}>
                        <Crest team={team} />
                        <span className="team-name">{team.name}</span>
                      </button>
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
                            labelOf={(cell) => cellLabel(cell, team.name, matchday, names.get(cell.opponent_code) ?? cell.opponent_code, lens)}
                          />
                        </td>
                      );
                    })}
                    <td className="avg-col">
                      {average === null ? (
                        <span className="avg-empty">—</span>
                      ) : (
                        <div className="avg">
                          <span className="avg-num">{formatLensValue(average, lens)}</span>
                          <div className="bar">
                            <span style={{ width: `${barWidth(average)}%`, background: BUCKET_STRONG[scaleBucket(average, scale)] }} />
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <p className="footnote">
        {LENS_COPY[lens].hint}. Click a team to pin it, a matchday or “Avg” to sort. Arrow keys move between fixtures.
        {lens === "defence" && " Clean-sheet chances currently run about 4 points high; ranking is unaffected."}
      </p>
      <p className="footnote attribution">
        Fixtures and results: football-data.org. Match history: football-data.co.uk.{" "}
        <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Weather data by Open-Meteo.com</a>{" "}
        (<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>).
      </p>
      <Tooltip ref={tooltip} />
    </>
  );
}

function CellTooltip({ team, cell, matchday, names }: { team: GridTeam; cell: GridCell; matchday: number; names: Map<string, string> }) {
  const opponent = names.get(cell.opponent_code) ?? cell.opponent_code;
  const [home, away] = cell.venue === "H" ? [team.name, opponent] : [opponent, team.name];
  const when = cell.date_confirmed ? formatKickoff(cell.kickoff_utc) : `Date TBC · weekend of ${formatDay(cell.kickoff_utc)}`;
  const p = cell.prediction;
  const w = cell.weather;
  return (
    <>
      <div className="tip-title">
        <b>{home}</b> v <b>{away}</b>
      </div>
      <div className="muted">
        MD{matchday} · {when}
        {cell.rescheduled && " · moved"}
      </div>
      {cell.result && (
        <div>
          Final {cell.venue === "H" ? `${cell.result.goals_for}–${cell.result.goals_against}` : `${cell.result.goals_against}–${cell.result.goals_for}`}
          <span className="muted"> · {team.name} {cell.result.outcome === "W" ? "won" : cell.result.outcome === "D" ? "drew" : "lost"}</span>
        </div>
      )}
      {p && (
        <>
          <div className="tip-row">
            Win {percent(p.probabilities.win)} · Draw {percent(p.probabilities.draw)} · Loss {percent(p.probabilities.loss)}
          </div>
          <div className="tip-row">
            {p.xg_for !== null && p.xg_against !== null && <>xG {p.xg_for.toFixed(2)} – {p.xg_against.toFixed(2)}</>}
            {p.clean_sheet !== null && <> · Clean sheet {percent(p.clean_sheet)}</>}
          </div>
          <div className="muted">
            Difficulty {Math.round(p.difficulty)} · {p.label}
          </div>
        </>
      )}
      {w && w.temperature_c !== null && (
        <div className="muted">
          {Math.round(w.temperature_c)}°C · {(w.precipitation_mm ?? 0).toFixed(1)} mm rain · {Math.round(w.wind_kmh ?? 0)} km/h wind
        </div>
      )}
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
