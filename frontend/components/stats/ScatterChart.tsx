"use client";

import { ResponsiveScatterPlot, type ScatterPlotLayerProps, type ScatterPlotNodeData } from "@nivo/scatterplot";
import { useMemo, useRef, useState } from "react";
import { AVG, chartLabel, chartValue, LEAGUES, ordinal, scatterField, standing, valueOf, type ChartPlayer, type ChartWindow, type Position } from "../../lib/statCharts";
import { LeagueMenu, PlayerPop, POS_COLOR, StatSelect, useDark } from "./chartParts";

type Datum = { x: number; y: number; player: ChartPlayer };
type Node = ScatterPlotNodeData<Datum>;
const POSITIONS: (Position | "ALL")[] = ["ALL", "GK", "DEF", "MID", "FWD"];
const MARGIN = { top: 16, right: 24, bottom: 40, left: 52 };
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

/** Your cards wear a dark ring, the shown player a bigger one: drawn over nivo's dots. */
function rings(selected: string | null, ink: string, width: { current: number }) {
  return function Rings({ nodes, innerWidth }: ScatterPlotLayerProps<Datum>) {
    width.current = innerWidth; // where the card opens: to the left of a dot in the right half
    return (
      <g aria-hidden="true">
        {nodes.filter((n) => n.data.player.mine || n.data.player.slug === selected).map((n) => (
          <circle key={n.id} cx={n.x} cy={n.y} r={n.size / 2 + (n.data.player.slug === selected ? 5 : 2)} fill="none" stroke={ink} strokeWidth={n.data.player.slug === selected ? 2.5 : 1.5} />
        ))}
      </g>
    );
  };
}

