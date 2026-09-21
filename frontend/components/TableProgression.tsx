"use client";

import { ResponsiveLine, type LineCustomSvgLayerProps, type SliceTooltipProps } from "@nivo/line";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { seasonProgression, type ClubProgression } from "../lib/progression";
import { zone } from "../lib/table";
import type { FixtureGrid } from "../lib/types";
import { Chevron } from "./Chevron";
import { badgeText, crestSource } from "./Crest";
import SegmentedControl from "./SegmentedControl";

/**
 * Every club's position, gameweek by gameweek: solid where the games have been played, dashed where the
 * projection takes over, dotted where the model had it before the season, with each club's crest at the end.
 *
 * Presets pick a part of the table. Picking clubs by hand always reads them against the whole league: the view
 * switches to All, the picked clubs keep their colour and the rest fade. One club picked is the focus, with
 * the band showing where 8 in 10 simulated seasons put it that week. The zones and the pre-season line are
 * switched in the options behind the (i) button. See lib/progression.ts for the numbers.
 */

type Group = "europe" | "relegation" | "all";
type Range = "season" | "played" | "ahead";

interface Serie {
  id: string;
  club: string;
  phase: "played" | "projected" | "opening";
  color: string;
  dim: boolean;
  data: { x: number; y: number }[];
}

const SIMULATIONS = 600; // the whole computation is ~100 ms on a real board, and the count barely moves it
const DIM = "#d9d9de";
const INK_2 = "#6e6e73";
const LINE = "#e8e8ed";

// The same zone colours the table uses (globals.css .zone-*), as flat fills behind the lines.
const ZONES = [
  { from: 1, to: 4, fill: "#0071e3", label: "Champions League" },
  { from: 5, to: 5, fill: "#f29d38", label: "Europa League" },
  { from: 6, to: 6, fill: "#34c759", label: "Conference League" },
] as const;
const RELEGATION = "#c4312a";
const PICKER_WIDTH = 260; // keep in step with .club-picker-panel in globals.css

const THEME = {
  text: { fontSize: 11, fill: INK_2, fontFamily: "inherit" },
  axis: { ticks: { line: { stroke: "transparent" }, text: { fontSize: 11, fill: INK_2 } } },
  grid: { line: { stroke: LINE, strokeWidth: 1 } },
  crosshair: { line: { stroke: INK_2, strokeWidth: 1, strokeOpacity: 0.4, strokeDasharray: "3 3" } },
};

