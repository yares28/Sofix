"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import Link from "../FootballLink";
import Crest from "../Crest";
import { scoreColour } from "../../lib/cards";
import { COMPETITIONS, type Competition } from "../../lib/competitions";
import { formatShortKickoff } from "../../lib/grid";
import type { WeekGame } from "../../lib/recap";

/**
 * The round (plans/recap-matchnight.md, step 3): every game of the week, a row of ticket stubs per competition. One competition
 * picker (All, then only competitions with games) and one day picker (All, then only days with games); each row always fills
 * the width, and three games or fewer become wide tickets. The picked game opens its match sheet right under its own row.
 */

const ORDER: Competition[] = ["PD", "PL", "BL1", "FL1", "CL", "EL", "CONF"];
const pct = (p: number | null) => (p === null ? "–" : `${Math.round(p * 100)}%`);
// Each number wears the band of how good it is: a chance as it is, xG 2.5 and xD 4 counted as 100.
const band = (value: number | null): CSSProperties => {
  if (value === null) return { background: "var(--hover)", color: "var(--ink-2)" };
  const { fill, ink } = scoreColour(Math.min(99, value));
  return { background: fill, color: ink };
};
const fillOf = (value: number) => scoreColour(Math.min(99, value)).fill;
const dayLabel = (day: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
const favourite = (g: WeekGame) => (g.win === null || g.loss === null || g.win === g.loss ? null : g.win > g.loss ? "home" : "away");
function upset(g: WeekGame): boolean {
  const fav = favourite(g);
  if (!fav || !g.score) return false;
  const [h, a] = g.score.split("–").map(Number) as [number, number];
  return fav === "home" ? h < a : a < h;
}
const when = (g: WeekGame) => (g.live ? "Live" : !g.confirmed ? "Date TBC" : formatShortKickoff(g.kickoff).split(" ")[1] ?? "");

function Picker({ label, value, count, options, open, onToggle, onPick }: {
  label: string; value: string; count: string; options: { key: string; name: string; n: number }[]; open: boolean; onToggle: () => void; onPick: (key: string) => void;
}) {
  const id = useId();
  return (
    <div className="rx-pick">
      <button type="button" className={open ? "rx-pickbtn open" : "rx-pickbtn"} aria-expanded={open} aria-controls={id} onClick={onToggle}>
        {options.find((o) => o.key === value)?.name ?? label} <span>{count}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open ? (
        <div className="rx-menu" id={id} role="group" aria-label={label}>
          {options.map((o) => (
            <button key={o.key} type="button" aria-pressed={o.key === value} className={o.key === value ? "on" : undefined} onClick={() => onPick(o.key)}>
              <i aria-hidden="true">{o.key === value ? "✓" : ""}</i>{o.name}<span>{o.n}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Chips({ xg, xd }: { xg: number | null; xd: number | null }) {
  return (
    <span className="rx-xgs">
      <span style={band(xg === null ? null : xg * 40)} title="Expected goals">{xg === null ? "xG –" : `${xg.toFixed(2)} xG`}</span>
      <span style={band(xd === null ? null : xd * 25)} title="Expected decisive actions">{xd === null ? "xD –" : `${xd.toFixed(1)} xD`}</span>
    </span>
  );
}

function Tri({ g }: { g: WeekGame }) {
  if (g.win === null || g.draw === null || g.loss === null) return <><span className="rx-nofc" aria-hidden="true" /><span className="rx-nofct">No forecast</span></>;
  return (
    <>
      <span className="rx-tri" aria-hidden="true">
        <span style={{ flex: `${g.win} 1 0`, background: fillOf(g.win * 100) }} />
        <span style={{ flex: `${g.draw} 1 0`, background: "var(--track)" }} />
        <span style={{ flex: `${g.loss} 1 0`, background: fillOf(g.loss * 100) }} />
      </span>
      <span className="rx-trl" aria-hidden="true"><span>{pct(g.win)}</span><span>{pct(g.draw)}</span><span>{pct(g.loss)}</span></span>
    </>
  );
}

const label = (g: WeekGame) => `${g.home.name} ${g.score ?? "v"} ${g.away.name}${g.win === null ? ", no forecast" : `: win ${pct(g.win)}, draw ${pct(g.draw)}, win ${pct(g.loss)}`}`;

function Stub({ g, on, onPick, index }: { g: WeekGame; on: boolean; onPick: () => void; index: number }) {
  const fav = favourite(g);
  return (
    <button type="button" className={on ? "rx-stub on" : "rx-stub"} style={{ animationDelay: `${index * 40}ms` }} onClick={onPick} aria-pressed={on} aria-label={label(g)}>
      {upset(g) ? <span className="rx-upset">Upset</span> : null}
      <Crest team={{ code: g.home.code, color: g.home.color ?? "#8e8e93", crest_url: g.home.crest }} size={40} />
      <span className={fav === "home" ? "rx-tn fav" : "rx-tn"}>{g.home.name}</span>
      <Chips xg={g.xg?.[0] ?? null} xd={g.xd?.[0] ?? null} />
      <span className="rx-perf"><span className={g.score ? "rx-score" : "rx-when"}>{g.score ?? when(g)}</span></span>
      <Crest team={{ code: g.away.code, color: g.away.color ?? "#8e8e93", crest_url: g.away.crest }} size={40} />
      <span className={fav === "away" ? "rx-tn fav" : "rx-tn"}>{g.away.name}</span>
      <Chips xg={g.xg?.[1] ?? null} xd={g.xd?.[1] ?? null} />
      <Tri g={g} />
    </button>
  );
}

function Wide({ g, on, onPick }: { g: WeekGame; on: boolean; onPick: () => void }) {
  const fav = favourite(g);
  return (
    <button type="button" className={on ? "rx-wt on" : "rx-wt"} onClick={onPick} aria-pressed={on} aria-label={label(g)}>
      <span className="rx-sd">
        <Crest team={{ code: g.home.code, color: g.home.color ?? "#8e8e93", crest_url: g.home.crest }} size={44} />
        <span><b className={fav === "home" ? "fav" : undefined}>{g.home.name}</b><Chips xg={g.xg?.[0] ?? null} xd={g.xd?.[0] ?? null} /></span>
      </span>
      <span className="rx-ct">
        <span className="rx-when">{dayLabel(g.day)}{g.score ? "" : ` · ${when(g)}`}</span>
        {g.score ? <span className="rx-score">{g.score}</span> : null}
        <Tri g={g} />
      </span>
      <span className="rx-sd r">
        <Crest team={{ code: g.away.code, color: g.away.color ?? "#8e8e93", crest_url: g.away.crest }} size={44} />
        <span><b className={fav === "away" ? "fav" : undefined}>{g.away.name}</b><Chips xg={g.xg?.[1] ?? null} xd={g.xd?.[1] ?? null} /></span>
      </span>
    </button>
  );
}

function Sheet({ g }: { g: WeekGame }) {
  const rows: { name: string; pair: [number, number] | null; fmt: (v: number) => string; scale: number }[] = [
    { name: "Win", pair: g.win === null || g.loss === null ? null : [g.win, g.loss], fmt: pct, scale: 100 },
    { name: "Expected goals", pair: g.xg, fmt: (v) => v.toFixed(2), scale: 40 },
    { name: "Expected decisives", pair: g.xd, fmt: (v) => v.toFixed(1), scale: 25 },
    { name: "Clean sheet", pair: g.cs && g.cs[0] !== null && g.cs[1] !== null ? [g.cs[0], g.cs[1]] : null, fmt: pct, scale: 100 },
  ];
  const [hs, as] = g.score ? g.score.split("–") : [null, null];
  return (
    <section className="rx-sheet" aria-label={`Match sheet: ${g.home.name} ${g.score ?? "v"} ${g.away.name}`}>
      <div className="rx-stm">
        <Crest team={{ code: g.home.code, color: g.home.color ?? "#8e8e93", crest_url: g.home.crest }} size={52} />
        <span>{g.home.name}<small>{COMPETITIONS[g.comp]} · home{hs !== null ? ` · ${hs}` : ""}</small></span>
      </div>
      <div className="rx-bfs">
        {rows.map((row) => {
          const top = row.pair ? Math.max(row.pair[0], row.pair[1]) || 1 : 1;
          return (
            <div className="rx-bf" key={row.name}>
              <span className="v">{row.pair ? row.fmt(row.pair[0]) : "–"}</span>
              <span className="l">{row.pair ? <i style={{ width: `${(row.pair[0] / top) * 100}%`, background: fillOf(Math.min(99, row.pair[0] * row.scale)) }} /> : null}</span>
              <span className="m">{row.name}</span>
              <span className="r">{row.pair ? <i style={{ width: `${(row.pair[1] / top) * 100}%`, background: fillOf(Math.min(99, row.pair[1] * row.scale)) }} /> : null}</span>
              <span className="v rv">{row.pair ? row.fmt(row.pair[1]) : "–"}</span>
            </div>
          );
        })}
        <span className="rx-both"><b>{pct(g.both)}</b> both score · <b>{pct(g.draw)}</b> draw</span>
      </div>
      <div className="rx-stm r">
        <span>{g.away.name}<small>Away{as !== null ? ` · ${as}` : ""}</small></span>
        <Crest team={{ code: g.away.code, color: g.away.color ?? "#8e8e93", crest_url: g.away.crest }} size={52} />
      </div>
    </section>
  );
}

export default function TheRound({ games, href, title }: { games: WeekGame[]; href?: string; title: string }) {
  const [comp, setComp] = useState<Competition | "all">("all");
  const [day, setDay] = useState<string>("all");
  const [menu, setMenu] = useState<"comp" | "day" | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  // A menu closes on a click outside it or on Escape.
  useEffect(() => {
    if (!menu) return;
    const close = (event: Event) => { if (event instanceof KeyboardEvent ? event.key === "Escape" : !box.current?.contains(event.target as Node)) setMenu(null); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", close); };
  }, [menu]);

  const onDay = (g: WeekGame) => day === "all" || g.day === day;
  const inComp = (g: WeekGame) => comp === "all" || g.comp === comp;
  const comps = ORDER.filter((c) => games.some((g) => g.comp === c && onDay(g)));
  const days = [...new Set(games.filter(inComp).map((g) => g.day))].sort();
  const shown = games.filter((g) => onDay(g) && inComp(g));
  const lanes = ORDER.map((c) => ({ comp: c, games: shown.filter((g) => g.comp === c) })).filter((lane) => lane.games.length);
  // The picked game, any of them (one without a forecast shows its dashes); until one is picked, the first with a forecast.
  const sel = shown.find((g) => g.id === picked) ?? shown.find((g) => g.win !== null) ?? null;

  const compOptions = [{ key: "all", name: "All competitions", n: games.filter(onDay).length }, ...comps.map((c) => ({ key: c, name: COMPETITIONS[c], n: games.filter((g) => g.comp === c && onDay(g)).length }))];
  const dayOptions = [{ key: "all", name: "All days", n: games.filter(inComp).length }, ...days.map((d) => ({ key: d, name: dayLabel(d), n: games.filter((g) => inComp(g) && g.day === d).length }))];

  return (
    <section className="hm-tile rx-round" aria-labelledby="rx-round-h" ref={box}>
      <div className="rx-sh">
        <h2 id="rx-round-h">{title}</h2>
        {games.length ? (
          <div className="rx-pickers">
            <Picker label="Competition" value={comp} count={`${shown.length} game${shown.length === 1 ? "" : "s"}`} options={compOptions} open={menu === "comp"}
              onToggle={() => setMenu(menu === "comp" ? null : "comp")} onPick={(key) => { setComp(key as Competition | "all"); setMenu(null); }} />
            <Picker label="Day" value={day} count={day === "all" ? `${days.length} day${days.length === 1 ? "" : "s"}` : `${shown.length} game${shown.length === 1 ? "" : "s"}`} options={dayOptions} open={menu === "day"}
              onToggle={() => setMenu(menu === "day" ? null : "day")} onPick={(key) => { setDay(key); setMenu(null); }} />
          </div>
        ) : null}
        {href ? <Link className="rx-more" href={href}>All games ›</Link> : null}
      </div>
      {!shown.length ? (
        <div className="rx-empty" role="status"><b>{games.length ? `No ${comp === "all" ? "" : `${COMPETITIONS[comp]} `}games ${day === "all" ? "this gameweek" : `on ${dayLabel(day)}`}` : "No games this gameweek"}</b>{games.length ? <span>Pick another day or All competitions.</span> : null}</div>
      ) : null}
      {lanes.map((lane) => {
        const n = lane.games.length, wide = n <= 3, cols = { gridTemplateColumns: `repeat(${Math.min(n, 10)}, minmax(0, 1fr))` };
        const runs: { day: string; n: number }[] = [];
        for (const g of lane.games) { const last = runs.at(-1); if (last?.day === g.day) last.n++; else runs.push({ day: g.day, n: 1 }); }
        return (
          <div className="rx-lane" key={lane.comp}>
            {comp === "all" ? <div className="rx-lh"><b>{COMPETITIONS[lane.comp]}</b><span>{n} game{n === 1 ? "" : "s"}</span></div> : null}
            {wide ? (
              <div className="rx-wide" style={cols}>{lane.games.map((g) => <Wide key={g.id} g={g} on={sel?.id === g.id} onPick={() => setPicked(g.id)} />)}</div>
            ) : (
              <>
                {day === "all" && n <= 10 ? <div className="rx-days" style={cols} aria-hidden="true">{runs.map((r) => <div key={r.day} className="rx-day" style={{ gridColumn: `span ${r.n}` }}>{dayLabel(r.day)}</div>)}</div> : null}
                <div className="rx-stubs" style={cols}>{lane.games.map((g, i) => <Stub key={g.id} g={g} index={i} on={sel?.id === g.id} onPick={() => setPicked(g.id)} />)}</div>
              </>
            )}
            {sel && sel.comp === lane.comp ? <Sheet key={sel.id} g={sel} /> : null}
          </div>
        );
      })}
    </section>
  );
}
