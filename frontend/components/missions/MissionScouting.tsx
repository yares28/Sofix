"use client";
import { useState } from "react";
import CardArt from "../cards/CardArt";
import { fit, missionDay, type MissionPlan } from "../../lib/missions";
import type { MissionPool, MissionPlayer } from "../../lib/missionsPool";
import { SOURCE_SHORT } from "../../lib/play";
import { cardCopyLabel, sampleLabel } from "../../lib/missionPresentation";

const percent = (n: number | undefined) => n === undefined ? "No estimate" : `${Math.round(n * 100)}%`;
const kickoff = (s: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(s));
export default function MissionScouting({ plans, players, pool, now, rarity, shortlist, toggle }: { plans: MissionPlan[]; players: MissionPlayer[]; pool: MissionPool | null; now: string; rarity: string; shortlist: string[]; toggle: (s: string) => void }) {
  const [mission, setMission] = useState(plans[0]?.mission.id ?? ""); const [query, setQuery] = useState(""); const [position, setPosition] = useState("");
  const [availability, setAvailability] = useState("editable"); const [sort, setSort] = useState("chance"); const [compared, setCompared] = useState<string[]>([]);
  const one = plans.find((p) => p.mission.id === mission) ?? plans[0];
  if (!one) return <section className="pd-card ms-scout" aria-labelledby="ms-scout-title">
    <h2 id="ms-scout-title">Choose your own picks</h2>
    <p>Load today’s missions to compare your cards against the actual targets.</p>
    <p className="pd-foot">Your saved history is below. Scouting opens when a current mission is available.</p>
  </section>;
  const unique = new Map<string, MissionPlayer>();
  for (const p of players) if (p.rarity === rarity) unique.set(p.card ?? p.player ?? p.name, p);
  const rows = [...unique.entries()].flatMap(([id, p]) => {
    const game = p.games.find((g) => missionDay(new Date(g.kickoff)) === missionDay(new Date(now)));
    if (!game) return [];
    const sheet = pool?.sheets.players[p.player ?? ""];
    const found = one ? fit(one.rule, { ...p, pStart: game.pStart ?? p.pStart, pOn: game.pOn ?? p.pOn }, sheet ?? null) : null;
    const own = plans.some((x) => x.mission.appearances?.some((a) => a.card ? a.card === p.card : a.player === p.player));
    const locked = new Date(game.kickoff) <= new Date(now);
    const eligible = one?.mission.eligibleCards?.[game.id ?? ""];
    const allowed = eligible && p.card ? eligible.includes(p.card) : null;
    const status = p.eligibility ?? (own ? "Already selected" : locked ? "Locked" : allowed === true ? "Eligible on Sorare" : allowed === false ? "Not eligible for this mission" : "Eligibility not checked on Sorare");
    const index = one?.rule.kind === "interception" ? 4 : one?.rule.kind === "assist" ? 5 : one?.rule.kind === "goal" ? 6 : one?.rule.kind === "score" ? 0 : 2;
    const threshold = !one || one.rule.kind === "unsupported" ? undefined : "atLeast" in one.rule ? one.rule.atLeast : one.rule.kind === "score" ? one.mission.thresholds?.[0]?.min : 1;
    const window = (n: number) => { const last = sheet?.last.slice(-n) ?? []; return { n: last.length, mean: last.length && one.rule.kind !== "unsupported" ? last.reduce((s, r) => s + Number(r[index]), 0) / last.length : null,
      hits: threshold === undefined ? null : last.filter((r) => Number(r[index]) >= threshold).length }; };
    return [{ id, p, game, sheet, found: allowed === false ? null : found, own, locked, status, allowed, l5: window(5), l8: window(8) }];
  });
  const filtered = rows.filter(({ p, own, locked, allowed }) => p.name.toLowerCase().includes(query.toLowerCase()) && (!position || p.pos === position) && (!availability || (availability === "editable" ? !locked && !own && !p.eligibility && allowed !== false : availability === "selected" ? own : shortlist.includes(p.card ?? p.player ?? ""))));
  filtered.sort((a, b) => sort === "kickoff" ? a.game.kickoff.localeCompare(b.game.kickoff) : sort === "recent" ? (b.l8.hits ?? -1) / (b.l8.n || 1) - (a.l8.hits ?? -1) / (a.l8.n || 1) : sort === "stat" ? (b.l8.mean ?? -1) - (a.l8.mean ?? -1) : (b.found?.chance ?? -1) - (a.found?.chance ?? -1));
  const stats = (w: { n: number; mean: number | null; hits: number | null }) => w.n ? `${w.hits === null ? "Target history unavailable" : `${w.hits}/${w.n} hit target`}${w.mean === null ? "" : ` · ${w.mean.toFixed(1)} mean`}` : "";
  const recent = (r: typeof rows[number]) => <><span>{sampleLabel(r.l5.n, 5)}{r.l5.n ? `: ${stats(r.l5)}` : ""}</span>{r.l8.n > r.l5.n ? <span>{sampleLabel(r.l8.n, 8)}: {stats(r.l8)}</span> : null}</>;
  const copies = (r: typeof rows[number]) => {
    const available = rows.filter((x) => x.p.player === r.p.player && !x.locked && !x.own && !x.p.eligibility);
    const confirmed = available.filter((x) => x.allowed === true).length;
    const unchecked = available.filter((x) => x.allowed === null).length;
    return `${confirmed} copies confirmed eligible${unchecked ? ` · ${unchecked} not checked on Sorare` : ""}`;
  };
  return <section className="pd-card ms-scout" aria-labelledby="ms-scout-title">
    <h2 id="ms-scout-title">Choose your own picks</h2>
    <p>{one ? one.rule.label : "Load missions to see their targets and compare your cards."}</p>
    <div className="ms-filters">
      <label>Mission<select value={one?.mission.id ?? ""} onChange={(e) => setMission(e.target.value)}><option value="" disabled>Select mission</option>{plans.map((p) => <option key={p.mission.id} value={p.mission.id}>{p.mission.title}</option>)}</select></label>
      <label>Search players<input type="search" name="scout-player" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
      <label>Position<select value={position} onChange={(e) => setPosition(e.target.value)}><option value="">All positions</option>{["GK", "DEF", "MID", "FWD"].map((p) => <option key={p}>{p}</option>)}</select></label>
      <label>Availability<select value={availability} onChange={(e) => setAvailability(e.target.value)}><option value="">All cards</option><option value="editable">Before kickoff</option><option value="selected">Your selections</option><option value="shortlist">Shortlist</option></select></label>
      <label>Sort by<select value={sort} onChange={(e) => setSort(e.target.value)}><option value="chance">Estimated chance</option><option value="recent">Recent target success</option><option value="stat">Relevant stat</option><option value="kickoff">Kickoff</option></select></label>
    </div>
    <p className="ms-evidence">{pool ? `${pool.statsWindow}. Observation cutoff ${kickoff(pool.sheets.asOf)}. ${pool.complete ? "Mission game coverage includes the active GW." : "Game coverage is incomplete."}` : "Live mission evidence is not published yet. Weekly player data is incomplete; no current stat claims are made."} Last 5 / 8 count scored starts, with the sample shown.</p>
    {compared.length ? <div className="ms-compare" aria-label="Player comparison">{rows.filter((r) => compared.includes(r.id)).map((r) => <div key={r.id}><b>{r.p.name}</b><p>{percent(r.found?.chance)} estimated · {percent(r.game.pStart ?? r.p.pStart)} to start</p><div>{recent(r)}</div></div>)}</div> : null}
    <ul className="ms-scout-list">{filtered.map((r) => <li key={r.id}>
      <div className="ms-scout-player"><span className="art" aria-hidden="true"><CardArt src={r.p.pic} name={r.p.name} /></span><div><b>{r.p.name}</b><span>{r.p.pos} · {rarity} · {cardCopyLabel(r.p.card)}</span><span>{r.game.team ?? "Playing side not supplied"} {r.game.venue === "H" ? "v" : "at"} {r.game.opponent} · {kickoff(r.game.kickoff)}</span><span>{r.game.competition} · {r.status}</span></div></div>
      <div><strong>{percent(r.found?.chance)}</strong><span>Estimated mission chance</span><span>{r.game.ffMatch && r.game.startSource === "futbolfantasy" ? <a href={r.game.ffMatch.url} target="_blank" rel="noreferrer">Start: {percent(r.game.pStart ?? r.p.pStart)} · FF</a> : <>Start: {percent(r.game.pStart ?? r.p.pStart)} · {SOURCE_SHORT[r.game.startSource ?? r.p.startSource ?? "sofix"]}{!r.game.startSource && !r.p.startSource ? " (source unavailable)" : ""}</>}</span><span>{copies(r)}</span>{r.game.ffStatus?.kind ? <span>{r.game.ffStatus.kind}{r.game.ffStatus.note ? ` · ${r.game.ffStatus.note}` : ""}</span> : null}</div>
      <div>{recent(r)}<span>Baseline: {r.sheet?.starts ?? 0} scored starts{r.sheet ? ` · ${Math.round(r.sheet.decAll * 100)}% decisive` : ""}</span></div>
      <div className="ms-scout-actions"><label><input type="checkbox" checked={compared.includes(r.id)} disabled={!compared.includes(r.id) && compared.length >= 3} onChange={() => setCompared(compared.includes(r.id) ? compared.filter((s) => s !== r.id) : [...compared, r.id])} />Compare {r.p.name}</label><button type="button" disabled={r.locked || r.own || Boolean(r.p.eligibility) || r.allowed === false} aria-pressed={shortlist.includes(r.id)} onClick={() => toggle(r.id)}>{shortlist.includes(r.id) ? "Remove from shortlist" : "Shortlist"}</button>{plans.some((p) => p.picks.some((s) => s.slug === r.p.player)) ? <span>Sofix suggested</span> : null}</div>
    </li>)}</ul>
    {!filtered.length ? <p className="pd-none">No cards found with these filters. Choose All cards to include locked or unavailable copies. This does not confirm you have no eligible cards on Sorare.</p> : null}
    <p className="pd-foot">Compare up to three. Shortlisting reserves a player locally while recalculating suggestions; nothing is entered on Sorare. Decisive estimates include availability; other stat estimates use a Poisson rate adjusted for playing chance. Score targets have no probability estimate. <a href={`https://sorare.com/football/play/missions/play/${rarity}`} target="_blank" rel="noreferrer">Make your picks on Sorare ↗</a></p>
  </section>;
}
