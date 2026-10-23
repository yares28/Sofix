"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { readDecisive, type Arcade, type ArcadeMission, type DecisiveGame } from "../../lib/arcade";
import { bestLineup, chanceOf, decisiveRate, missionHistory, madridDate, rankDecisive, RUNS, streakTarget, type Outlook } from "../../lib/arcadePlan";
import Dots from "../missions/Dots";
import { missionChance, missionDay } from "../../lib/missions";
import { LineupCards, pct, StartLabel } from "./ArcadePlanner";

/** Which league a mission names, in Sorare's words, and the competition slug of its games. */
const LEAGUES: [RegExp, string][] = [[/laliga/i, "laliga-es"], [/premier|english/i, "premier-league-gb-eng"], [/bundesliga/i, "bundesliga-de"], [/ligue 1/i, "ligue-1-fr"]];
const STREAK_DAYS = 5; // a league's gameweek, from now

/** A streak: Sofix's best five from the league's games this week, aimed at the mission's target. */
function Streak({ mission, outlooks }: { mission: ArcadeMission; outlooks: Map<string, Outlook[]> }) {
  const target = streakTarget(mission.description);
  const league = LEAGUES.find(([words]) => words.test(mission.description ?? mission.title ?? ""))?.[1] ?? null;
  const [now] = useState(() => Date.now());
  const lineup = useMemo(() => {
    if (!target || !league) return null;
    const pool = [...outlooks.values()].flat().filter((o) => o.game.competition.slug === league && Date.parse(o.game.kickoff) > now && Date.parse(o.game.kickoff) < now + STREAK_DAYS * 86_400_000);
    return bestLineup(pool, target, 0, RUNS, 15); // the 15 likeliest lineups: enough for a mission, and quick
  }, [outlooks, target, league, now]);
  if (!target || !league) return null;
  if (!lineup) return <p className="arc-note">Your {league === "laliga-es" ? "LaLiga" : "league"} cards with a game this week cannot fill a lineup.</p>;
  return (
    <div className="arc-mission-plan">
      <p className="arc-advice is-play"><b>Your best five for it: {pct(chanceOf(lineup.totals, target))} to reach {target}.</b> From this week&apos;s games; no captain counted. Build it in that competition on Sorare.</p>
      <LineupCards lineup={lineup} captainBonus={0} />
    </div>
  );
}

/** One history reading shared by all mission tickets and history windows. */
function Decisive({ mission, outlooks, history, loading, window: count }: { mission: ArcadeMission; outlooks: Map<string, Outlook[]>; history: Record<string, DecisiveGame[]> | null | "reading"; loading: string; window: number }) {
  const [now] = useState(() => Date.now());
  const boundary = mission.start ? Date.parse(mission.start) : Date.parse(`${missionDay(new Date(now))}T08:00:00Z`);
  const day = madridDate(new Date(boundary).toISOString());
  const picks = useMemo(() => {
    const byPlayer = new Map<string, Outlook>();
    for (const list of outlooks.values()) for (const o of list) {
      const mine = mission.picked.includes(o.card.player);
      if (madridDate(o.game.kickoff) !== day || !mine && Date.parse(o.game.kickoff) <= now) continue;
      const kept = byPlayer.get(o.card.player);
      if (!kept || Date.parse(o.game.kickoff) < Date.parse(kept.game.kickoff)) byPlayer.set(o.card.player, o);
    }
    return rankDecisive([...byPlayer.values()].map((o) => {
      const games = history && history !== "reading" ? (history[o.card.player] ?? []) : [];
      const recent = missionHistory(games, boundary, count);
      const counted = mission.stats.length ? mission.stats : ["goals", "goal_assist", "assist_penalty_won", "clearance_off_line", "last_man_tackle", "penalty_save", ...(o.card.positions.includes("Goalkeeper") ? ["clean_sheet_60"] : [])];
      const canonical = ["goals", "goal_assist", "assist_penalty_won", "clearance_off_line", "last_man_tackle", "penalty_save", ...(o.card.positions.includes("Goalkeeper") ? ["clean_sheet_60"] : [])];
      const modeled = !mission.stats.length || canonical.every((stat) => mission.stats.includes(stat)) && mission.stats.every((stat) => canonical.includes(stat));
      const rate = decisiveRate(recent, counted);
      const starterRate = decisiveRate(recent.filter((g) => g.started === true), counted);
      return { outlook: { ...o, decisive: modeled ? o.decisive ?? starterRate : null }, rate, recent, counted };
    }));
  }, [outlooks, mission.picked, mission.stats, history, boundary, day, now, count]);
  const yours = picks.filter((p) => mission.picked.includes(p.outlook.card.player));
  const others = picks.filter((p) => !mission.picked.includes(p.outlook.card.player)).slice(0, 5);
  const card = (p: (typeof picks)[number]) => {
    const games = history && history !== "reading" ? (history[p.outlook.card.player] ?? []) : [];
    const recent = missionHistory(games, boundary, count);
    const counted = mission.stats.length ? mission.stats : ["goals", "goal_assist", "assist_penalty_won", "clearance_off_line", "last_man_tackle", "penalty_save", ...(p.outlook.card.positions.includes("Goalkeeper") ? ["clean_sheet_60"] : [])];
    return <li key={p.outlook.card.slug} className={mission.picked.includes(p.outlook.card.player) ? "is-yours" : undefined}>
      <span className="arc-pick-start"><StartLabel outlook={p.outlook} /></span>
      {p.outlook.card.picture
        // eslint-disable-next-line @next/next/no-img-element -- the owner's Sorare card art
        ? <img src={p.outlook.card.picture} alt={p.outlook.card.name} width={120} height={194} loading="lazy" />
        : <div className="arc-card-blank">{p.outlook.card.name}</div>}
      <span className="arc-card-name">{p.outlook.card.name}</span>
      <b className="arc-pick-chance" title={p.outlook.decisive != null ? "Decisive chance if he starts; start % is separate" : "Historical mission hit rate; start % is separate"}>{p.chance === null ? "—" : missionChance(p.chance)}</b>
      <Dots count={count} games={recent.map((g) => ({ date: g.date!, started: g.started ?? null, hit: g.stats === null ? null : g.stats.some((stat) => counted.includes(stat)) })).reverse()} />
      {mission.picked.includes(p.outlook.card.player) ? <span className="arc-meta">Your pick{mission.pickLocked ? " · Locked" : ""}</span> : null}
    </li>;
  };
  return <>
    <p role="status" className="arc-mission-status">{loading || (history === null ? "History unavailable. Read again in a few minutes." : "")}</p>
    <div className="arc-mission-choices">
      {mission.picked.length ? <ol className="arc-picks arc-own" aria-label="Your mission picks">{yours.map(card)}{mission.picked.filter((id) => !yours.some((p) => p.outlook.card.player === id)).map((id) => <li key={id}>Your pick · fixture unavailable</li>)}</ol> : null}
      <ol className="arc-picks arc-alternatives" aria-label="Mission alternatives">{others.map(card)}</ol>
    </div>
    {!picks.length ? <p className="arc-note">None of your cards plays that day.</p> : null}
  </>;
}

