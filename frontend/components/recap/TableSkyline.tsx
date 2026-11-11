"use client";

import { useState, type CSSProperties } from "react";
import Link from "../FootballLink";
import Crest from "../Crest";
import type { SkyRow } from "../../lib/recap";

/**
 * The table as a skyline (plans/recap-matchnight.md, step 4): one bar per club, as tall as its points, in the colour of the
 * European place it holds (UEFA's own: Champions League #00004b, Europa League #ff6900, Conference League #01b223, from their
 * logo files), places moved in the round above, the next game's FDR below. After the selected round, or the table now.
 */
export default function TableSkyline({ after, now, round, latest, href }: { after: SkyRow[]; now: SkyRow[] | null; round: number; latest: number | null; href?: string }) {
  const [view, setView] = useState<"after" | "now">("after");
  const rows = view === "now" && now ? now : after;
  const top = Math.max(1, ...rows.map((r) => r.points));
  return (
    <section className="hm-tile rx-sky" aria-labelledby="rx-sky-h">
      <div className="rx-sh">
        <h2 id="rx-sky-h">{view === "now" ? "Table now" : `Table after round ${round}`}</h2>
        {now ? (
          <div className="rx-seg" role="group" aria-label="Which table">
            <button type="button" aria-pressed={view === "after"} className={view === "after" ? "on" : undefined} onClick={() => setView("after")}>After round {round}</button>
            <button type="button" aria-pressed={view === "now"} className={view === "now" ? "on" : undefined} onClick={() => setView("now")}>Now</button>
          </div>
        ) : null}
        {view === "now" && latest !== null ? <span className="rx-meta">Latest round played: {latest}</span> : null}
        {href ? <Link className="rx-more" href={href}>Season ›</Link> : null}
      </div>
      <ol className="rx-cols" style={{ "--n": rows.length } as CSSProperties}>
        {rows.map((row, i) => (
          <li key={row.team.code} className="rx-col" title={`${row.position}. ${row.team.name}, ${row.points} points${row.moved ? `, ${row.moved > 0 ? "up" : "down"} ${Math.abs(row.moved)}` : ""}`}>
            <span className={`rx-mv${row.moved > 0 ? " up" : row.moved < 0 ? " dn" : ""}`} aria-label={row.moved ? `${row.moved > 0 ? "Up" : "Down"} ${Math.abs(row.moved)}` : "No change"}>
              {row.moved > 0 ? `▲${row.moved}` : row.moved < 0 ? `▼${-row.moved}` : "·"}
            </span>
            <span className={`rx-bar ${row.zone ?? "zone-mid"}`} style={{ height: `${Math.round(84 + (row.points / top) * 176)}px`, animationDelay: `${i * 30}ms` }}>
              <span className="rx-crest"><Crest team={{ code: row.team.code, color: row.team.color ?? "#8e8e93", crest_url: row.team.crest }} size={28} /></span>
              <b>{Number.isInteger(row.points) ? row.points : row.points.toFixed(1)}</b>
              <span className="visually-hidden">{row.team.name}, place {row.position}</span>
            </span>
            <span className="rx-pos" aria-hidden="true">{row.position}</span>
            {row.next ? (
              <span className={`difficulty-chip rx-fdr${row.next.bucket ? ` f${row.next.bucket}` : ""}`} title={`Next: ${row.next.label}${row.next.value === null ? "" : ` · FDR ${Math.round(row.next.value)} of 100 (lower is easier)`}`}>
                {row.next.value === null ? "—" : Math.round(row.next.value)}
              </span>
            ) : <span className="rx-fdr none">—</span>}
          </li>
        ))}
      </ol>
      <p className="rx-zones">
        <span><i className="zone-ucl" />Champions League</span><span><i className="zone-uel" />Europa League</span><span><i className="zone-uecl" />Conference League play-off</span><span><i className="zone-rel" />Relegation</span>
        <span className="rx-zones-r">▲▼ places moved in the round · next game&rsquo;s FDR under each club</span>
      </p>
    </section>
  );
}
