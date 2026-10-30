"use client";
import { useEffect, useState } from "react";
import Link from "../navigation/NavigationLink";
import { freshLabel } from "../../lib/fresh";
import { missionCandidates, missionChance, RARITY_NAME, type MissionPick, type MissionPlan, type MissionRow, type Suggestion } from "../../lib/missions";
import type { MissionsStatus } from "../../lib/missionsToday";
import type { HistoryDay, LogCand } from "../../lib/missionLog";
import type { CollectionCard } from "../../lib/play";
import type { MissionPlayer, MissionPool } from "../../lib/missionsPool";
import type { Sheet } from "../../lib/playerSheet";
import { lastGames } from "../../lib/missionColumns";
import LoadMissions from "./LoadMissions";
import MissionHistory, { type AllTime } from "./MissionHistory";
import MissionScouting from "./MissionScouting";
import CardArt from "../cards/CardArt";
import Dots from "./Dots";
import { missionWindow, rewardStub } from "../../lib/missionPresentation";

const time = (s: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(s));
const at = (s: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(s));
const SOFIX_NOTE = (p: Suggestion) => p.noEstimate ? "fills an open slot" : p.reconstructed ? "reconstructed" : p.frozen ? "saved before kickoff" : p.historical ? "recent hits" : "estimated";

