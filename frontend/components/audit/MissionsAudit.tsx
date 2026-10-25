"use client";

import { useSyncExternalStore } from "react";
import type { Missions } from "../../lib/audit";
import { auditMissionRows, MISSION_STATE, missionSummary, type MissionAuditRow } from "../../lib/missionAudit";
import { RARITY_NAME } from "../../lib/missions";

const subscribe = (listener: () => void) => {
  window.addEventListener("popstate", listener);
  window.addEventListener("mission-filter", listener);
  return () => { window.removeEventListener("popstate", listener); window.removeEventListener("mission-filter", listener); };
};
const snapshot = () => window.location.search;
const serverSnapshot = () => "";
const number = (n: number) => new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 }).format(n);
const date = (day: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));

function Comparison({ rows, mode }: { rows: MissionAuditRow[]; mode: "paired" | "sofix" }) {
  const s = missionSummary(rows, mode);
  const sides = [{ key: "you", label: "You", hits: s.yours }, { key: "sofix", label: "Sofix", hits: s.sofix }, { key: "best", label: "Best available", hits: s.best }];
  const difference = s.yours == null ? null : s.yours - s.sofix;
  const gap = s.best - s.sofix;
  const title = !s.cases ? "Waiting for a fair comparison" : !s.best ? "No successful picks were available" : difference == null ? `${number(gap)} successful picks left out` : difference === 0 ? "You and Sofix are level" : `${difference > 0 ? "You" : "Sofix"} found ${number(Math.abs(difference))} more successful ${Math.abs(difference) === 1 ? "pick" : "picks"}`;
  return <section className="ma-comparison" aria-labelledby="ma-comparison-title">
    <div className="ma-result"><span className="au-label">Successful picks</span><h2 id="ma-comparison-title" aria-live="polite">{title}</h2><p>{s.cases ? `${s.cases} same checked ${s.cases === 1 ? "mission" : "missions"}${mode === "paired" ? " for all three" : " · saved Sofix forecasts"}` : "Saved forecasts join the chart when their results are checked."}</p></div>
    <figure className="ma-chart" aria-label="Successful picks compared with the best available">
      <div className="ma-axis" aria-hidden="true"><span>0</span><span>{number(s.best)} possible</span></div>
      {sides.map(side => <div className={`ma-chart-row ma-${side.key}`} key={side.key} role="img" aria-label={`${side.label}: ${side.hits == null || !s.cases ? "not compared" : `${number(side.hits)} of ${number(s.best)} possible successful picks across ${s.cases} missions`}`}>
        <span className="ma-side">{side.label}<small>{side.hits != null && s.cases ? `${number(side.hits / s.cases)} per mission` : "Not compared"}</small></span>
        <div className="ma-track" aria-hidden="true">{s.cases && side.hits != null ? <><span className="ma-distance" style={{ transform: `scaleX(${s.best ? side.hits / s.best : 0})` }}/><i className="ma-dot" style={{ left: `${s.best ? side.hits / s.best * 100 : 0}%` }}/></> : <span className="ma-missing">—</span>}</div>
        <strong>{s.cases && side.hits != null ? number(side.hits) : "—"}<small>{s.best > 0 && side.hits != null ? `${Math.round(side.hits / s.best * 100)}% of best` : "successful picks"}</small></strong>
      </div>)}
      <figcaption>Best available = successful eligible players, capped at each mission’s slots. Cards can repeat across missions.</figcaption>
    </figure>
    {s.cases > 0 ? <p className="ma-takeaway">{s.best ? <>Sofix missed <b>{number(gap)} of {number(s.best)}</b> available successes{s.yours != null ? <>; you missed <b>{number(Math.max(0, s.best - s.yours))}</b></> : null}. </> : null}{s.opportunities ? <>Best possible matched on <b>{s.perfect.sofix}/{s.opportunities}</b> missions for Sofix{s.yours != null ? <>, <b>{s.perfect.yours}/{s.opportunities}</b> for you</> : null}.</> : "No opportunity in these missions."}</p> : null}
    <section className="ma-rewards" aria-labelledby="ma-reward-title"><h3 id="ma-reward-title">Rewards from these outcomes</h3>
      {s.rewards.length ? <><p className="ma-caption">Calculated from saved terms · potential rewards, not confirmed receipts</p><div className="ma-reward-head" aria-hidden="true"><span>Reward</span><span>You</span><span>Sofix</span><span>Best available</span></div>{s.rewards.map(r => <div className="ma-reward-row" key={`${r.rarity}:${r.unit}`}><span><b>{r.unit}</b><small>{RARITY_NAME[r.rarity] ?? r.rarity} · {r.cases} {r.cases === 1 ? "mission" : "missions"}</small></span><span aria-label={`You: ${r.yours == null ? "not compared" : number(r.yours)} ${r.unit}`}>{r.yours == null ? "—" : number(r.yours)}</span><span aria-label={`Sofix: ${number(r.sofix)} ${r.unit}`}>{number(r.sofix)}</span><span aria-label={`Best available: ${number(r.best)} ${r.unit}`}>{number(r.best)}</span></div>)}</> : <p className="ma-caption">{s.cases ? "No explicit per-pick reward terms saved for these missions. Rewards remain unknown." : "Rewards appear with checked missions and saved reward terms."}</p>}
      {s.rewards.length && s.rewardUnknown ? <p className="ma-caption">{s.rewardUnknown} other missions have no usable reward terms.</p> : null}
    </section>
  </section>;
}

