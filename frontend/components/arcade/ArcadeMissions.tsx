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
  // The day's players still to kick off, plus your own picks (ranked with them, even once their game has started).
  const candidates = useMemo(() => {
    const byPlayer = new Map<string, Outlook>();
    for (const o of [...outlooks.values()].flat()) {
      const mine = mission.picked.includes(o.card.player);
      if (madridDate(o.game.kickoff) !== day || (!mine && Date.parse(o.game.kickoff) <= now)) continue;
      if (!byPlayer.has(o.card.player)) byPlayer.set(o.card.player, o);
    }
    const ranked = [...byPlayer.values()].sort((a, b) => (b.start ?? 1) * (b.score ?? 0) - (a.start ?? 1) * (a.score ?? 0));
    return [...ranked.filter((o) => mission.picked.includes(o.card.player)), ...ranked.filter((o) => !mission.picked.includes(o.card.player)).slice(0, 40)];
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
  if (picks === "reading") return <p className="arc-note" role="status">Reading what your players did in their last games…</p>;
  if (!picks) return <p className="arc-note">Sorare did not give your players&apos; last games; read again in a minute.</p>;
  const yours = picks.filter((p) => mission.picked.includes(p.outlook.card.player));
  const others = picks.filter((p) => !mission.picked.includes(p.outlook.card.player));
  if (!yours.length && !others.length) return <p className="arc-note">None of your cards plays that day.</p>;
  // Your weakest pick against the best one you have not made: worth a swap while Sorare still lets you change it.
  const weakest = [...yours].sort((a, b) => (a.chance ?? -1) - (b.chance ?? -1))[0];
  const better = !open && weakest && !mission.pickLocked && others[0] && (others[0].chance ?? -1) > (weakest.chance ?? -1) + 0.05 ? others[0] : null;
  const shown = [...yours, ...others.slice(0, Math.max(open, better ? 1 : 0, 3 - yours.length))];
  return (
    <>
      {yours.length ? (
        <p className={`arc-advice${better ? "" : " is-play"}`}>
          <b>{better
            ? `Swap ${weakest!.outlook.card.name} (${weakest!.chance === null ? "too few games to tell" : pct(weakest!.chance)}) for ${better.outlook.card.name} (${pct(better.chance!)}).`
            : `Your pick ${yours.map((p) => `${p.outlook.card.name}: ${p.chance === null ? "too few games to tell" : pct(p.chance)}`).join(", ")}.`}</b>
          {" "}{mission.pickLocked ? "Locked: its game has started." : better ? "You can still change it on Sorare until his game starts." : "No better pick among your cards that day."}
        </p>
      ) : null}
    <ol className="arc-picks">
      {shown.map((p) => (
        <li key={p.outlook.card.slug} className={mission.picked.includes(p.outlook.card.player) ? "is-yours" : others.indexOf(p) < open ? "is-pick" : undefined}>
          {p.outlook.card.picture
            // eslint-disable-next-line @next/next/no-img-element -- Sorare's card art, as on the other pages
            ? <img src={p.outlook.card.picture} alt={p.outlook.card.name} width={120} height={194} loading="lazy" />
            : <div className="arc-card-blank">{p.outlook.card.name}</div>}
          <b className="arc-pick-chance">{p.chance === null ? "—" : pct(p.chance)}</b>
          <span className="arc-card-name">{p.outlook.card.name}</span>
          <span className="arc-meta"><StartLabel outlook={p.outlook} /> · {madridTime(p.outlook.game.kickoff)}</span>
          <span className="arc-meta">{p.rate === null ? "too few games to tell" : `did it in ${pct(p.rate)} of his games`}</span>
          {mission.picked.includes(p.outlook.card.player) ? <span className="arc-meta"><b>Your pick</b></span> : null}
        </li>
      ))}
    </ol>
    </>
  );
}

export default function ArcadeMissions({ arcade, outlooks }: { arcade: Arcade; outlooks: Map<string, Outlook[]> | null }) {
  const missions = arcade.missions.filter((m) => !m.expired);
  return (
    <section aria-labelledby="arc-missions-title" className="arc-missions">
      <h2 id="arc-missions-title">Today&apos;s missions</h2>
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
      ) : <p>Sorare has no daily mission for you today.</p>}
    </section>
  );
}