export default function MissionsView({ rarity, tabs, day, plans: original, bestPlans, captured, bestHistory, allTime, status, seenAt, retained = [], missionDay, now, history, players, pool, collection }: {
  bestPlans: MissionPlan[]; bestHistory: HistoryDay[]; captured: LogCand[];
  rarity: string; tabs: string[]; day: string | null; plans: MissionPlan[]; status: MissionsStatus; seenAt: string | null; missionDay: string; now: string; history: HistoryDay[]; allTime?: AllTime;
  players: MissionPlayer[]; pool: MissionPool | null; collection: CollectionCard[];
  retained?: MissionRow[];
}) {
  const [shortlist, setShortlist] = useState<string[]>([]);
  const [mode, setMode] = useState<"best" | "plan">("plan");
  const [selected, setSelected] = useState("");
  const key = `sofix:mission-shortlist:${missionDay}:${rarity}:${original.map((p) => p.mission.id).sort().join(",")}`;
  useEffect(() => { try { const saved: unknown = JSON.parse(localStorage.getItem(key) ?? "[]"); setShortlist(Array.isArray(saved) ? saved.filter((s): s is string => typeof s === "string") : []); } catch { setShortlist([]); } }, [key]);
  const toggle = (s: string) => { const next = shortlist.includes(s) ? shortlist.filter((x) => x !== s) : [...shortlist, s]; setShortlist(next); try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* session-only */ } };
  const plans = mode === "best" ? bestPlans : original;
  const one = plans.find((p) => p.mission.id === selected) ?? plans[0];
  const today = status === "today";
  const selections = original.flatMap((p) => p.mission.appearances ?? []);
  const window = missionWindow(new Date(now));
  const lock = players.filter((p) => p.rarity === rarity).flatMap((p) => p.games.map((g) => g.kickoff)).filter((k) => new Date(k) > new Date(now) && new Date(k) >= new Date(window.start) && new Date(k) < new Date(window.end)).sort((a, b) => Date.parse(a) - Date.parse(b))[0];
  const lockOf = (p: MissionPlan) => missionCandidates(p.mission, rarity, players, new Date(now), selections).filter((c) => !c.locked).map((c) => c.game.kickoff).sort()[0] ?? lock;
  const sheetOf = (player: string): Sheet | undefined => pool?.sheets.players[player];
  const hitsOf = (games: ReturnType<typeof lastGames>) => `${games.filter((g) => g.hit).length}/${games.length}`;

  const yours = (one?.mission.appearances ?? []).map((a: MissionPick, i) => {
    const p = players.find((p) => a.card ? p.card === a.card : p.player === a.player), c = collection.find((c) => a.card ? c.slug === a.card : c.player === a.player);
    const s = one!.all.find((s) => a.card ? s.card === a.card : s.slug === a.player);
    const name = p?.name ?? c?.name ?? a.player.replaceAll("-", " "), games = lastGames(s?.form ?? sheetOf(a.player)?.form, one!.rule, a.target ?? s?.target);
    return { id: a.id ?? `${a.player}:${i}`, slug: a.player, name, pic: p?.pic ?? c?.pic ?? "", games, big: s ? missionChance(s.noEstimate ? undefined : s.chance) : games.length ? hitsOf(games) : "–", small: s ? hitsOf(games) : "no estimate",
      note: `${a.locked ? "Locked · " : ""}${a.status ?? "Imported"}${a.target !== undefined ? ` · target ${a.target}` : ""}` };
  });

  return <div className="pd-wrap mx" data-testid="missions-page">
    <header className="mx-head">
      <div className="mx-title"><h1>Missions</h1><span>{day ?? missionDay}</span></div>
      <nav className="mx-seg" aria-label="Rarity">{tabs.map((r) => <Link key={r} href={`/missions?rarity=${r}`} aria-current={r === rarity ? "page" : undefined}>{RARITY_NAME[r] ?? r}</Link>)}</nav>
      {today && seenAt ? <span className="mx-live" title="Read from your signed-in Sorare tab"><i />Loaded {freshLabel(seenAt, new Date(now))}</span> : null}
      <LoadMissions stale={!today} day={missionDay} />
    </header>
    {!today ? <p className="ms-stale" role="status">Today&rsquo;s missions aren&rsquo;t loaded yet.{seenAt ? ` Last loaded ${time(seenAt)}. The last read does not confirm today's mission list.` : ""}</p> : null}
    {!today && retained.length ? <details className="mx-card mx-saved"><summary>Last saved mission list{seenAt ? ` · ${time(seenAt)}` : ""}</summary><ul>{retained.map((m) => <li key={m.id}><b>{m.title}</b> — {m.description}<p>{m.appearances?.length ? `Imported selections: ${m.appearances.map((p) => p.player.replaceAll("-", " ")).join(", ")}` : "No selections confirmed in this saved list."}</p></li>)}</ul></details> : null}
    {today && !plans.length ? <section className="mx-card"><p className="pd-none">Sorare confirmed no {RARITY_NAME[rarity] ?? rarity} missions in this scope at the last load.</p></section> : null}

    {today && one ? <>
      <div className="mx-tickets" role="group" aria-label="Today's missions">{plans.map((p) => {
        const stub = rewardStub(p.reward), lockAt = lockOf(p);
        return <button key={p.mission.id} type="button" className="mx-ticket" aria-pressed={p.mission.id === one.mission.id} onClick={() => setSelected(p.mission.id)}>
          <span className="stub"><b>{stub?.num ?? "Mission"}</b>{" "}<span>{stub?.unit}</span></span>
          <span className="body"><span className="tt">{p.mission.title}</span><span className="rule" title={p.rule.label}>{p.rule.label}</span>
            <span className="meta"><span>{p.mission.made}/{p.mission.picks} picked</span>{p.open ? <span>{p.open} open</span> : null}{lockAt ? <span>Locks {at(lockAt)}</span> : null}</span></span>
        </button>;
      })}</div>

      <section className="mx-card mx-picks" aria-label={one.mission.title}>
        <div className="mx-lane">
          <div className="mx-zh"><span className="mx-eyebrow">Your picks</span>
            <a className="mx-btn" href={`https://sorare.com/football/play/missions/play/${rarity}`} target="_blank" rel="noreferrer">{one.mission.made}/{one.mission.picks} on Sorare · Edit ↗</a></div>
          {yours.length ? <ul className="mx-trio">{yours.map((c) => <li key={c.id}>
            <Link className="mx-art" href={`/players/${c.slug}`} aria-label={`Open ${c.name} profile`}><CardArt src={c.pic} name={c.name} /></Link>
            <b className="nm">{c.name}</b><span className="mx-cv"><b>{c.big}</b><span>{c.small}</span></span><Dots games={c.games} small /><span className="note">{c.note}</span>
          </li>)}</ul> : <p className="pd-none">{one.mission.appearances ? "No picks selected on Sorare at the last load." : "Your picks have not been imported. Reload missions."}</p>}
        </div>
        <div className="mx-rule" aria-hidden="true" />
        <div className="mx-lane">
          <div className="mx-zh"><span className="mx-eyebrow sfx">Sofix would pick</span>
            <div className="mx-seg sm" role="group" aria-label="Sofix selection">
              <button type="button" aria-pressed={mode === "plan"} title="Each card once across the day. Essence first, then clues, then XP." onClick={() => setMode("plan")}>Each card once</button>
              <button type="button" aria-pressed={mode === "best"} title="Best players for each mission; cards can repeat between missions." onClick={() => setMode("best")}>Best cards</button>
            </div></div>
          {one.picks.length ? <ol className="mx-trio">{one.picks.map((p) => <li key={p.card ?? p.slug}>
            <Link className="mx-art" href={`/players/${p.slug}`} aria-label={`Open ${p.name} profile`}><CardArt src={p.pic} name={p.name} /></Link>
            <b className="nm">{p.name}</b><span className="mx-cv"><b>{missionChance(p.noEstimate ? undefined : p.chance)}</b><span>{SOFIX_NOTE(p)}</span></span>
            <Dots games={lastGames(p.form, one.rule, p.target)} small />
            <span className="note">{p.venue ? `${p.venue === "H" ? "v" : "at"} ${p.opponent}` : p.opponent} · {at(p.kickoff)}{p.target !== undefined ? ` · target ${p.target.toFixed(1)}` : ""}</span>
          </li>)}</ol> : <p className="pd-none">{one.all.some((p) => p.chance > 0) ? "Cards reserved for another Sofix mission. Review them below." : "No pre-kickoff recommendation recorded from the available evidence."}</p>}
          {plans.some((p) => p.picks.some((s) => s.reconstructed)) ? <p className="mx-fine-note">Reconstructed from pre-day stats; these references stay in your comparison.</p> : null}
        </div>
      </section>
    </> : null}

    <MissionScouting one={one} plans={plans} players={players} pool={pool} now={now} rarity={rarity} shortlist={shortlist} toggle={toggle} captured={captured} />
    <MissionHistory days={history} bestDays={bestHistory} allTime={allTime} rarity={rarity} collection={collection} />
    <details className="mx-fine"><summary>Mission window</summary><p>Fallback game window: {time(window.start)} → {time(window.end)} (Madrid). Sorare eligibility takes precedence; its reset time still needs verification.</p></details>
  </div>;
}
