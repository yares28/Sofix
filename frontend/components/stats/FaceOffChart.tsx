"use client";

import { ResponsiveRadar } from "@nivo/radar";
import { useMemo, useState } from "react";
import { AXES, chartLabel, edge, profiles, type ChartWindow, type Position } from "../../lib/statCharts";
import CardArt from "../cards/CardArt";
import Link from "../navigation/NavigationLink";
import { Crest, PICK_COLORS, useDark, useNarrow } from "./chartParts";

const POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];
const fold = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const SHORT: Record<string, string> = { accurate_long_balls: "Long balls", big_chance_created: "Big chances", goals_conceded: "Few conceded", successful_final_third_passes: "Final-third passes", long_pass_own_to_opp_success: "Long passes forward", adjusted_total_att_assist: "Shot assists", accurate_keeper_sweeper: "Sweeper actions", pen_area_entries: "Box entries" };
const axisLabel = (k: string) => SHORT[k] ?? chartLabel(k);

/** Face-off: up to three players of one position, any league, on twelve stats against everyone of that position. */
export default function FaceOffChart({ data }: { data: ChartWindow }) {
  const dark = useDark();
  const narrow = useNarrow();
  const [pos, setPos] = useState<Position>("MID");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[] | null>(null);
  const pool = useMemo(() => data.players.filter((p) => p.pos === pos), [data, pos]);
  const prof = useMemo(() => profiles(data, pos), [data, pos]);
  const best = useMemo(() => [...pool].sort((a, b) => b.avg - a.avg), [pool]);
  const chosen = (picked ?? best.slice(0, 3).map((p) => p.slug)).map((s) => pool.find((p) => p.slug === s)).filter((p) => p !== undefined);
  const slugs = chosen.map((p) => p.slug);
  const needle = fold(q.trim());
  const hits = (needle ? pool.filter((p) => fold(p.name).includes(needle) || fold(p.club).includes(needle)) : best).slice(0, narrow ? 4 : 8);
  const axes = AXES[pos];
  const rows = axes.map((k, j) => ({ axis: axisLabel(k), ...Object.fromEntries(chosen.map((p) => [p.slug, Math.round((prof.get(p.slug)?.[j] ?? 0) * 100)])) }));
  const add = (slug: string) => { if (!slugs.includes(slug)) setPicked([...slugs, slug].slice(-3)); setQ(""); };
  const text = dark ? "#a3a3a9" : "#6e6e73";

  return (
    <div className="sc-faceoff">
      <div className="sc-filters">
        <div className="sc-seg" role="group" aria-label="Position">
          {POSITIONS.map((p) => <button key={p} type="button" aria-pressed={pos === p} onClick={() => { setPos(p); setPicked(null); setQ(""); }}>{p}</button>)}
        </div>
      </div>
      <div className="sc-faceoff-grid">
        <div className="sc-find">
          <label className="sc-search">
            <span className="visually-hidden">Find a {pos}</span>
            <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            <input type="search" name="faceoff-player" autoComplete="off" spellCheck={false} value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Find any ${pos}…`} />
          </label>
          <ul className="sc-hits">
            {hits.map((p) => (
              <li key={p.slug}>
                <button type="button" className="sc-hit" disabled={slugs.includes(p.slug)} onClick={() => add(p.slug)} aria-label={`Compare ${p.name}`}>
                  <span className="sc-hit-card"><CardArt src={p.card} name={p.name} skeleton={<span className="sc-sk" />} /></span>
                  <span className="sc-hit-text"><b>{p.name}</b><small>{p.club} · {p.league}</small></span>
                  <span className="sc-hit-avg">{Math.round(p.avg)}</span>
                </button>
              </li>
            ))}
            {needle && !hits.length ? <li className="sc-none" role="status">No {pos} called “{q.trim()}”</li> : null}
          </ul>
        </div>
        <div className="sc-radar" role="img" aria-label={`${chosen.map((p) => p.name).join(", ")} on twelve stats against every ${pos}`}>
          {chosen.length ? (
            <ResponsiveRadar
              data={rows}
              keys={slugs}
              indexBy="axis"
              maxValue={100}
              gridShape="linear"
              gridLevels={4}
              gridLabelOffset={narrow ? 8 : 18}
              margin={narrow ? { top: 28, right: 86, bottom: 28, left: 86 } : { top: 44, right: 124, bottom: 44, left: 124 }}
              colors={(d) => PICK_COLORS[slugs.indexOf(d.key)] ?? "#86868b"}
              fillOpacity={0.14}
              borderWidth={2.5}
              dotSize={6}
              dotBorderWidth={0}
              blendMode={dark ? "normal" : "multiply"}
              isInteractive={false}
              theme={{ text: { fontSize: narrow ? 10 : 12, fill: text, fontFamily: "inherit", fontWeight: 600 }, grid: { line: { stroke: dark ? "#2c2c31" : "#e8e8ed" } } }}
              motionConfig="gentle"
            />
          ) : <p className="sc-empty" role="status">Pick up to three {pos}s</p>}
        </div>
        <ol className="sc-picked">
          {chosen.map((p, i) => {
            const best = edge(prof.get(p.slug) ?? [], pos);
            return (
              <li key={p.slug} style={{ "--pick": PICK_COLORS[i] } as React.CSSProperties}>
                <Link className="sc-picked-card" href={`/players/${p.slug}`} prefetch={false} aria-label={`${p.name}: open his page`}><CardArt src={p.card} name={p.name} skeleton={<span className="sc-sk" />} /></Link>
                <span className="sc-picked-text">
                  <small><Crest src={p.crest} size={16} />{p.club}</small>
                  <b>{p.name}{p.mine ? <span className="sc-yours">Yours</span> : null}</b>
                  <span><strong>Top {best.top}%</strong> for {axisLabel(best.key).toLowerCase()}</span>
                  <small>{p.league} · {Math.round(p.avg)} average</small>
                </span>
                <button type="button" className="sc-x" aria-label={`Remove ${p.name}`} onClick={() => setPicked(slugs.filter((s) => s !== p.slug))}>×</button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
