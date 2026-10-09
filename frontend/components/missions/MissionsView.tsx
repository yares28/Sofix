"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { freshLabel } from "../../lib/fresh";
import { plan, RARITY_NAME, type MissionPlan, type MissionRow } from "../../lib/missions";
import type { MissionsStatus } from "../../lib/missionsToday";
import type { HistoryDay } from "../../lib/missionLog";
import type { CollectionCard } from "../../lib/play";
import type { MissionPlayer, MissionPool } from "../../lib/missionsPool";
import LoadMissions from "./LoadMissions";
import MissionHistory from "./MissionHistory";
import MissionScouting from "./MissionScouting";
import CardArt from "../cards/CardArt";
import { missionWindow } from "../../lib/missionPresentation";

const time = (s: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(s));
export default function MissionsView({ rarity, tabs, day, plans: original, status, seenAt, retained = [], missionDay, now, history, players, pool, collection }: {
  rarity: string; tabs: string[]; day: string | null; plans: MissionPlan[]; status: MissionsStatus; seenAt: string | null; missionDay: string; now: string; history: HistoryDay[];
  players: MissionPlayer[]; pool: MissionPool | null; collection: CollectionCard[];
  retained?: MissionRow[];
}) {
  const [shortlist, setShortlist] = useState<string[]>([]);
  const key = `sofix:mission-shortlist:${missionDay}:${rarity}`;
  useEffect(() => { try { const saved: unknown = JSON.parse(localStorage.getItem(key) ?? "[]"); setShortlist(Array.isArray(saved) ? saved.filter((s): s is string => typeof s === "string") : []); } catch { setShortlist([]); } }, [key]);
  const toggle = (s: string) => { const next = shortlist.includes(s) ? shortlist.filter((x) => x !== s) : [...shortlist, s]; setShortlist(next); try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* session-only */ } };
  const plans = shortlist.length && pool ? plan(original.map((p) => p.mission), rarity, players.filter((p) => !shortlist.includes(p.card ?? p.player ?? "")), pool.sheets.players, new Date(now)).plans : original;
  const today = status === "today";
  const made = plans.reduce((n, p) => n + p.mission.made, 0), open = plans.reduce((n, p) => n + p.open, 0);
  const window = missionWindow(new Date(now));
  const lock = players.filter((p) => p.rarity === rarity).flatMap((p) => p.games.map((g) => g.kickoff)).filter((k) => new Date(k) > new Date(now) && new Date(k) >= new Date(window.start) && new Date(k) < new Date(window.end)).sort((a, b) => Date.parse(a) - Date.parse(b))[0];
  return <div className="pd-wrap" data-testid="missions-page">
    <section className="pd-card ms-overview" aria-label="Missions overview">
    <div className="ms-head"><div><h1 className="ms-h1">Daily missions</h1><p className="ms-day">Mission day {day ?? missionDay}</p></div>
      <nav className="pd-pick" aria-label="Rarity">{tabs.map((r) => <Link key={r} href={`/missions?rarity=${r}`} aria-current={r === rarity ? "page" : undefined}>{RARITY_NAME[r] ?? r}</Link>)}</nav>
    </div>
    <p className="ms-window">Fallback game window: {time(window.start)} → {time(window.end)} (Madrid). Sorare’s reset time still needs verification; this is not a confirmed submission deadline.</p>
    <div className="ms-summary"><span><b>{today ? plans.length : "—"}</b> missions loaded</span><span><b>{today ? made : "—"}</b> your picks</span><span><b>{today ? open : "—"}</b> open slots</span><span>Next recorded kickoff <b>{lock ? time(lock) : "Not available"}</b></span></div>
    <LoadMissions stale={!today} day={missionDay} />
    {!today ? <p className="ms-stale" role="status">Today&rsquo;s missions aren&rsquo;t loaded yet.{seenAt ? ` Last loaded ${time(seenAt)}. The last read does not confirm today's mission list.` : ""}</p> : null}
    </section>
    {!today && retained.length ? <details className="pd-card"><summary>Last saved mission list{seenAt ? ` · ${time(seenAt)}` : ""}</summary><ul>{retained.map((m) => <li key={m.id}><b>{m.title}</b> — {m.description}<p>{m.appearances?.length ? `Imported selections: ${m.appearances.map((p) => p.player.replaceAll("-", " ")).join(", ")}` : "No selections confirmed in this saved list."}</p></li>)}</ul></details> : null}
    {today && !plans.length ? <section className="pd-card"><p className="pd-none">Sorare confirmed no {RARITY_NAME[rarity] ?? rarity} missions in this scope at the last load.</p></section> : null}
    {plans.map((one) => <section key={one.mission.id} className="pd-card ms-mission" aria-label={one.mission.title}>
      <h2>{one.mission.title}{one.reward ? <span className="ms-reward">{one.reward}</span> : null}</h2>
      <p className="ms-rule">{one.open ? `${one.open} to pick: ${one.rule.label}` : "All picked"}</p>
      {one.mission.startDate ? <p className="ms-evidence">Task started {time(one.mission.startDate)} · from Sorare</p> : null}
      <div className="ms-current-grid"><div><h3>Your Sorare picks</h3>{one.mission.appearances?.length ? <ul className="ms-picks">{one.mission.appearances.map((a, i) => {
        const p = players.find((p) => a.card ? p.card === a.card : p.player === a.player); const c = collection.find((c) => a.card ? c.slug === a.card : c.player === a.player);
        return <li className="ms-pick" key={a.id ?? `${a.player}:${i}`}><span className="art" aria-hidden="true"><CardArt src={p?.pic ?? c?.pic ?? ""} name={p?.name ?? c?.name ?? a.player} /></span><span className="who"><b>{p?.name ?? c?.name ?? a.player.replaceAll("-", " ")}</b><span>{a.locked ? "Locked · " : ""}{a.status ?? "Imported"}{a.target !== undefined ? ` · target ${a.target}` : ""}</span></span></li>;
      })}</ul> : <p className="pd-none">{one.mission.appearances ? "No picks selected on Sorare at the last load." : "Your picks have not been imported. Reload missions."}</p>}</div>
      <div><h3>Sofix suggestions</h3>{one.picks.length ? <ol className="ms-picks">{one.picks.map((p) => <li className="ms-pick" key={p.card ?? p.slug}><span className="art" aria-hidden="true"><CardArt src={p.pic} name={p.name} /></span><span className="who"><b><Link href={`/players/${p.slug}`}>{p.name}</Link></b><span>{p.team ?? "Playing side not supplied"} {p.venue === "H" ? "v" : "at"} {p.opponent} · {time(p.kickoff)}</span></span><span className="chance"><b>{Math.round(p.chance * 100)}%</b><span>estimated</span></span></li>)}</ol> : <p className="pd-none">{one.open ? one.rule.kind === "score" || one.rule.kind === "unsupported" ? "Target retained; Sofix does not estimate this rule yet." : one.all.some((p) => p.chance > 0) ? "Rated cards are already selected on Sorare, shortlisted, or reserved for another mission. Choose All cards in scouting to review them." : one.all.length ? "No card has a positive estimate for this target in the available data. Check the scouting evidence below." : "No rated cards remain before kickoff in the available data. Check the scouting evidence below." : "Your slots are filled."}</p>}</div></div>
    </section>)}
    <p className="pd-foot">{today && seenAt ? `Missions loaded from Sorare ${freshLabel(seenAt, new Date(now))}. ` : ""}Reward preference: Essence first, clues second, XP third. Suggestions never enter picks for you.</p>
    <MissionScouting plans={plans} players={players} pool={pool} now={now} rarity={rarity} shortlist={shortlist} toggle={toggle} />
    <MissionHistory days={history} rarity={rarity} collection={collection} />
  </div>;
}