export default function TableProgression({ grid, through }: { grid: FixtureGrid; through: number | null }) {
  const progression = useMemo(() => seasonProgression(grid, { simulations: SIMULATIONS }), [grid]);
  const [group, setGroup] = useState<Group>("europe");
  const [picked, setPicked] = useState<string[]>([]);
  const [range, setRange] = useState<Range>("season");
  const [zones, setZones] = useState(true);
  const [prediction, setPrediction] = useState(true);

  const { clubs, lastPlayed, columns } = progression;
  const hasPrediction = clubs.some((club) => club.openingEnd !== null);
  const size = clubs.length;
  const byCode = useMemo(() => new Map(clubs.map((club) => [club.team.code, club])), [clubs]);
  const ordered = useMemo(() => [...clubs].sort((a, b) => a.end - b.end), [clubs]);
  // The picker lists clubs the way the table above lists them: as they stand.
  const standing = useMemo(
    () => [...clubs].sort((a, b) => (a.now ?? a.end) - (b.now ?? b.end) || a.end - b.end),
    [clubs],
  );

  // Some but not all clubs picked: they are read against the whole league, the rest fading behind them.
  const picking = picked.length > 0 && picked.length < size;
  const focus = picking && picked.length === 1 ? (byCode.get(picked[0]!) ?? null) : null;
  const followed = useMemo(
    () => picked.map((code) => byCode.get(code)).filter((club): club is ClubProgression => !!club),
    [picked, byCode],
  );
  const shown = useMemo(() => {
    if (picking || group === "all") return ordered;
    if (group === "europe") return ordered.filter((club) => club.end <= 6);
    return ordered.filter((club) => club.end > size - 5); // the drop and the two clubs above it
  }, [picking, group, ordered, size]);

  const gameweeks = grid.matchdays.map((matchday) => matchday.number);
  const firstGw = gameweeks[0] ?? 1;
  const lastGw = gameweeks[gameweeks.length - 1] ?? 38;
  const nowGw = lastPlayed >= 0 ? gameweeks[lastPlayed]! : null;
  const [fromGw, toGw] =
    range === "played" && nowGw !== null
      ? [firstGw, nowGw]
      : range === "ahead" && nowGw !== null
        ? [nowGw, lastGw]
        : [firstGw, lastGw];

  const series = useMemo<Serie[]>(() => {
    const inRange = (point: { gameweek: number }) => point.gameweek >= fromGw && point.gameweek <= toGw;
    const out: Serie[] = [];
    for (const club of shown) {
      const dim = picking && !picked.includes(club.team.code);
      const played = club.path.filter((point) => point.played && inRange(point));
      // The projection starts at the last played point, so the solid and dashed halves join up.
      const boundary = club.path.filter((point) => point.played).slice(-1);
      const projected = [...boundary, ...club.path.filter((point) => !point.played)].filter(inRange);
      const toData = (points: typeof club.path) => points.map((point) => ({ x: point.gameweek, y: point.position }));
      if (played.length) {
        out.push({ id: `${club.team.code}|played`, club: club.team.code, phase: "played", color: dim ? DIM : club.team.color, dim, data: toData(played) });
      }
      if (projected.length > 1) {
        out.push({ id: `${club.team.code}|projected`, club: club.team.code, phase: "projected", color: dim ? DIM : club.team.color, dim, data: toData(projected) });
      }
      // What the model said before a ball was kicked: the line the other two are judged against.
      if (prediction && !dim) {
        const opening = club.path.filter((point) => point.opening !== null && inRange(point));
        if (opening.length > 1) {
          out.push({
            id: `${club.team.code}|opening`,
            club: club.team.code,
            phase: "opening",
            color: club.team.color,
            dim: false,
            data: opening.map((point) => ({ x: point.gameweek, y: point.opening! })),
          });
        }
      }
    }
    // Faded clubs first, so the ones being followed are drawn on top.
    return out.sort((a, b) => Number(b.dim) - Number(a.dim));
  }, [shown, picking, picked, fromGw, toGw, prediction]);

  // Picking by hand always switches the view to All; a preset clears the picks.
  const pick = (codes: string[]) => {
    setPicked(codes);
    if (codes.length) setGroup("all");
  };
  const setPreset = (next: Group) => {
    setGroup(next);
    setPicked([]);
  };

  if (columns < 2 || !size) return null;
  const described = focus ? [focus] : picking ? followed : shown;

  return (
    <section className="progression" aria-labelledby="progression-title">
      <header className="progression-head">
        <h3 id="progression-title">Position by gameweek</h3>
        <div className="progression-controls">
          <SegmentedControl<Group>
            label="Clubs shown"
            value={group}
            onChange={setPreset}
            options={[
              { value: "europe", label: "Europe" },
              { value: "relegation", label: "Relegation" },
              { value: "all", label: "All" },
            ]}
          />
          <ClubPicker clubs={standing} picked={picked} onChange={pick} />
          {nowGw !== null && (
            <SegmentedControl<Range>
              label="Gameweeks shown"
              value={range}
              onChange={setRange}
              options={[
                { value: "season", label: "Season" },
                { value: "played", label: "Played" },
                { value: "ahead", label: "Ahead" },
              ]}
            />
          )}
        </div>
      </header>

      {focus && <FocusNote club={focus} size={size} lastPlayed={lastPlayed} />}

      <div className="progression-frame">
        {/* A region that scrolls must be reachable by keyboard (axe scrollable-region-focusable). */}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
        <div className="chart-scroll" tabIndex={0} role="group" aria-label="Position chart, scrolls sideways">
          <div className="progression-chart">
            <ResponsiveLine<Serie>
              data={series}
              theme={THEME}
              colors={(serie) => serie.color}
              margin={{ top: 14, right: 64, bottom: 34, left: 30 }}
              xScale={{ type: "linear", min: fromGw, max: toGw }}
              yScale={{ type: "linear", min: 1, max: size, reverse: true }}
              curve="monotoneX"
              animate={false}
              role="img"
              ariaLabel={summary(described, size)}
              enablePoints={false}
              enableGridX={false}
              gridYValues={[1, 4, 6, 10, 15, size]}
              axisLeft={{ tickValues: [1, 4, 6, 10, 15, size], tickSize: 0, tickPadding: 6 }}
              axisBottom={{ tickValues: tickGameweeks(fromGw, toGw), tickSize: 0, tickPadding: 8, legend: "Gameweek", legendOffset: 28, legendPosition: "middle" }}
              enableSlices="x"
              sliceTooltip={(props) => <SliceCard {...props} clubs={byCode} lastPlayed={lastPlayed} gameweeks={gameweeks} />}
              layers={[
                ...(zones ? [(layer: LayerProps) => <Zones key="zones" {...layer} size={size} />] : []),
                "grid",
                "axes",
                (layer) => <Band key="band" {...layer} focus={focus} from={fromGw} to={toGw} />,
                (layer) => <NowMarker key="now" {...layer} gameweek={nowGw} selected={through === null ? null : gameweeks[through] ?? null} from={fromGw} to={toGw} />,
                (layer) => <Lines key="lines" {...layer} />,
                "slices",
                "mesh",
                (layer) => <Crests key="crests" {...layer} clubs={byCode} />,
              ]}
            />
          </div>
        </div>
        <ChartOptions
          zones={zones}
          onZones={setZones}
          prediction={prediction}
          onPrediction={setPrediction}
          hasPrediction={hasPrediction}
        />
      </div>

      <table className="visually-hidden">
        <caption>Position by gameweek for the clubs shown</caption>
        <thead>
          <tr>
            <th scope="col">Club</th>
            <th scope="col">Now</th>
            <th scope="col">Projected finish</th>
            <th scope="col">Before the season</th>
          </tr>
        </thead>
        <tbody>
          {described.map((club) => (
            <tr key={club.team.code}>
              <th scope="row">{club.team.name}</th>
              <td>{club.now ?? "—"}</td>
              <td>{club.end}</td>
              <td>{club.openingEnd ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ---------------------------------------------------------------- pickers and options

/** Close a popover on a click outside it or on Escape. */
function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, open, close]);
}

/** One button for every club: tick the ones to follow, or all of them. */
function ClubPicker({
  clubs, picked, onChange,
}: {
  clubs: ClubProgression[];
  picked: string[];
  onChange: (codes: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  // Open toward whichever side has room: on a phone the button sits on the right, so the list opens leftwards.
  const [align, setAlign] = useState<"left" | "right">("left");
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  const all = picked.length === clubs.length;
  const single = picked.length === 1 ? clubs.find((club) => club.team.code === picked[0])?.team.name : undefined;
  const label = picked.length === 0 ? "Clubs" : all ? "All clubs" : single ?? `${picked.length} clubs`;
  const toggle = (code: string) =>
    onChange(picked.includes(code) ? picked.filter((c) => c !== code) : [...picked, code]);

  return (
    <div className="popover-anchor" ref={ref}>
      <button
        type="button"
        className={`picker-button ${picked.length ? "active" : ""}`}
        aria-expanded={open}
        aria-controls="club-picker-panel"
        onClick={(event) => {
          const button = event.currentTarget.getBoundingClientRect();
          setAlign(button.left + PICKER_WIDTH > document.documentElement.clientWidth - 8 ? "right" : "left");
          setOpen((value) => !value);
        }}
      >
        {label}
        <span className="caret" aria-hidden="true"><Chevron direction="right" size={12} /></span>
      </button>
      {open && (
        <div id="club-picker-panel" className={`popover club-picker-panel ${align}`} role="group" aria-label="Clubs to follow">
          <div className="popover-actions">
            <button type="button" onClick={() => onChange(all ? [] : clubs.map((club) => club.team.code))}>
              {all ? "Clear all" : "Select all"}
            </button>
            {picked.length > 0 && !all && (
              <button type="button" onClick={() => onChange([])}>Clear</button>
            )}
          </div>
          <ul>
            {clubs.map((club) => (
              <li key={club.team.code}>
                <label className="picker-row">
                  <input type="checkbox" checked={picked.includes(club.team.code)} onChange={() => toggle(club.team.code)} />
                  <ChipCrest club={club} />
                  <span className="picker-name">{club.team.name}</span>
                  {club.now !== null && <span className="picker-pos">{ordinal(club.now)}</span>}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** The (i) button in the chart's corner: what to draw, and what each line means. */
function ChartOptions({
  zones, onZones, prediction, onPrediction, hasPrediction,
}: {
  zones: boolean;
  onZones: (on: boolean) => void;
  prediction: boolean;
  onPrediction: (on: boolean) => void;
  hasPrediction: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  return (
    <div className="chart-options" ref={ref}>
      {open && (
        <div id="chart-options-panel" className="popover chart-options-panel" role="group" aria-label="Chart options">
          <label className="option-row">
            <input type="checkbox" checked={zones} onChange={(event) => onZones(event.target.checked)} />
            <span>
              Champions League, Europe and relegation
              <span className="option-swatches" aria-hidden="true">
                {ZONES.map((band) => <i key={band.label} style={{ background: band.fill }} />)}
                <i style={{ background: RELEGATION }} />
              </span>
            </span>
          </label>
          {hasPrediction && (
            <label className="option-row">
              <input type="checkbox" checked={prediction} onChange={(event) => onPrediction(event.target.checked)} />
              <span>
                Prediction
                <small>Where the model had each club before the season started</small>
              </span>
            </label>
          )}
          <div className="option-key" aria-hidden="true">
            <span><i className="key-line solid" /> Played</span>
            <span><i className="key-line dashed" /> Projected</span>
            {hasPrediction && <span><i className="key-line dotted" /> Prediction</span>}
            <span><i className="key-band" /> 8 in 10 seasons, one club picked</span>
          </div>
        </div>
      )}
      <button
        type="button"
        className="info-button"
        aria-label="Chart options"
        aria-expanded={open}
        aria-controls="chart-options-panel"
        onClick={() => setOpen((value) => !value)}
      >
        i
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- custom layers

type LayerProps = LineCustomSvgLayerProps<Serie>;

/** European places and the drop, shaded behind everything else. */
function Zones({ yScale, innerWidth, size }: LayerProps & { size: number }) {
  const row = (from: number, to: number) => {
    const top = yScale((from - 0.5) as never);
    const bottom = yScale((to + 0.5) as never);
    return { y: Math.min(top, bottom), height: Math.abs(bottom - top) };
  };
  const bands = [...ZONES.map((band) => ({ ...band })), { from: size - 2, to: size, fill: "#c4312a", label: "Relegation" }];
  return (
    <g>
      {bands.map((band) => {
        const { y, height } = row(band.from, band.to);
        return <rect key={band.label} x={0} y={y} width={innerWidth} height={height} fill={band.fill} opacity={0.07} />;
      })}
    </g>
  );
}

/** Where 8 in 10 simulated seasons put the focused club, week by week. */
function Band({ xScale, yScale, focus, from, to }: LayerProps & { focus: ClubProgression | null; from: number; to: number }) {
  if (!focus) return null;
  const points = focus.path.filter((p) => !p.played && p.low !== null && p.high !== null && p.gameweek >= from && p.gameweek <= to);
  if (points.length < 2) return null;
  const top = points.map((p) => `${xScale(p.gameweek as never)},${yScale(p.low! as never)}`);
  const bottom = [...points].reverse().map((p) => `${xScale(p.gameweek as never)},${yScale(p.high! as never)}`);
  return <path d={`M${top.join("L")}L${bottom.join("L")}Z`} fill={focus.team.color} opacity={0.14} />;
}

/** The last played gameweek, and the gameweek the rest of the page is looking at. */
function NowMarker({
  xScale, innerHeight, gameweek, selected, from, to,
}: LayerProps & { gameweek: number | null; selected: number | null; from: number; to: number }) {
  const inside = (value: number | null): value is number => value !== null && value >= from && value <= to;
  return (
    <g>
      {inside(selected) && selected !== gameweek && (
        <line x1={xScale(selected as never)} x2={xScale(selected as never)} y1={0} y2={innerHeight} stroke="#0071e3" strokeWidth={1} strokeDasharray="2 4" opacity={0.5} />
      )}
      {inside(gameweek) && (
        <g>
          <line x1={xScale(gameweek as never)} x2={xScale(gameweek as never)} y1={0} y2={innerHeight} stroke={INK_2} strokeWidth={1} strokeDasharray="3 3" opacity={0.55} />
          <text x={xScale(gameweek as never) + 4} y={10} fontSize={10} fill={INK_2}>played to here</text>
        </g>
      )}
    </g>
  );
}

/** Solid for played gameweeks, dashed for the projection; thinner once the whole league is on. */
function Lines({ series, lineGenerator }: LayerProps) {
  const lit = series.filter((serie) => !serie.dim).length;
  const width = lit > 16 ? 1.8 : 2.4;
  return (
    <g>
      {series.map((serie) => (
        <path
          key={String(serie.id)}
          d={lineGenerator(serie.data.map((datum) => datum.position)) ?? undefined}
          fill="none"
          stroke={serie.color}
          strokeWidth={serie.dim ? 1.4 : serie.phase === "opening" ? 1.6 : width}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={serie.phase === "projected" ? "5 5" : serie.phase === "opening" ? "1 5" : undefined}
          opacity={serie.dim ? 0.65 : serie.phase === "opening" ? 0.65 : 1}
        />
      ))}
    </g>
  );
}

/**
 * A crest at the end of every line, so a club can be found without reading a legend. Clubs that finish on
 * top of each other are pushed apart just enough to stay readable, with a hairline back to the line's end.
 */
function Crests({ series, clubs, innerHeight }: LayerProps & { clubs: Map<string, ClubProgression> }) {
  const ends = new Map<string, { x: number; y: number; dim: boolean }>();
  for (const serie of series) {
    if (serie.phase === "opening") continue;
    const last = serie.data[serie.data.length - 1];
    if (!last) continue;
    const current = ends.get(serie.club);
    if (!current || last.position.x >= current.x) ends.set(serie.club, { ...last.position, dim: serie.dim });
  }

  const gap = ends.size > 12 ? 15 : 22;
  const placed = [...ends]
    .map(([code, end]) => ({ code, ...end, labelY: end.y }))
    .sort((a, b) => a.y - b.y);
  let floor = gap / 2; // push down through the list, then back up if the last one ran off the bottom
  for (const item of placed) {
    item.labelY = Math.max(item.y, floor);
    floor = item.labelY + gap;
  }
  let ceiling = innerHeight - gap / 2;
  for (let i = placed.length - 1; i >= 0; i--) {
    const item = placed[i]!;
    item.labelY = Math.min(item.labelY, ceiling);
    ceiling = item.labelY - gap;
  }

  return (
    <g>
      {placed.map(({ code, x, y, labelY, dim }) => {
        const club = clubs.get(code);
        if (!club) return null;
        const src = crestSource(club.team.crest_url);
        const size = dim ? 13 : 19;
        return (
          <g key={code} opacity={dim ? 0.55 : 1}>
            {Math.abs(labelY - y) > 1 && (
              <path d={`M${x},${y}L${x + 7},${labelY}`} stroke={club.team.color} strokeWidth={1} fill="none" opacity={0.5} />
            )}
            <g transform={`translate(${x + 14}, ${labelY})`}>
              <circle r={size / 2 + 2.5} fill="#fff" stroke={LINE} />
              {src ? (
                <image href={src} x={-size / 2} y={-size / 2} width={size} height={size} preserveAspectRatio="xMidYMid meet" />
              ) : (
                <>
                  <circle r={size / 2} fill={club.team.color} />
                  <text textAnchor="middle" dominantBaseline="central" fontSize={size * 0.4} fontWeight={700} fill={badgeText(club.team.color)}>
                    {code}
                  </text>
                </>
              )}
            </g>
          </g>
        );
      })}
    </g>
  );
}

// ---------------------------------------------------------------- tooltip and notes

/** The table as it stood (or is projected to stand) at the hovered gameweek. */
function SliceCard({
  slice, clubs, lastPlayed, gameweeks,
}: SliceTooltipProps<Serie> & { clubs: Map<string, ClubProgression>; lastPlayed: number; gameweeks: number[] }) {
  const gameweek = Number(slice.points[0]?.data.x ?? 0);
  const column = gameweeks.indexOf(gameweek);
  const played = column >= 0 && column <= lastPlayed;
  const seen = new Set<string>();
  const rows = slice.points
    .map((point) => ({ point, club: clubs.get(String(point.seriesId).split("|")[0] ?? "") }))
    .filter(({ club, point }) => {
      if (!club || seen.has(club.team.code)) return false;
      // The boundary gameweek appears in both halves; keep the played one.
      if (String(point.seriesId).endsWith("projected") && played) return false;
      seen.add(club.team.code);
      return true;
    })
    .map(({ point, club }) => ({ club: club!, position: Number(point.data.y), point: club!.path[column] }))
    .sort((a, b) => a.position - b.position)
    .slice(0, 10);

  return (
    <div className="tip show progression-tip">
      <div className="tip-title">
        GW{gameweek} <span className="muted">· {played ? "played" : "projected"}</span>
      </div>
      {rows.map(({ club, position, point }) => (
        <div key={club.team.code} className="progression-row">
          <span className="progression-pos">{position}</span>
          <span className="progression-dot" style={{ background: club.team.color }} />
          <span className="progression-club">{club.team.name}</span>
          <span className="progression-pts">
            {point ? `${point.points} pts` : ""}
            {point && !point.played && point.low !== null && point.high !== null && (
              <span className="muted"> · {point.low}–{point.high}</span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

function FocusNote({ club, size, lastPlayed }: { club: ClubProgression; size: number; lastPlayed: number }) {
  const end = club.path[club.path.length - 1];
  const move = club.now === null ? 0 : club.now - club.end;
  const place = zone(club.end, size);
  return (
    <p className="progression-focus">
      <b>{club.team.name}</b>{" "}
      {club.now !== null && lastPlayed >= 0 ? (
        <>
          is <b>{ordinal(club.now)}</b> and the model finishes it <b>{ordinal(club.end)}</b>
          {move !== 0 && <> ({move > 0 ? `${move} up` : `${-move} down`})</>}
        </>
      ) : (
        <>is projected to finish <b>{ordinal(club.end)}</b></>
      )}
      {end?.low && end?.high && (
        <>
          {" "}· 8 in 10 seasons end between <b>{ordinal(end.low)}</b> and <b>{ordinal(end.high)}</b>
        </>
      )}
      {place && <> · {place.label} on this projection</>}
      {club.openingEnd !== null && (
        <>
          <br />
          {club.openingNow !== null && club.now !== null ? (
            <>
              Before the season the model expected it to be <b>{ordinal(club.openingNow)}</b> by now and{" "}
              <b>{ordinal(club.openingEnd)}</b> at the end — it is{" "}
              {club.now === club.openingNow ? (
                <b>exactly on that pace</b>
              ) : (
                <>
                  <b>{Math.abs(club.now - club.openingNow)}</b> {club.now < club.openingNow ? "places ahead of" : "places behind"} that
                  pace
                </>
              )}
              .
            </>
          ) : (
            <>
              Before the season the model had it finishing <b>{ordinal(club.openingEnd)}</b>.
            </>
          )}
        </>
      )}
    </p>
  );
}

function ChipCrest({ club }: { club: ClubProgression }) {
  const src = crestSource(club.team.crest_url);
  return src ? (
    // Decorative: the club's name is next to it. Not next/image — these are 20 tiny remote crests.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={16} height={16} loading="lazy" referrerPolicy="no-referrer" />
  ) : (
    <span className="chip-dot" style={{ background: club.team.color }} />
  );
}

const ordinal = (value: number) => {
  const suffix = value % 10 === 1 && value % 100 !== 11 ? "st" : value % 10 === 2 && value % 100 !== 12 ? "nd" : value % 10 === 3 && value % 100 !== 13 ? "rd" : "th";
  return `${value}${suffix}`;
};

function tickGameweeks(from: number, to: number): number[] {
  const step = Math.max(1, Math.ceil((to - from + 1) / 12));
  const ticks: number[] = [];
  for (let gameweek = from; gameweek <= to; gameweek += step) ticks.push(gameweek);
  const last = ticks[ticks.length - 1]!;
  if (last !== to) {
    if (to - last < step / 2) ticks.pop(); // don't crowd the final gameweek with the tick before it
    ticks.push(to);
  }
  return ticks;
}

function summary(clubs: ClubProgression[], size: number): string {
  if (clubs.length === 1) {
    const club = clubs[0]!;
    return `${club.team.name}: ${club.now ? `${ordinal(club.now)} now, ` : ""}projected to finish ${ordinal(club.end)} of ${size}.`;
  }
  return `Position by gameweek for ${clubs.length} clubs, played so far and projected to the end of the season.`;
}
