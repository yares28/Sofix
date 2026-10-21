"use client";

import { useMemo, useState } from "react";
import type { Arcade, ArcadeGame, ArcadeLineup, ArcadeStep } from "../../lib/arcade";
import { bestLineup, bigReward, chanceOf, climb, likelyRange, liveLineup, madridDate, planDay, predicted, SETTLES_AFTER_MS, type Lineup, type Outlook, type StartSource, type StepInfo } from "../../lib/arcadePlan";

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

/** A lineup on Sorare still waiting or playing: not cancelled, not a draft, a card not locked yet or a game live. */
const running = (l: ArcadeLineup) => !l.cancelled && !l.draft && (l.live || l.cards.some((c) => !c.locked));
/** When a lineup on Sorare settles: its last game's kick-off plus the time Sorare takes to count it. */
const settlesOf = (l: ArcadeLineup) => Math.max(0, ...l.cards.map((c) => (c.kickoff ? Date.parse(c.kickoff) : 0))) + SETTLES_AFTER_MS;

/**
 * Where the climb starts. With lives left on the current step, there and now. With none left but lineups waiting, the plan goes on as if
 * the first to settle clears it: the next step from then, its lives less the waiting lineups that have not started by then (they move
 * on with you, owner's answer 8). Cards in a running lineup are held until it settles.
 */
function climbStart(arcade: Arcade, steps: StepInfo[], current: number) {
  const step = arcade.board?.steps.find((s) => s.number === current);
  const waiting = (step?.entered ?? []).filter(running);
  const held = (arcade.board?.steps ?? []).flatMap((s) => s.entered.filter(running).flatMap((l) => l.cards.flatMap((c) => (c.slug ? [{ card: c.slug, until: settlesOf(l) }] : []))));
  const lives = steps.find((s) => s.number === current)?.lives ?? 4;
  if (lives > 0 || !waiting.length || current >= (steps.at(-1)?.number ?? 1)) return { start: { step: current, lives, notBefore: null, held }, waiting, after: null };
  const first = waiting.reduce((a, b) => (settlesOf(a) <= settlesOf(b) ? a : b));
  const at = settlesOf(first);
  const movingOn = waiting.filter((l) => l !== first && l.cards.every((c) => !c.kickoff || Date.parse(c.kickoff) > at)).length;
  return { start: { step: current + 1, lives: Math.max(0, 4 - movingOn), notBefore: at, held }, waiting, after: { at, movingOn } };
}

/** The step the climb is on: Sorare's current step, or the next one once it is cleared (Sorare keeps naming it until its reward is claimed). */
export function climbStep(arcade: Arcade): number {
  const steps = arcade.board?.steps ?? [];
  const current = arcade.board?.current ?? 1;
  const cleared = ["CLAIMABLE", "CLAIMED"].includes(steps.find((s) => s.number === current)?.state ?? "");
  return cleared && steps.some((s) => s.number === current + 1) ? current + 1 : current;
}