export default function ArcadeMissions({ arcade, outlooks }: { arcade: Arcade; outlooks: Map<string, Outlook[]> | null }) {
  const [window, setWindow] = useState(10);
  const [loading, setLoading] = useState("Reading mission history…");
  const [history, setHistory] = useState<Record<string, DecisiveGame[]> | null | "reading">("reading");
  const [now] = useState(() => Date.now());
  const players = useMemo(() => {
    const missions = arcade.missions.filter((m) => !m.expired && m.kind === "DecisivePlayerPickerTask");
    return [...new Set([...outlooks?.values() ?? []].flat().filter((o) => missions.some((m) => {
      const day = m.start ? madridDate(m.start) : madridDate(`${missionDay(new Date(now))}T08:00:00Z`);
      return m.picked.includes(o.card.player) || madridDate(o.game.kickoff) === day && Date.parse(o.game.kickoff) > now;
    })).map((o) => o.card.player))].sort();
  }, [outlooks, arcade.missions, now]);
  const playerKey = arcade.missions.some((m) => !m.expired && m.kind === "DecisivePlayerPickerTask") ? players.join(",") : "";
  useEffect(() => {
    if (!playerKey) return;
    const controller = new AbortController();
    const dates = arcade.missions.filter((m) => !m.expired).flatMap((m) => m.start && Number.isFinite(Date.parse(m.start)) ? [Date.parse(m.start)] : []);
    const before = dates.length ? new Date(Math.max(...dates)).toISOString() : `${missionDay(new Date())}T08:00:00.000Z`;
    setLoading("Reading mission history…");
    void readDecisive(playerKey.split(","), before, controller.signal, (rows, done, total) => {
      if (!controller.signal.aborted) { setHistory(rows); setLoading(`Reading history · ${done} of ${total} players`); }
    }).then((answer) => { if (!controller.signal.aborted) { setHistory(answer); setLoading(""); } });
    return () => { controller.abort(); };
  }, [playerKey, arcade.missions]);
  const missions = arcade.missions.filter((m) => !m.expired);
  return (
    <section aria-labelledby="arc-missions-title" className="arc-missions">
      <div className="arc-missions-heading"><h2 id="arc-missions-title">Today&apos;s missions</h2>
      <div role="group" aria-label="Mission history window">{[5, 10, 20, 40].map((n) => <button key={n} type="button" aria-pressed={window === n} onClick={() => setWindow(n)}>L{n}</button>)}</div></div>
      {missions.length ? (
        <ul className="arc-ringlist">
          {missions.map((m, i) => {
            const [done, of] = m.progress !== null && m.target !== null ? [m.progress, m.target] : m.picks !== null && m.maxPicks ? [m.picks, m.maxPicks] : [null, null];
            const gems = m.rewards.find((r) => r.endsWith(" gems"));
            return (
            <li key={m.id} className="arc-lab-card" style={{ "--i": i } as CSSProperties}>
              <div className="arc-mission-row">
                <div className="arc-mring" style={{ "--p": done !== null && of ? done / of : 0 } as CSSProperties} role="img" aria-label={done !== null ? `${done} of ${of}` : "no progress count"}>
                  <span><b>{done !== null && of ? of - done : "–"}</b><small>{done !== null ? "to go" : ""}</small></span>
                </div>
                <div className="arc-mission-text">
                  <strong>{m.title ?? m.kind}</strong>
                  {m.description ? <span>{m.description}</span> : null}
                  <span><b>{m.rewards.filter((r) => !r.endsWith(" gems")).join(" + ") || "—"}</b> · gems: {gems ? gems.replace(" gems", "") : "—"}{done !== null ? ` · ${done} of ${of}${m.picks !== null ? " picked" : ""}` : ""}</span>
                </div>
              </div>
              {outlooks === null ? <p className="arc-note" role="status">Picks come once predictions are read.</p>
                : m.kind === "DecisivePlayerPickerTask" ? <Decisive mission={m} outlooks={outlooks} history={history} loading={loading} window={window} />
                : m.kind === "ThresholdsStreakTask" ? <Streak mission={m} outlooks={outlooks} /> : null}
            </li>
            );
          })}
        </ul>
      ) : <p>Sorare has no daily mission for you today.</p>}
    </section>
  );
}

