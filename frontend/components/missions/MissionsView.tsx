"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { freshLabel } from "../../lib/fresh";
import { missionCandidates, RARITY_NAME, type MissionPlan, type MissionRow } from "../../lib/missions";
import type { MissionsStatus } from "../../lib/missionsToday";
import type { HistoryDay, LogCand } from "../../lib/missionLog";
import type { CollectionCard } from "../../lib/play";
import type { MissionPlayer, MissionPool } from "../../lib/missionsPool";
import LoadMissions from "./LoadMissions";
import MissionHistory from "./MissionHistory";
import MissionScouting from "./MissionScouting";
import CardArt from "../cards/CardArt";
import { missionWindow } from "../../lib/missionPresentation";
import MissionFormEvidence from "./MissionFormEvidence";

const time = (s: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(s));
export default function MissionsView({ rarity, tabs, day, plans: original, bestPlans, captured, bestHistory, status, seenAt, retained = [], missionDay, now, history, players, pool, collection }: {
  bestPlans: MissionPlan[]; bestHistory: HistoryDay[]; captured: LogCand[];
  rarity: string; tabs: string[]; day: string | null; plans: MissionPlan[]; status: MissionsStatus; seenAt: string | null; missionDay: string; now: string; history: HistoryDay[];
  players: MissionPlayer[]; pool: MissionPool | null; collection: CollectionCard[];
  retained?: MissionRow[];
}) {
  const [shortlist, setShortlist] = useState<string[]>([]);
  const [mode, setMode] = useState<"best" | "plan">("plan");
  const key = `sofix:mission-shortlist:${missionDay}:${rarity}:${original.map((p) => p.mission.id).sort().join(",")}`;
  useEffect(() => { try { const saved: unknown = JSON.parse(localStorage.getItem(key) ?? "[]"); setShortlist(Array.isArray(saved) ? saved.filter((s): s is string => typeof s === "string") : []); } catch { setShortlist([]); } }, [key]);
  const toggle = (s: string) => { const next = shortlist.includes(s) ? shortlist.filter((x) => x !== s) : [...shortlist, s]; setShortlist(next); try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* session-only */ } };
  const plans = mode === "best" ? bestPlans : original;
  const today = status === "today";
  const candidates = original.flatMap((p) => missionCandidates(p.mission, rarity, players, new Date(now), original.flatMap((p) => p.mission.appearances ?? []))).filter((c) => c.editable);
  const available = [...new Map(candidates.map((c) => [c.p.player, c.p])).values()];
  const partial = original.some((p) => p.mission.eligibilityComplete !== true);
  const made = plans.reduce((n, p) => n + p.mission.made, 0), open = plans.reduce((n, p) => n + p.open, 0);
  const window = missionWindow(new Date(now));
  const lock = players.filter((p) => p.rarity === rarity).flatMap((p) => p.games.map((g) => g.kickoff)).filter((k) => new Date(k) > new Date(now) && new Date(k) >= new Date(window.start) && new Date(k) < new Date(window.end)).sort((a, b) => Date.parse(a) - Date.parse(b))[0];
  return <div className="pd-wrap" data-testid="missions-page">
    <section className="pd-card ms-overview" aria-label="Missions overview">
    <div className="ms-head"><div><h1 className="ms-h1">Daily missions</h1><p className="ms-day">Mission day {day ?? missionDay}</p></div>
      <nav className="pd-pick" aria-label="Rarity">{tabs.map((r) => <Link key={r} href={`/missions?rarity=${r}`} aria-current={r === rarity ? "page" : undefined}>{RARITY_NAME[r] ?? r}</Link>)}</nav>
    </div>
    <div className="ms-summary"><span><b>{today ? plans.length : "-"}</b> missions loaded</span><span><b>{today ? made : "-"}</b> your picks</span><span><b>{today ? open : "-"}</b> open slots</span><span><b>{today ? available.length || (partial ? "—" : 0) : "-"}</b> available players{today && partial ? " · partial check" : ""}</span></div>
    {today && available.length ? <div className="ms-available">{available.slice(0, 8).map((p) => <Link key={p.player} href={`/players/${p.player}`} aria-label={`Open ${p.name} profile`}><span className="art"><CardArt src={p.pic} name={p.name} /></span><span>{p.name}</span></Link>)}{available.length > 8 ? <b>+{available.length - 8}</b> : null}<a href="#mission-scouting">View available players</a></div> : null}
    {lock ? <p className="ms-day">Next kickoff: {time(lock)}</p> : null}
    <details className="ms-window"><summary>Mission window</summary><p>Fallback game window: {time(window.start)} → {time(window.end)} (Madrid). Sorare eligibility takes precedence; its reset time still needs verification.</p></details>
    <LoadMissions stale={!today} day={missionDay} />
    {!today ? <p className="ms-stale" role="status">Today&rsquo;s missions aren&rsquo;t loaded yet.{seenAt ? ` Last loaded ${time(seenAt)}. The last read does not confirm today's mission list.` : ""}</p> : null}
    </section>
    {!today && retained.length ? <details className="pd-card"><summary>Last saved mission list{seenAt ? ` · ${time(seenAt)}` : ""}</summary><ul>{retained.map((m) => <li key={m.id}><b>{m.title}</b> — {m.description}<p>{m.appearances?.length ? `Imported selections: ${m.appearances.map((p) => p.player.replaceAll("-", " ")).join(", ")}` : "No selections confirmed in this saved list."}</p></li>)}</ul></details> : null}
    {today && !plans.length ? <section className="pd-card"><p className="pd-none">Sorare confirmed no {RARITY_NAME[rarity] ?? rarity} missions in this scope at the last load.</p></section> : null}
    {today && plans.length ? <div className="ms-mode"><div role="group" aria-label="Sofix selection"><button type="button" className="ms-secondary" aria-pressed={mode === "best"} onClick={() => setMode("best")}>Best cards</button><button type="button" className="ms-secondary" aria-pressed={mode === "plan"} onClick={() => setMode("plan")}>Mission plan</button></div><p>{mode === "best" ? "Best players for each mission; cards can repeat between missions." : "Each card once across the day. Essence first, then clues, then XP."}</p></div> : null}
    {plans.map((one) => <section key={one.mission.id} className="pd-card ms-mission" aria-label={one.mission.title}>
      <h2>{one.mission.title}{one.reward ? <span className="ms-reward">{one.reward}</span> : null}</h2>
      <p className="ms-rule">{one.rule.label} · {one.open ? `${one.open} of your slots open` : "Your picks are filled"}</p>
      <div className="ms-current-grid"><div><h3>Your Sorare picks</h3>{one.mission.appearances?.length ? <ul className="ms-picks">{one.mission.appearances.map((a, i) => {
        const p = players.find((p) => a.card ? p.card === a.card : p.player === a.player); const c = collection.find((c) => a.card ? c.slug === a.card : c.player === a.player);
        return <li className="ms-pick" key={a.id ?? `${a.player}:${i}`}><Link className="art" href={`/players/${a.player}`} aria-label={`Open ${p?.name ?? c?.name ?? a.player} profile`}><CardArt src={p?.pic ?? c?.pic ?? ""} name={p?.name ?? c?.name ?? a.player} /></Link><span className="who"><b>{p?.name ?? c?.name ?? a.player.replaceAll("-", " ")}</b><span>{a.locked ? "Locked · " : ""}{a.status ?? "Imported"}{a.target !== undefined ? ` · target ${a.target}` : ""}</span></span></li>;
      })}</ul> : <p className="pd-none">{one.mission.appearances ? "No picks selected on Sorare at the last load." : "Your picks have not been imported. Reload missions."}</p>}</div>
      <div><h3>Sofix suggestions</h3>{one.picks.length ? <ol className="ms-picks">{one.picks.map((p) => <li className="ms-pick" key={p.card ?? p.slug}><Link className="art" href={`/players/${p.slug}`} aria-label={`Open ${p.name} profile`}><CardArt src={p.pic} name={p.name} /></Link><div className="who"><b><Link href={`/players/${p.slug}`}>{p.name}</Link></b><span>{p.venue ? `${p.team ?? "Playing side not supplied"} ${p.venue === "H" ? "v" : "at"} ${p.opponent}` : p.opponent} · {time(p.kickoff)}{p.target !== undefined ? ` · target ${p.target.toFixed(1)}` : ""}</span><MissionFormEvidence form={p.form} rule={one.rule} target={p.target} /></div><span className="chance"><b>{Math.round(p.chance * 100)}%</b><span>{p.frozen ? "saved before kickoff" : p.historical ? "recent hits" : "estimated"}</span></span></li>)}</ol> : <p className="pd-none">{one.all.some((p) => p.chance > 0) ? "Cards reserved for another Sofix mission. Review them below." : "No pre-kickoff recommendation recorded from the available evidence."}</p>}</div></div>
    </section>)}
    <p className="pd-foot">{today && seenAt ? `Missions loaded from Sorare ${freshLabel(seenAt, new Date(now))}. ` : ""}Your picks and shortlist never change Sofix’s benchmark. Suggestions never enter picks for you.</p>
    <MissionScouting plans={plans} players={players} pool={pool} now={now} rarity={rarity} shortlist={shortlist} toggle={toggle} captured={captured} />
    <MissionHistory days={history} bestDays={bestHistory} rarity={rarity} collection={collection} />
  </div>;
}
