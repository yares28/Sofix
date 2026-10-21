"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { readDecisive, type Arcade, type ArcadeMission } from "../../lib/arcade";
import { bestLineup, chanceOf, decisiveRate, madridDate, rankDecisive, RUNS, streakTarget, type DecisivePick, type Outlook } from "../../lib/arcadePlan";
import { LineupCards, madridTime, pct, StartLabel } from "./ArcadePlanner";

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

/** A Decisive Picker: your cards playing that day, by start % × how often each did one of the counted actions in his own last games. */
function Decisive({ mission, outlooks }: { mission: ArcadeMission; outlooks: Map<string, Outlook[]> }) {
  const [now] = useState(() => Date.now());
  const day = madridDate(new Date(Math.max(now, Date.parse(mission.start ?? "") || now)).toISOString());
  const candidates = useMemo(() => {
    const byPlayer = new Map<string, Outlook>();
    for (const o of [...outlooks.values()].flat()) {
      if (madridDate(o.game.kickoff) !== day || Date.parse(o.game.kickoff) <= now || mission.picked.includes(o.card.player)) continue;
      if (!byPlayer.has(o.card.player)) byPlayer.set(o.card.player, o);
    }
    return [...byPlayer.values()].sort((a, b) => (b.start ?? 1) * (b.score ?? 0) - (a.start ?? 1) * (a.score ?? 0)).slice(0, 40);
  }, [outlooks, day, now, mission.picked]);
  const [picks, setPicks] = useState<DecisivePick[] | "reading" | null>("reading");
  useEffect(() => {
    let live = true;
    void readDecisive(candidates.map((o) => o.card.player)).then((past) => {
      if (!live) return;
      setPicks(past ? rankDecisive(candidates.map((outlook) => ({ outlook, rate: decisiveRate(past[outlook.card.player] ?? [], mission.stats) }))) : null);
    });
    return () => { live = false; };
  }, [candidates, mission.stats]);
  const open = Math.max(0, (mission.maxPicks ?? 0) - (mission.picks ?? 0));
  if (!open) return null;
  if (picks === "reading") return <p className="arc-note" role="status">Reading what your players did in their last games…</p>;
  if (!picks) return <p className="arc-note">Sorare did not give your players&apos; last games; read again in a minute.</p>;
  if (!picks.length) return <p className="arc-note">None of your cards plays that day.</p>;
  return (
    <ol className="arc-picks">
      {picks.slice(0, Math.max(open, 3)).map((p, i) => (
        <li key={p.outlook.card.slug} className={i < open ? "is-pick" : undefined}>
          {p.outlook.card.picture
            // eslint-disable-next-line @next/next/no-img-element -- Sorare's card art, as on the other pages
            ? <img src={p.outlook.card.picture} alt={p.outlook.card.name} width={120} height={194} loading="lazy" />
            : <div className="arc-card-blank">{p.outlook.card.name}</div>}
          <b className="arc-pick-chance">{p.chance === null ? "—" : pct(p.chance)}</b>
          <span className="arc-card-name">{p.outlook.card.name}</span>
          <span className="arc-meta"><StartLabel outlook={p.outlook} /> · {madridTime(p.outlook.game.kickoff)}</span>
          <span className="arc-meta">{p.rate === null ? "too few games to tell" : `did it in ${pct(p.rate)} of his games`}</span>
        </li>
      ))}
    </ol>
  );
}

export default function ArcadeMissions({ arcade, outlooks }: { arcade: Arcade; outlooks: Map<string, Outlook[]> | null }) {
  const missions = arcade.missions.filter((m) => !m.expired);
  return (
    <section aria-labelledby="arc-missions-title" className="arc-missions">
      <h2 id="arc-missions-title">Today&apos;s common missions</h2>
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
                : m.kind === "DecisivePlayerPickerTask" ? <Decisive mission={m} outlooks={outlooks} />
                : m.kind === "ThresholdsStreakTask" ? <Streak mission={m} outlooks={outlooks} /> : null}
            </li>
            );
          })}
        </ul>
      ) : <p>Sorare has no common mission for you today.</p>}
    </section>
  );
}