/** Who sticks out: one dot per player, any two stats, hover for his card and click to keep it. */
export default function ScatterChart({ data }: { data: ChartWindow }) {
  const dark = useDark();
  const [league, setLeague] = useState<string>("LaLiga");
  const [pos, setPos] = useState<Position | "ALL">("ALL");
  const [x, setX] = useState("ontarget_scoring_att");
  const [y, setY] = useState(AVG);
  const [hover, setHover] = useState<Node | null>(null);
  const [pinned, setPinned] = useState<Node | null>(null);
  const plotWidth = useRef(1000);
  const field = useMemo(() => scatterField(data, { league, pos }, x, y), [data, league, pos, x, y]);
  const counts = useMemo(() => Object.fromEntries((["ALL", ...LEAGUES] as string[]).map((l) => [l, data.players.filter((p) => (l === "ALL" || p.league === l) && (pos === "ALL" || p.pos === pos)).length])), [data, pos]);
  const series = useMemo(() => (["GK", "DEF", "MID", "FWD"] as Position[])
    .map((p) => ({ id: p, data: field.players.filter((pl) => pl.pos === p).map((player) => ({ x: valueOf(data, player, x)!, y: valueOf(data, player, y)!, player })) }))
    .filter((s) => s.data.length), [field, data, x, y]);
  const xs = field.players.map((p) => valueOf(data, p, x)!);
  const ys = field.players.map((p) => valueOf(data, p, y)!);
  const shown = pinned ?? hover;
  const shownStill = shown && field.players.includes(shown.data.player) ? shown : null;
  const ink = dark ? "#f2f2f4" : "#1d1d1f";
  const line = dark ? "#2c2c31" : "#ececf0";
  const text = dark ? "#a3a3a9" : "#6e6e73";
  const reset = () => { setHover(null); setPinned(null); };
  const line_ = (key: string, p: ChartPlayer, values: number[]) => {
    const v = valueOf(data, p, key)!;
    const { rank, of } = standing(values, v);
    return { big: chartValue(key, v), label: key === AVG ? `average score${data.window === "cur" ? " this season" : ` · ${data.window.toUpperCase()}`}` : chartLabel(key).toLowerCase(), bar: v / (Math.max(...values) || 1), sub: `${ordinal(rank)} of ${of} ${pos === "ALL" ? "players" : `${pos}s`}` };
  };

  return (
    <div className="sc-scatter">
      <div className="sc-filters">
        <LeagueMenu value={league} counts={counts} onChange={(l) => { setLeague(l); reset(); }} />
        <div className="sc-seg" role="group" aria-label="Position">
          {POSITIONS.map((p) => (
            <button key={p} type="button" aria-pressed={pos === p} onClick={() => { setPos(p); reset(); }}>
              {p !== "ALL" ? <i style={{ background: POS_COLOR[p] }} /> : null}{p === "ALL" ? "All" : p}
            </button>
          ))}
        </div>
      </div>
      <div className="sc-plot" onMouseLeave={() => setHover(null)}>
        <StatSelect className="sc-axis sc-axis-y" label="Up the side" value={y} onChange={(k) => { setY(k); reset(); }} keys={data.keys} />
        <StatSelect className="sc-axis sc-axis-x" label="Along the bottom" value={x} onChange={(k) => { setX(k); reset(); }} keys={data.keys} />
        {field.empty ? <p className="sc-empty" role="status">{field.empty}</p> : (
          <div className="sc-canvas">
            <ResponsiveScatterPlot<Datum>
              data={series}
              margin={MARGIN}
              xScale={{ type: "linear", min: 0, max: Math.max(...xs) * 1.06 || 1 }}
              yScale={{ type: "linear", min: y === AVG ? Math.max(0, Math.floor(Math.min(...ys) / 10) * 10) : 0, max: Math.max(...ys) * 1.05 || 1 }}
              colors={(s) => POS_COLOR[s.serieId as Position]}
              nodeSize={(n) => Math.round(8 + Math.sqrt(n.data.player.starts) * 1.4)}
              axisBottom={{ tickSize: 0, tickPadding: 10, tickValues: 5, format: (v) => chartValue(x, Number(v)) }}
              axisLeft={{ tickSize: 0, tickPadding: 10, tickValues: 5, format: (v) => chartValue(y, Number(v)) }}
              gridXValues={5}
              gridYValues={5}
              markers={[
                { axis: "x", value: median(xs), lineStyle: { stroke: text, strokeWidth: 1, strokeDasharray: "4 4", strokeOpacity: 0.6 } },
                { axis: "y", value: median(ys), lineStyle: { stroke: text, strokeWidth: 1, strokeDasharray: "4 4", strokeOpacity: 0.6 } },
              ]}
              theme={{ text: { fontSize: 11, fill: text, fontFamily: "inherit" }, grid: { line: { stroke: line } }, axis: { ticks: { text: { fontSize: 11, fill: text } } } }}
              blendMode={dark ? "normal" : "multiply"}
              useMesh
              tooltip={() => null}
              onMouseEnter={(n) => setHover(n)}
              onMouseMove={(n) => setHover(n)}
              onClick={(n) => setPinned((was) => (was?.data.player.slug === n.data.player.slug ? null : n))}
              layers={["grid", "axes", "markers", "nodes", rings(shownStill?.data.player.slug ?? null, ink, plotWidth), "mesh"]}
              role="img"
              ariaLabel={`${chartLabel(y)} against ${chartLabel(x)} for ${field.players.length} ${league === "ALL" ? "" : `${league} `}players`}
              animate
              motionConfig="gentle"
            />
            {shownStill ? (
              <PlayerPop
                player={shownStill.data.player}
                pinned={!!pinned}
                onClose={() => setPinned(null)}
                lines={[line_(y, shownStill.data.player, ys), line_(x, shownStill.data.player, xs)]}
                style={{
                  left: shownStill.x + MARGIN.left + (shownStill.x > plotWidth.current / 2 ? -428 : 22),
                  top: Math.max(0, shownStill.y + MARGIN.top - 130),
                }}
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
