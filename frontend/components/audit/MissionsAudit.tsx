"use client";

import { useSyncExternalStore } from "react";
import type { Missions } from "../../lib/audit";
import { auditMissionRows, MISSION_STATE } from "../../lib/missionAudit";
import { RARITY_NAME } from "../../lib/missions";
import type { MissionOutcome } from "../../lib/missionOutcomes";
import MissionOutcomeCharts from "./MissionOutcomeCharts";

const subscribe = (listener: () => void) => {
  window.addEventListener("popstate", listener);
  window.addEventListener("mission-filter", listener);
  return () => { window.removeEventListener("popstate", listener); window.removeEventListener("mission-filter", listener); };
};
const snapshot = () => window.location.search;
const date = (day: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));

export default function MissionOverview({ missions, outcomes = [], initialFilters = "" }: { missions: Missions; outcomes?: MissionOutcome[]; initialFilters?: string }) {
  const query = useSyncExternalStore(subscribe, snapshot, () => initialFilters);
  const params = new URLSearchParams(query);
  const all = auditMissionRows(missions);
  const rarity = params.get("mr") ?? "all";
  const rows = all.filter(r => rarity === "all" || r.rarity === rarity);
  const state = params.get("ms") ?? "all";
  const filtered = rows.filter(r => state === "all" || r.state === state);
  const pages = Math.max(1, Math.ceil(filtered.length / 12));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(params.get("mp"))) || 1));
  const choose = (values: Record<string, string>) => {
    const url = new URL(window.location.href);
    for (const [k, v] of Object.entries(values)) if (v === "all" || v === "1") url.searchParams.delete(k); else url.searchParams.set(k, v);
    window.history.replaceState(null, "", url);
    window.dispatchEvent(new Event("mission-filter"));
  };
  return <div className="ma-overview">
    <div className="ma-toolbar"><label>Cards<select autoComplete="off" name="mission-rarity" value={rarity} onChange={e => choose({ mr: e.target.value, mp: "1", me: "1", mt: "all" })}><option value="all">All rarities</option>{[...new Set([...all.map(r => r.rarity), ...outcomes.map(r => r.rarity)])].map(r => <option key={r} value={r}>{RARITY_NAME[r] ?? r}</option>)}</select></label></div>
    <MissionOutcomeCharts rows={outcomes.filter(r => rarity === "all" || r.rarity === rarity)} target={params.get("mt") ?? ""} evidencePage={Math.max(1, Math.floor(Number(params.get("me"))) || 1)} choose={choose} />
    <details className="ma-forecast-coverage" open={state !== "all"}><summary>Forecast coverage · {rows.length} saved missions</summary>
    <section className="ma-coverage" aria-labelledby="ma-coverage-title"><div className="ma-section-head"><h2 id="ma-coverage-title">Every saved mission</h2><span>{rows.length} total</span></div>
      <div className="ma-coverage-strip" aria-hidden="true">{Object.keys(MISSION_STATE).map((stateKey, i) => <span key={stateKey} style={{ flexGrow: rows.filter(r => r.state === stateKey).length, background: `var(--ma-state-${i})` }}/>)}</div>
      <div className="ma-coverage-options" role="group" aria-label="Mission result status"><button type="button" aria-pressed={state === "all"} onClick={() => choose({ ms: "all", mp: "1" })}>All <b>{rows.length}</b></button>{Object.entries(MISSION_STATE).map(([key, label]) => { const n = rows.filter(r => r.state === key).length; return n ? <button key={key} type="button" aria-pressed={state === key} onClick={() => choose({ ms: key, mp: "1" })}>{label} <b>{n}</b></button> : null; })}</div>
      <ol className="ma-records">{filtered.slice((page - 1) * 12, page * 12).map(r => <li key={r.id}><div><span className="ma-record-date">{date(r.day)} · {RARITY_NAME[r.rarity] ?? r.rarity}</span><h3>{r.mission}</h3><span className={`ma-status ma-status-${r.state}`}>{MISSION_STATE[r.state]}{r.replay ? " · reconstruction available in history" : ""}{r.corrected ? " · corrected by you" : ""}</span></div><dl><div><dt>You</dt><dd>{r.yours ?? "—"}</dd></div><div><dt>Sofix</dt><dd>{r.sofix ?? "—"}</dd></div><div><dt>Best</dt><dd>{r.best ?? "—"}</dd></div></dl></li>)}</ol>
      {!filtered.length ? <p className="ma-caption">No saved missions in this selection.</p> : null}
      {pages > 1 ? <nav className="ma-pagination" aria-label="Mission records pages"><button type="button" disabled={page <= 1} onClick={() => choose({ mp: String(page - 1) })}>Previous</button><span>Page {page} of {pages}</span><button type="button" disabled={page >= pages} onClick={() => choose({ mp: String(page + 1) })}>Next</button></nav> : null}
      {!missions.overview ? <p className="ma-caption">Expanded coverage appears after the next automatic refresh. {missions.pending} comparisons pending · {missions.nobody} with no opportunity in the current record.</p> : null}
    </section>
    </details>
    <details className="ma-method"><summary>What counts, and when it updates</summary><p>Existing score checks, daily history and scheduled refreshes settle missions from saved game results automatically. You can close the browser. Missing results wait; later stat corrections update the figures. Nothing needs 100 cases.</p><p>A mission is hit when at least one selected player succeeds. Each side uses its own checked selections, as in history; the race compares only shared missions. Knowing all eligible cards is required for the best-available audit, but not for checking a selected player. Pending and void picks stay separate. Imported verdicts and corrections take precedence; reconstructions are labelled.</p><p>Rewards use explicit per-choice terms and the full-house bonus when every slot succeeds. XP, each clue type and essence stay separate, including rarity. Best available is a per-mission ceiling, not a single card allocation across all missions.</p></details>
  </div>;
}