export default function MissionOverview({ missions }: { missions: Missions }) {
  const query = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const params = new URLSearchParams(query);
  const all = auditMissionRows(missions);
  const rarity = params.get("mr") ?? "all";
  const rows = all.filter(r => rarity === "all" || r.rarity === rarity);
  const paired = rows.filter(r => r.state === "checked" && r.yours != null && r.best != null).length;
  const mode = params.get("mc") === "sofix" ? "sofix" : params.get("mc") === "paired" || paired ? "paired" : "sofix";
  const state = params.get("ms") ?? "all";
  const filtered = rows.filter(r => state === "all" || r.state === state);
  const pages = Math.max(1, Math.ceil(filtered.length / 12));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(params.get("mp"))) || 1));
  const s = missionSummary(rows, mode);
  const choose = (values: Record<string, string>) => {
    const url = new URL(window.location.href);
    for (const [k, v] of Object.entries(values)) if (v === "all" || v === "1") url.searchParams.delete(k); else url.searchParams.set(k, v);
    window.history.replaceState(null, "", url);
    window.dispatchEvent(new Event("mission-filter"));
  };
  return <div className="ma-overview">
    <div className="ma-toolbar"><label>Cards<select name="mission-rarity" value={rarity} onChange={e => choose({ mr: e.target.value, mp: "1" })}><option value="all">All rarities</option>{[...new Set(all.map(r => r.rarity))].map(r => <option key={r} value={r}>{RARITY_NAME[r] ?? r}</option>)}</select></label><div className="mx-seg" role="group" aria-label="Mission comparison"><button type="button" aria-pressed={mode === "paired"} onClick={() => choose({ mc: "paired" })}>You vs Sofix</button><button type="button" aria-pressed={mode === "sofix"} onClick={() => choose({ mc: "sofix" })}>All Sofix forecasts</button></div></div>
    <Comparison rows={rows} mode={mode} />
    <p className="ma-own-record">Your complete saved record: <b>{s.own.hits} successful picks</b> across <b>{s.own.cases} checked missions</b>, including missions without a Sofix forecast. {rows.filter(r => r.yours == null).length} have unknown or unfinished own choices.</p>
    <section className="ma-coverage" aria-labelledby="ma-coverage-title"><div className="ma-section-head"><h2 id="ma-coverage-title">Every saved mission</h2><span>{rows.length} total</span></div>
      <div className="ma-coverage-strip" aria-hidden="true">{Object.keys(MISSION_STATE).map((stateKey, i) => <span key={stateKey} style={{ flexGrow: rows.filter(r => r.state === stateKey).length, background: `var(--ma-state-${i})` }}/>)}</div>
      <div className="ma-coverage-options" role="group" aria-label="Mission result status"><button type="button" aria-pressed={state === "all"} onClick={() => choose({ ms: "all", mp: "1" })}>All <b>{rows.length}</b></button>{Object.entries(MISSION_STATE).map(([key, label]) => { const n = rows.filter(r => r.state === key).length; return n ? <button key={key} type="button" aria-pressed={state === key} onClick={() => choose({ ms: key, mp: "1" })}>{label} <b>{n}</b></button> : null; })}</div>
      <ol className="ma-records">{filtered.slice((page - 1) * 12, page * 12).map(r => <li key={r.id}><div><span className="ma-record-date">{date(r.day)} · {RARITY_NAME[r.rarity] ?? r.rarity}</span><h3>{r.mission}</h3><span className={`ma-status ma-status-${r.state}`}>{MISSION_STATE[r.state]}{r.replay ? " · reconstruction available in history" : ""}{r.corrected ? " · corrected by you" : ""}</span></div><dl><div><dt>You</dt><dd>{r.yours ?? "—"}</dd></div><div><dt>Sofix</dt><dd>{r.sofix ?? "—"}</dd></div><div><dt>Best</dt><dd>{r.best ?? "—"}</dd></div></dl></li>)}</ol>
      {!filtered.length ? <p className="ma-caption">No saved missions in this selection.</p> : null}
      {pages > 1 ? <nav className="ma-pagination" aria-label="Mission records pages"><button type="button" disabled={page <= 1} onClick={() => choose({ mp: String(page - 1) })}>Previous</button><span>Page {page} of {pages}</span><button type="button" disabled={page >= pages} onClick={() => choose({ mp: String(page + 1) })}>Next</button></nav> : null}
      {!missions.overview ? <p className="ma-caption">Expanded coverage appears after the next automatic refresh. {missions.pending} comparisons pending · {missions.nobody} with no opportunity in the current record.</p> : null}
    </section>
    <details className="ma-method"><summary>What counts, and when it updates</summary><p>Existing score checks, daily history and scheduled refreshes settle missions from saved game results automatically. You can close the browser. Missing results wait; later stat corrections update the figures. Nothing needs 100 cases.</p><p>The chart compares the same checked missions. Zero means a known result; a dash means unknown or not compared. Your imported verdicts and saved corrections count independently. Reconstructed forecasts and incomplete eligible-card lists are excluded from accuracy. Missions with no available success stay visible and leave only the best-possible rate.</p><p>Rewards use explicit per-choice terms and the full-house bonus when every slot succeeds. XP, each clue type and essence stay separate, including rarity. Best available is a per-mission ceiling, not a single card allocation across all missions.</p></details>
  </div>;
}
