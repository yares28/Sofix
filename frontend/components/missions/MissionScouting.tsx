"use client";
import { useState } from "react";
import Link from "next/link";
import MissionFormEvidence from "./MissionFormEvidence";
import type { LogCand } from "../../lib/missionLog";
import CardArt from "../cards/CardArt";
import { fit, missionCandidates, missionValues, missionChance, type MissionPlan } from "../../lib/missions";
import type { MissionPool, MissionPlayer } from "../../lib/missionsPool";
import { SOURCE_SHORT } from "../../lib/play";
import { cardCopyLabel } from "../../lib/missionPresentation";

const percent = missionChance;
const kickoff = (s: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(s));
export default function MissionScouting({ plans, players, pool, now, rarity, shortlist, toggle, captured }: { plans: MissionPlan[]; players: MissionPlayer[]; pool: MissionPool | null; now: string; rarity: string; captured: LogCand[]; shortlist: string[]; toggle: (s: string) => void }) {
  const [mission, setMission] = useState(plans[0]?.mission.id ?? ""); const [query, setQuery] = useState(""); const [position, setPosition] = useState("");
  const [availability, setAvailability] = useState(""); const [sort, setSort] = useState("chance"); const [compared, setCompared] = useState<string[]>([]);
  const one = plans.find((p) => p.mission.id === mission) ?? plans[0];
  if (!one) return <section className="pd-card ms-scout" aria-labelledby="ms-scout-title">
    <h2 id="ms-scout-title">Choose your own picks</h2>
    <p>Load today’s missions to compare your cards against the actual targets.</p>
    <p className="pd-foot">Your saved history is below. Scouting opens when a current mission is available.</p>
  </section>;
  const candidates = missionCandidates(one.mission, rarity, players, new Date(now), plans.flatMap((x) => x.mission.appearances ?? []));
  const unique = new Map<string, typeof candidates[number]>();
  for (const c of candidates) {
    const id = c.p.card ?? c.p.player!;
    if (!unique.has(id) || (!unique.get(id)!.editable && c.editable)) unique.set(id, c);
  }
  const rows = [...unique.entries()].flatMap(([id, { p, game: currentGame, own, locked, allowed, status, editable }]) => {
    const saved = locked ? captured.find((c) => c.s === p.player && c.g === currentGame.id && (!p.card || c.card === p.card) && !c.late) : undefined;
    const game = locked ? { ...currentGame, pStart: undefined, pOn: undefined, startSource: undefined, ffMatch: undefined, availabilityKnown: false, ...saved?.match } : currentGame;
    const sheet = locked ? saved?.sheet : pool?.sheets.players[p.player ?? ""];
    const target = locked ? saved?.targets?.[one.mission.id] ?? saved?.evidence?.[one.mission.id]?.target : one.mission.inventory?.find((c) => c.card === p.card && c.game.id === game.id)?.target;
    const found = locked ? saved?.evidence?.[one.mission.id] ?? (saved?.c[one.mission.id] !== undefined ? { chance: saved.c[one.mission.id]!, historical: saved.historyOnly?.includes(one.mission.id) } : null) : fit(one.rule, { ...p, availabilityKnown: game.availabilityKnown ?? p.availabilityKnown, pStart: game.pStart ?? p.pStart, pOn: game.pOn ?? p.pOn }, sheet ?? null, target);
    const threshold = one.rule.kind === "unsupported" ? undefined : "atLeast" in one.rule ? one.rule.atLeast : one.rule.kind === "score" ? target : 1;
    const window = (n: number) => { const last = missionValues(one.rule, sheet).slice(-n); return { n: last.length, mean: last.length ? last.reduce((s, v) => s + v, 0) / last.length : null,
      hits: threshold === undefined ? null : last.filter((v) => v >= threshold).length }; };
    return [{ id, p, game, target, sheet, found: allowed === false ? null : found, own, locked, status, allowed, editable, l5: window(5), l8: window(10) }];
  });
  const filtered = rows.filter(({ p, own, editable }) => p.name.toLowerCase().includes(query.toLowerCase()) && (!position || p.pos === position) && (!availability || (availability === "editable" ? editable : availability === "selected" ? own : shortlist.includes(p.card ?? p.player ?? ""))));
  filtered.sort((a, b) => sort === "kickoff" ? a.game.kickoff.localeCompare(b.game.kickoff) : sort === "recent" ? (b.l8.hits ?? -1) / (b.l8.n || 1) - (a.l8.hits ?? -1) / (a.l8.n || 1) : sort === "stat" ? (b.l8.mean ?? -1) - (a.l8.mean ?? -1) : (b.found?.chance ?? -1) - (a.found?.chance ?? -1));
  const recent = (r: typeof rows[number], all = false) => <MissionFormEvidence form={r.sheet?.form} rule={one.rule} target={r.target} all={all} />;
  const copies = (r: typeof rows[number]) => {
    const available = rows.filter((x) => x.p.player === r.p.player && x.editable);
    const confirmed = available.filter((x) => x.allowed === true).length;
    const unchecked = available.filter((x) => x.allowed === null).length;
    return `${confirmed} copies confirmed eligible${unchecked ? ` · ${unchecked} not checked on Sorare` : ""}`;
  };
  return <section className="pd-card ms-scout" id="mission-scouting" aria-labelledby="ms-scout-title">
    <h2 id="ms-scout-title">Choose your own picks</h2>
    <p>{one ? one.rule.label : "Load missions to see their targets and compare your cards."}</p>
    <div className="ms-filters">
      <label>Mission<select value={one?.mission.id ?? ""} onChange={(e) => setMission(e.target.value)}><option value="" disabled>Select mission</option>{plans.map((p) => <option key={p.mission.id} value={p.mission.id}>{p.mission.title}</option>)}</select></label>
      <label>Search players<input type="search" name="scout-player" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
      <label>Position<select value={position} onChange={(e) => setPosition(e.target.value)}><option value="">All positions</option>{["GK", "DEF", "MID", "FWD"].map((p) => <option key={p}>{p}</option>)}</select></label>
      <label>Availability<select value={availability} onChange={(e) => setAvailability(e.target.value)}><option value="">All cards</option><option value="editable">Before kickoff</option><option value="selected">Your selections</option><option value="shortlist">Shortlist</option></select></label>
      <label>Sort by<select value={sort} onChange={(e) => setSort(e.target.value)}><option value="chance">Estimated chance</option><option value="recent">Recent target success</option><option value="stat">Relevant stat</option><option value="kickoff">Kickoff</option></select></label>
    </div>
    {!pool?.complete || one.mission.eligibilityComplete === false ? <p className="ms-evidence">Coverage is incomplete. Load missions to check the latest eligible cards.</p> : null}
    {compared.length ? <div className="ms-compare" aria-label="Player comparison">{rows.filter((r) => compared.includes(r.id)).map((r) => <div key={r.id}><b><Link href={`/players/${r.p.player}`}>{r.p.name}</Link></b><p>{percent(r.found?.chance)} {r.found?.historical ? "recent hits" : "estimated"}{r.game.availabilityKnown !== false ? ` · ${percent(r.game.pStart ?? r.p.pStart)} to start` : ""}</p><div>{recent(r)}</div></div>)}</div> : null}
    <ul className="ms-scout-list">{filtered.map((r) => <li key={r.id}>
      <div className="ms-scout-player"><Link className="art" href={`/players/${r.p.player}`} aria-label={`Open ${r.p.name} profile`}><CardArt src={r.p.pic} name={r.p.name} /></Link><div><b>{r.p.name}</b><span>{r.p.pos} · {rarity} · {cardCopyLabel(r.p.card)}</span><span>{r.game.team ?? "Playing side not supplied"} {r.game.venue === "H" ? "v" : "at"} {r.game.opponent} · {kickoff(r.game.kickoff)}</span><span>{r.game.competition} · {r.status}</span></div></div>
      <div><strong>{percent(r.found?.chance)}</strong><span>{r.found?.historical ? "Recent target hit rate" : "Estimated mission chance"}</span>{r.game.availabilityKnown !== false ? <span>{r.game.ffMatch && r.game.startSource === "futbolfantasy" ? <a href={r.game.ffMatch.url} target="_blank" rel="noreferrer">Start: {percent(r.game.pStart ?? r.p.pStart)} · FF</a> : <>Start: {percent(r.game.pStart ?? r.p.pStart)} · {SOURCE_SHORT[r.game.startSource ?? r.p.startSource ?? "sofix"]}</>}</span> : null}<span>{copies(r)}</span>{r.game.ffStatus?.kind ? <span>{r.game.ffStatus.kind}{r.game.ffStatus.note ? ` · ${r.game.ffStatus.note}` : ""}</span> : null}</div>
      <div>{recent(r, true)}</div>
      <div className="ms-scout-actions"><label><input type="checkbox" checked={compared.includes(r.id)} disabled={!compared.includes(r.id) && compared.length >= 3} onChange={() => setCompared(compared.includes(r.id) ? compared.filter((s) => s !== r.id) : [...compared, r.id])} />Compare {r.p.name}</label><button type="button" disabled={!r.editable} aria-pressed={shortlist.includes(r.id)} onClick={() => toggle(r.id)}>{shortlist.includes(r.id) ? "Remove from shortlist" : "Shortlist"}</button>{plans.some((p) => p.picks.some((s) => s.card ? s.card === r.p.card : s.slug === r.p.player)) ? <span>Sofix suggested</span> : null}</div>
    </li>)}</ul>
    {!filtered.length ? <p className="pd-none">No cards found with these filters. Choose All cards or reload missions.</p> : null}
    <details className="pd-foot"><summary>About these estimates</summary><p>{pool?.statsWindow ?? "Scored starts"}. Last 5 / 10 use appearances before the mission day, including substitutes. Starts/subs use this season; DNPs are separate. Estimates weight recent starter and substitute rates by playing chance, falling back to that season’s role average. Count targets use a Poisson rate; score targets and unknown playing chances show recent target hits. These are heuristics, not calibrated probabilities. Your shortlist does not change Sofix’s picks.</p></details>
    <p className="pd-foot"><a href={`https://sorare.com/football/play/missions/play/${rarity}`} target="_blank" rel="noreferrer">Make your picks on Sorare ↗</a></p>
  </section>;
}
