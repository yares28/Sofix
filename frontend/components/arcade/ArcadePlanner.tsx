"use client";

import { useMemo, useState } from "react";
import type { Arcade, ArcadeGame, ArcadeStep } from "../../lib/arcade";
import { bestLineup, chanceOf, likelyRange, predicted, type Lineup, type Outlook, type StartSource } from "../../lib/arcadePlan";

const SOURCE: Record<StartSource, string> = { sorare: "Sorare", futbolfantasy: "Futbol Fantasy", sofix: "Sofix" };
const SLOT: Record<string, string> = { GK: "Goalkeeper", DEF: "Defender", MID: "Midfielder", FWD: "Forward", EXTRA: "Extra" };
export const madridDay = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Europe/Madrid", weekday: "short", day: "numeric", month: "short" });
export const madridTime = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });
export const pct = (x: number) => `${Math.round(x * 100)}%`;
export const pts = (x: number) => Math.round(x).toLocaleString("en-GB");

/** A card's start % with whose it is, or "no start % yet". */
export function StartLabel({ outlook }: { outlook: Outlook }) {
  return outlook.start === null
    ? <i className="arc-nostart">no start % yet</i>
    : <span title={`${SOURCE[outlook.startSource!]}'s start %`}>{pct(outlook.start)} start</span>;
}

/** One card's prediction: points, his likely range, and where the numbers come from. */
export function Prediction({ outlook, captain = false, captainBonus = 0 }: { outlook: Outlook; captain?: boolean; captainBonus?: number }) {
  const value = predicted(outlook, captain, captainBonus);
  const range = likelyRange(outlook, captain, captainBonus);
  if (value === null) return <span className="arc-pred is-none">no projection yet</span>;
  return (
    <span className="arc-pred" title={`${outlook.scoreSource === "sorare" ? "Sorare's projection" : "his average when he plays (Sorare has no projection yet)"} × start % × Sorare's bonus${range ? `; he scored ${pts(range[0])}–${pts(range[1])} in 6 of 10 recent games he played` : ""}`}>
      <b>{pts(value)}</b> pts{range ? <small> · {pts(range[0])}–{pts(range[1])}</small> : null}
    </span>
  );
}

export function LineupCards({ lineup, captainBonus }: { lineup: Lineup; captainBonus: number }) {
  return (
    <ol className="arc-lineup">
      {lineup.picks.map(({ slot, outlook, captain }) => (
        <li key={outlook.card.slug}>
          <span className="arc-slot">{SLOT[slot]}{captain ? <b className="arc-captain" title="Captain">C</b> : null}</span>
          {outlook.card.picture
            // eslint-disable-next-line @next/next/no-img-element -- Sorare's card art, as on the other pages
            ? <img src={outlook.card.picture} alt={outlook.card.name} width={120} height={194} loading="lazy" />
            : <div className="arc-card-blank">{outlook.card.name}</div>}
          <span className="arc-card-name">{outlook.card.name}</span>
          <Prediction outlook={outlook} captain={captain} captainBonus={captainBonus} />
          <span className="arc-meta"><StartLabel outlook={outlook} /> · {madridTime(outlook.game.kickoff)}</span>
        </li>
      ))}
    </ol>
  );
}

/** The lineup's expected total and its chance against every step's target. */
export function Chances({ lineup, steps, aim }: { lineup: Lineup; steps: ArcadeStep[]; aim: number }) {
  const lo = lineup.totals[Math.floor(lineup.totals.length * 0.2)] ?? 0;
  const hi = lineup.totals[Math.floor(lineup.totals.length * 0.8)] ?? 0;
  return (
    <div className="arc-chances">
      <p><b>{pts(lineup.expected)}</b> pts expected · {pts(lo)}–{pts(hi)} in 6 of 10</p>
      <ul>
        {steps.map((step) => {
          const chance = chanceOf(lineup.totals, step.target);
          return (
            <li key={step.id} className={step.number === aim ? "is-aim" : undefined}>
              <span>Step {step.number} · {step.target}</span>
              <span className="arc-bar" aria-hidden="true"><span style={{ width: pct(chance) }} /></span>
              <b>{pct(chance)}</b>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** "Pick teams": choose games, Sofix builds the lineup with the best chance at the step you aim at. */
function PickTeams({ arcade, outlooks, captainBonus, aimDefault }: { arcade: Arcade; outlooks: Map<string, Outlook[]>; captainBonus: number; aimDefault: number }) {
  const steps = arcade.board?.steps ?? [];
  const games = useMemo(() => (arcade.games ?? []).filter((g) => (outlooks.get(g.id) ?? []).length), [arcade.games, outlooks]);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(games.slice(0, 8).map((g) => g.id)));
  const [aim, setAim] = useState(aimDefault);
  const target = steps.find((s) => s.number === aim)?.target ?? steps[0]?.target ?? 0;
  const lineup = useMemo(() => bestLineup([...chosen].flatMap((id) => outlooks.get(id) ?? []), target, captainBonus), [chosen, outlooks, target, captainBonus]);
  const days = useMemo(() => {
    const out = new Map<string, ArcadeGame[]>();
    for (const g of games) out.set(madridDay(g.kickoff), [...(out.get(madridDay(g.kickoff)) ?? []), g]);
    return [...out.entries()];
  }, [games]);
  const toggle = (id: string) => setChosen((now) => { const next = new Set(now); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  return (
    <div className="arc-pick">
      <label className="arc-aim">Aim at
        <select value={aim} onChange={(e) => setAim(Number(e.target.value))}>
          {steps.map((s) => <option key={s.id} value={s.number}>Step {s.number} · {s.target} pts</option>)}
        </select>
      </label>
      <div className="arc-games" role="group" aria-label="Games to pick from">
        {days.map(([day, list]) => (
          <div key={day} className="arc-day">
            <span className="arc-day-name">{day}</span>
            {list.map((g) => (
              <button key={g.id} type="button" aria-pressed={chosen.has(g.id)} onClick={() => toggle(g.id)} title={`${g.competition.name} · ${(outlooks.get(g.id) ?? []).length} of your cards`}>
                {madridTime(g.kickoff)} {g.home?.name ?? "?"} – {g.away?.name ?? "?"}
              </button>
            ))}
          </div>
        ))}
      </div>
      {lineup ? (
        <>
          <LineupCards lineup={lineup} captainBonus={captainBonus} />
          <Chances lineup={lineup} steps={steps} aim={aim} />
        </>
      ) : <p className="arc-note">{chosen.size ? "These games cannot fill a goalkeeper, defender, midfielder, forward and one more outfield card from your cards." : "Pick at least one game."}</p>}
    </div>
  );
}

export default function ArcadePlanner({ arcade, outlooks, captainBonus }: { arcade: Arcade; outlooks: Map<string, Outlook[]>; captainBonus: number }) {
  return (
    <section className="arc-plan" aria-labelledby="arc-plan-title">
      <h2 id="arc-plan-title">Pick teams</h2>
      <PickTeams arcade={arcade} outlooks={outlooks} captainBonus={captainBonus} aimDefault={arcade.board?.current ?? 1} />
    </section>
  );
}
