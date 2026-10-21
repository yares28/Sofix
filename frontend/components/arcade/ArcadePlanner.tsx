"use client";

import { useMemo, useState } from "react";
import type { Arcade, ArcadeGame, ArcadeStep } from "../../lib/arcade";
import { bestLineup, bigReward, chanceOf, lifeAdvice, likelyRange, madridDate, planDay, predicted, type Lineup, type Outlook, type StartSource, type StepInfo } from "../../lib/arcadePlan";

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
      <b>{pts(value)}</b> pts{range ? <small> · {pts(range[0])}–{pts(range[1])} if he plays</small> : null}
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

/** Each step's target, lives left (Sorare's count for a started step, else the full 4) and whether its reward is big. */
function stepInfos(arcade: Arcade): StepInfo[] {
  return (arcade.board?.steps ?? []).map((s) => ({ number: s.number, target: s.target, lives: s.lineups?.remaining ?? s.lineups?.max ?? 4, big: bigReward(s.rewards) }));
}

/** Cards in a lineup on Sorare still waiting or playing (not cancelled, a card not locked yet or a game live): no plan uses them again. */
const busyCards = (arcade: Arcade) => new Set((arcade.board?.steps ?? []).flatMap((s) => s.entered.filter((l) => !l.cancelled && (l.live || l.cards.some((c) => !c.locked))).flatMap((l) => l.cards.flatMap((c) => (c.slug ? [c.slug] : [])))));

/** "Pick a day": the lineups for the day's games, in the order they settle, each at the step it lands on, with when to spend a life. */
function PickDay({ arcade, outlooks, captainBonus, now }: { arcade: Arcade; outlooks: Map<string, Outlook[]>; captainBonus: number; now: number }) {
  const steps = useMemo(() => stepInfos(arcade), [arcade]);
  const current = arcade.board?.current ?? 1;
  const byDay = useMemo(() => {
    const out = new Map<string, Outlook[]>();
    for (const game of arcade.games ?? []) {
      if (Date.parse(game.kickoff) <= now) continue;
      const day = madridDate(game.kickoff);
      out.set(day, [...(out.get(day) ?? []), ...(outlooks.get(game.id) ?? [])]);
    }
    return [...out.entries()].filter(([, list]) => list.length);
  }, [arcade.games, outlooks, now]);
  const [day, setDay] = useState<string | null>(null);
  const chosen = day ?? byDay[0]?.[0] ?? null;
  const busy = useMemo(() => busyCards(arcade), [arcade]);
  const waiting = arcade.board?.steps.find((s) => s.number === current)?.entered.filter((l) => !l.cancelled && (l.live || l.cards.some((c) => !c.locked))).length ?? 0;
  const plan = useMemo(() => (chosen ? planDay(byDay.find(([d]) => d === chosen)?.[1] ?? [], steps, current, captainBonus, busy) : []), [chosen, byDay, steps, current, captainBonus, busy]);
  const advice = useMemo(() => {
    const first = plan[0];
    const step = first ? steps.find((s) => s.number === first.step) : undefined;
    if (!first || !step) return null;
    const index = byDay.findIndex(([d]) => d === chosen);
    const later = byDay.slice(index + 1).map(([d, list]) => ({ day: madridDay(`${d}T12:00:00Z`), lineup: bestLineup(list.filter((o) => !busy.has(o.card.slug)), step.target, captainBonus) }));
    return lifeAdvice({ chance: first.chance, step, days: byDay.length - index, stepsLeft: steps.length - current + 1 }, later);
  }, [plan, steps, byDay, chosen, busy, captainBonus, current]);

  if (!byDay.length) return <p className="arc-note">No game of your cards is left before the set ends.</p>;
  return (
    <div className="arc-pick">
      <div className="arc-days" role="group" aria-label="Day">
        {byDay.map(([d]) => <button key={d} type="button" aria-pressed={d === chosen} onClick={() => setDay(d)}>{madridDay(`${d}T12:00:00Z`)}</button>)}
      </div>
      {advice ? <p className={`arc-advice${advice.play ? " is-play" : ""}`} role="status"><b>{advice.play ? "Play today." : `Hold: ${advice.better ? `${advice.better.day} gives ${pct(advice.better.chance)}` : "a later day is better"}.`}</b> {advice.why}</p> : null}
      {waiting ? <p className="arc-warn">You already have {waiting} lineup{waiting > 1 ? "s" : ""} waiting on step {current}: if one clears it, a planned lineup whose first game has started by then is lost; one not started moves on.</p> : null}
      {plan.length ? (
        <ol className="arc-schedule">
          {plan.map((p, i) => (
            <li key={i}>
              <p className="arc-when">
                <b>{madridTime(p.lineup.first)}</b> Lineup {i + 1} · step {p.step} ({steps.find((s) => s.number === p.step)?.target} pts) · <b>{pct(p.chance)}</b>
                <span>settles about {madridTime(p.settles)}</span>
              </p>
              {p.lostIf !== null ? <p className="arc-warn">Its first game starts before Lineup {p.lostIf + 1} settles: if Lineup {p.lostIf + 1} clears step {p.step}, this one is lost.</p> : null}
              {p.after !== null && p.lostIf === null ? <p className="arc-sub">If Lineup {p.after + 1} misses, this one retries step {p.step}.</p> : null}
              {p.step > current && p.lostIf === null ? <p className="arc-sub">Moves on to step {p.step} if the lineups before it clear before its first game.</p> : null}
              <LineupCards lineup={p.lineup} captainBonus={captainBonus} />
            </li>
          ))}
        </ol>
      ) : <p className="arc-note">That day&apos;s games cannot fill a lineup from your free cards.</p>}
    </div>
  );
}

export default function ArcadePlanner({ arcade, outlooks, captainBonus }: { arcade: Arcade; outlooks: Map<string, Outlook[]>; captainBonus: number }) {
  const [mode, setMode] = useState<"day" | "teams">("day");
  const [now] = useState(() => Date.now());
  return (
    <section className="arc-plan" aria-labelledby="arc-plan-title">
      <div className="arc-plan-head">
        <h2 id="arc-plan-title">Plan</h2>
        <div className="arc-modes" role="group" aria-label="Plan by">
          <button type="button" aria-pressed={mode === "day"} onClick={() => setMode("day")}>Pick a day</button>
          <button type="button" aria-pressed={mode === "teams"} onClick={() => setMode("teams")}>Pick teams</button>
        </div>
      </div>
      {mode === "day"
        ? <PickDay arcade={arcade} outlooks={outlooks} captainBonus={captainBonus} now={now} />
        : <PickTeams arcade={arcade} outlooks={outlooks} captainBonus={captainBonus} aimDefault={arcade.board?.current ?? 1} />}
    </section>
  );
}