/** "Pick a day": the climb to the set's end, day by day; each day's lineups in the order they settle, at the step each lands on. */
function PickDay({ arcade, outlooks, captainBonus, now }: { arcade: Arcade; outlooks: Map<string, Outlook[]>; captainBonus: number; now: number }) {
  const steps = useMemo(() => stepInfos(arcade), [arcade]);
  const current = climbStep(arcade);
  const byDay = useMemo(() => {
    const out = new Map<string, Outlook[]>();
    for (const game of arcade.games ?? []) {
      if (Date.parse(game.kickoff) <= now) continue;
      const day = madridDate(game.kickoff);
      out.set(day, [...(out.get(day) ?? []), ...(outlooks.get(game.id) ?? [])]);
    }
    return [...out.entries()].filter(([, list]) => list.length).sort(([a], [b]) => a.localeCompare(b));
  }, [arcade.games, outlooks, now]);
  const { start, waiting, after } = useMemo(() => climbStart(arcade, steps, current), [arcade, steps, current]);
  const path = useMemo(() => climb(byDay, steps, start, captainBonus), [byDay, steps, start, captainBonus]);
  // With step `current`'s lives all waiting: the chance one of them clears it, and the climb from step 1 if none does.
  const clears = useMemo(() => {
    if (!after) return null;
    const target = steps.find((s) => s.number === current)?.target ?? 0;
    const miss = waiting.reduce((m, l) => {
      const outlookOf = (slug: string | null) => {
        const game = l.cards.find((c) => c.slug === slug)?.game;
        return game ? outlooks.get(game)?.find((o) => o.card.slug === slug) ?? null : null;
      };
      return m * (1 - liveLineup(l.cards, target, outlookOf, now).chance);
    }, 1);
    const allSettled = Math.max(...waiting.map(settlesOf));
    const fallback = climb(byDay, steps, { step: 1, lives: 4, notBefore: allSettled, held: start.held, best: current - 1 }, captainBonus);
    return { chance: 1 - miss, fallback };
  }, [after, waiting, steps, current, outlooks, now, byDay, start.held, captainBonus]);
  const odds = useMemo(() => {
    if (!clears) return path.odds;
    const out: Record<number, number> = { [current]: clears.chance + (1 - clears.chance) * (clears.fallback.odds[current] ?? 0) };
    for (const s of steps) if (s.number > current) out[s.number] = clears.chance * (path.odds[s.number] ?? 0) + (1 - clears.chance) * (clears.fallback.odds[s.number] ?? 0);
    return out;
  }, [clears, path.odds, steps, current]);
  const [day, setDay] = useState<string | null>(null);
  const chosen = path.days.find((d) => d.day === day) ?? path.days[0] ?? null;
  // Only the chosen day's lineups are built: the climb compares days without them.
  const plan = useMemo(() => (chosen?.play ? planDay(chosen.list, steps.map((s) => (s.number === chosen.step ? { ...s, lives: chosen.play } : s)), chosen.step, captainBonus) : []), [chosen, steps, captainBonus]);
  const ahead = steps.filter((s) => s.number >= current && (odds[s.number] ?? 0) >= 0.005);

  if (!byDay.length) return <p className="arc-note">No game of your cards is left before the set ends.</p>;
  return (
    <div className="arc-pick">
      <div className="arc-climb" role="status">
        <p>Playing this plan, your chance to clear each step before the set ends:</p>
        <ul>
          {ahead.length ? ahead.map((s) => <li key={s.number}><span>Step {s.number}</span><b>{pct(odds[s.number]!)}</b><small>{steps.find((x) => x.number === s.number)?.target} pts</small></li>)
            : <li><span>Step {current}</span><b>0%</b><small>no lineup with a chance</small></li>}
        </ul>
      </div>
      {after ? (
        <p className="arc-warn">
          Step {current} has no lives left: your {waiting.length} lineups there are waiting{clears ? `, ${pct(clears.chance)} that one clears it` : ""}. The days below start when the first settles (about {madridDay(new Date(after.at).toISOString())} {madridTime(new Date(after.at).toISOString())}),
          as if it clears: step {current + 1}{after.movingOn ? `, with ${after.movingOn} of your waiting lineups moving on with you` : ""}. If all {waiting.length} miss, you are back on step 1; the chances above count both.
        </p>
      ) : waiting.length ? <p className="arc-warn">You already have {waiting.length} lineup{waiting.length > 1 ? "s" : ""} waiting on step {current}: if one clears it, a planned lineup whose first game has started by then is lost; one not started moves on.</p> : null}
      <div className="arc-days" role="group" aria-label="Day">
        {path.days.map((d) => <button key={d.day} type="button" aria-pressed={d === chosen} onClick={() => setDay(d.day)}>{madridDay(`${d.day}T12:00:00Z`)} · {d.play ? `step ${d.step}, play ${d.play}` : "hold"}</button>)}
      </div>
      {chosen ? (
        <p className={`arc-advice${chosen.play ? " is-play" : ""}`}>
          <b>{chosen.play ? `Play ${chosen.play} lineup${chosen.play > 1 ? "s" : ""} on step ${chosen.step}: ${pct(plan.length ? 1 - plan.filter((p) => p.step === chosen.step).reduce((m, p) => m * (1 - p.chance), 1) : chosen.clear)} that one clears it.` : `Hold: keep your ${chosen.lives} ${chosen.lives === 1 ? "life" : "lives"} on step ${chosen.step}.`}</b>
          {" "}{chosen.play ? (chosen.play < chosen.lives ? `The other ${chosen.lives - chosen.play} wait for a better day.` : "")
            : !chosen.can ? "That day's games cannot fill a lineup from your free cards."
            : chosen === path.days.at(-1) ? "No lineup that day has a real chance; a miss costs a life, and losing the last sends you back to step 1."
            : "Later days give a better chance with your cards; a miss here costs a life, and losing the last sends you back to step 1."}
          {" "}This day starts on step {chosen.step} with {chosen.lives} {chosen.lives === 1 ? "life" : "lives"}{chosen === path.days[0] ? "" : ", if the days before go as planned"}.
        </p>
      ) : null}
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
      ) : chosen?.play === 0 ? null : <p className="arc-note">That day&apos;s games cannot fill a lineup from your free cards.</p>}
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
        : <PickTeams arcade={arcade} outlooks={outlooks} captainBonus={captainBonus} aimDefault={climbStep(arcade)} />}
    </section>
  );
}
