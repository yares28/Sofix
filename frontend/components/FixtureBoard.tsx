"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import {
  BUCKET_STRONG, LENS_COPY, cellBucket, formatDay, formatKickoff, formatLensValue, runStats, scaleBucket,
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

  const names = useMemo(() => new Map(grid.teams.map((team) => [team.code, team.name])), [grid]);
  const scales = grid.lens_scales;
  const cellIndex = useMemo(() => {
    const index = new Map<string, { team: GridTeam; cell: GridCell; matchday: number }>();
    grid.teams.forEach((team) =>
      team.cells.forEach((cells, column) =>
        cells.forEach((cell) => index.set(`${team.code}-${cell.fixture_id}`, { team, cell, matchday: grid.matchdays[column].number })),
      ),
    );
    return index;
  }, [grid]);

  const { start, end } = windowRange(total, startColumn, horizon === "all" ? total : Number(horizon));
  const columns = grid.matchdays.slice(start, end);
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
    window.addEventListener("scroll", hide, { passive: true, capture: true });
    return () => window.removeEventListener("scroll", hide, { capture: true });
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
    if (overall.length === 0) return [];
    const byAverage = [...overall].sort((a, b) => a.stats.average! - b.stats.average!);
    const bestAttack = [...attack].sort((a, b) => b.stats.average! - a.stats.average!)[0];
    const games = (s: { fixtures: number }) => `${s.fixtures} ${s.fixtures === 1 ? "game" : "games"}`;
    const cards: Insight[] = [
      { label: "Kindest run", dot: BUCKET_STRONG[1], ...byAverage[0],
        describe: (s) => `Avg difficulty ${formatLensValue(s.average!, "overall")} over ${games(s)}` },
      { label: "Toughest run", dot: BUCKET_STRONG[5], ...byAverage[byAverage.length - 1],
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
  const togglePin = (code: string) =>
    setPinned((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  const onGridMove = (event: MouseEvent<HTMLTableElement>) => {
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
          <div className="toolbar-left">
            <div className="stepper">
              <button type="button" aria-label="Previous matchday" disabled={start === 0} onClick={() => setStartColumn(start - 1)}>
                <Chevron direction="left" />
              </button>
              <div className="range">
                {columns.length > 0 ? `MD${columns[0].number} – MD${columns[columns.length - 1].number}` : "—"}
              </div>
              <button type="button" aria-label="Next matchday" disabled={start >= total - 1 || (horizon !== "all" && end >= total)} onClick={() => setStartColumn(start + 1)}>
                <Chevron direction="right" />
              </button>
            </div>
            <SegmentedControl label="Horizon" value={horizon} onChange={setHorizon} options={HORIZONS} />
            <SegmentedControl label="Lens" value={lens} onChange={setLens} options={LENSES} />
          </div>
          <div className="toolbar-right">
            <div className="legend" aria-label="Difficulty key">
              Easy
              {([1, 2, 3, 4, 5] as const).map((bucket) => (
                <span key={bucket} className={`chip f${bucket}`}>{bucket}</span>
              ))}
              Hard
            </div>
            <label className="search">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
              <input type="search" placeholder="Search teams" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
          </div>
        </div>

        <div className={`scroll ${view === "plain" ? "plain" : ""}`}>
          <table onMouseMove={onGridMove} onMouseLeave={() => { hoveredKey.current = null; tooltip.current?.hide(); }}>
            <thead>
              <tr>
                <th className={`team-col sortable ${sortClass({ kind: "team" })}`} onClick={() => toggleSort({ kind: "team" })}>
                  <span className="gw">Team<span className="arrow">↓</span></span>
                </th>
                {columns.map((md, i) => {
                  const key: SortKey = { kind: "matchday", column: start + i };
                  return (
                    <th key={md.number} className={`sortable ${md.finished ? "past" : ""} ${sortClass(key)}`} onClick={() => toggleSort(key)}>
                      <span className="gw">MD{md.number}<span className="arrow">↓</span></span>
                      <span className="date">{formatDay(md.date_from)}</span>
                    </th>
                  );
                })}
                <th className={`avg-col sortable ${sortClass({ kind: "average" })}`} onClick={() => toggleSort({ kind: "average" })}>
                  <span className="gw">Avg<span className="arrow">↓</span></span>
                  <span className="date">{LENS_COPY[lens].average.replace("Avg ", "")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((team) => {
                const matches = !q || team.name.toLowerCase().includes(q) || team.code.toLowerCase().includes(q);
                const dim = !matches || (pinned.size > 0 && !pinned.has(team.code));
                const average = averageOf(team);
                return (
                  <tr key={team.code} className={`${dim ? "dim" : ""} ${pinned.has(team.code) ? "pinned" : ""}`}>
                    <td className="team-col">
                      <button type="button" className="team" onClick={() => togglePin(team.code)} aria-pressed={pinned.has(team.code)}>
                        <Crest team={team} />
                        <span className="team-name">{team.name}</span>
                      </button>
                    </td>
                    {team.cells.slice(start, end).map((cells, i) => (
                      <td key={grid.matchdays[start + i].number}>
                        <FixtureCell
                          cells={cells}
                          cellKey={(cell) => `${team.code}-${cell.fixture_id}`}
                          bucketOf={(cell) => cellBucket(cell, lens, scale)}
                        />
                      </td>
                    ))}
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
        {LENS_COPY[lens].hint}. Click a team to pin it, a matchday or “Avg” to sort.
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
