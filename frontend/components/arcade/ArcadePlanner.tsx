"use client";

import { useContext, useMemo, useState, type CSSProperties } from "react";
import type { Arcade, ArcadeGame, ArcadeLineup, ArcadeStep } from "../../lib/arcade";
import { FdrChip, FdrContext } from "./Fdr";
import { bestLineup, bigReward, chanceOf, climb, likelyRange, liveLineup, madridDate, planDay, predicted, SETTLES_AFTER_MS, type Lineup, type Outlook, type Planned, type StartSource, type StepInfo } from "../../lib/arcadePlan";

const SOURCE: Record<StartSource, string> = { sorare: "Sorare", futbolfantasy: "Futbol Fantasy", sofix: "Sofix" };
const SLOT: Record<string, string> = { GK: "Goalkeeper", DEF: "Defender", MID: "Midfielder", FWD: "Forward", EXTRA: "Extra" };
export const madridDay = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Europe/Madrid", weekday: "short", day: "numeric", month: "short" });
export const madridTime = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });
export const pct = (x: number) => `${Math.round(x * 100)}%`;
export const pts = (x: number) => Math.round(x).toLocaleString("en-GB");
const dayOf = (day: string) => madridDay(`${day}T12:00:00Z`);
const weekday = (day: string) => dayOf(day).split(" ")[0]!;
/** A leg's days: "Thu" or "Thu–Fri". */
const legDays = (leg: { day: string; to: string }) => (leg.to === leg.day ? weekday(leg.day) : `${weekday(leg.day)}–${weekday(leg.to)}`);

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
    <span className="arc-pred" title={`${outlook.scoreSource === "sofix" ? "Sofix's xScore" : outlook.scoreSource === "sorare" ? "Sorare's projection" : "his average when he plays (Sorare has no projection yet)"} × start % × Sorare's bonus${range ? `; he scored ${pts(range[0])}–${pts(range[1])} in 6 of 10 recent games he played` : ""}`}>
      <b>{pts(value)}</b> pts{range ? <small> · {pts(range[0])}–{pts(range[1])} if he plays</small> : null}
    </span>
  );
}

export function LineupCards({ lineup, captainBonus }: { lineup: Lineup; captainBonus: number }) {
  return (
    <ol className="arc-lineup">
      {lineup.picks.map(({ slot, outlook, captain }, i) => (
        <li key={outlook.card.slug} style={{ "--i": i } as CSSProperties}>
          <span className="arc-slot">{SLOT[slot]}{captain && captainBonus > 0 ? <b className="arc-captain" title="Captain">C</b> : null}</span>
          {outlook.card.picture
            // eslint-disable-next-line @next/next/no-img-element -- Sorare's card art, as on the other pages
            ? <img src={outlook.card.picture} alt={outlook.card.name} width={120} height={194} loading="lazy" />
            : <div className="arc-card-blank">{outlook.card.name}</div>}
          <span className="arc-card-name">{outlook.card.name}</span>
          <Prediction outlook={outlook} captain={captain} captainBonus={captainBonus} />
          {/postpon|cancel|suspend/i.test(outlook.game.status) ? <span className="arc-warn">Game {outlook.game.status.toLowerCase()}</span> : null}
          <span className="arc-meta"><StartLabel outlook={outlook} /> · {madridTime(outlook.game.kickoff)} <FdrChip game={outlook.game.id} home={outlook.game.home?.slug === outlook.card.teamSlug} position={SLOT[slot] === "Extra" ? outlook.card.positions[0] : SLOT[slot]} /></span>
        </li>
      ))}
    </ol>
  );
}

/** The lineup's expected total and its chance against every step's target, as a list (kept for screen readers and the phone). */
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

/** A club's crest: Sorare's from the game, else from one of your cards of that club, else its initials on a shield. */
function Crest({ team, crests }: { team: ArcadeGame["home"]; crests: Map<string, string> }) {
  const src = team?.crest ?? (team ? crests.get(team.slug) : undefined);
  // eslint-disable-next-line @next/next/no-img-element -- Sorare's crest, as on the other pages
  return src ? <img className="arc-crest" src={src} alt={team?.name ?? ""} width={32} height={32} loading="lazy" /> : <span className="arc-crest is-blank" aria-hidden="true">{(team?.name ?? "?").slice(0, 2)}</span>;
}
const crestsOf = (arcade: Arcade) => new Map(arcade.cards.flatMap((c) => (c.teamSlug && c.teamPicture ? [[c.teamSlug, c.teamPicture] as const] : [])));

/** Where a lineup's total lands against each step: its likely range, its expected total, and its chance at every target. */
function Scale({ lineup, steps, aim }: { lineup: Lineup; steps: ArcadeStep[]; aim: number }) {
  const lo = lineup.totals[Math.floor(lineup.totals.length * 0.2)] ?? 0;
  const hi = lineup.totals[Math.floor(lineup.totals.length * 0.8)] ?? 0;
  const top = Math.max(...steps.map((s) => s.target), hi) * 1.08;
  const floor = Math.min(...steps.map((s) => s.target), lo) * 0.8;
  const at = (v: number) => `${Math.max(0, Math.min(100, ((v - floor) / (top - floor)) * 100))}%`;
  return (
    <aside className="arc-scale" aria-label={`Where ${pts(lineup.expected)} lands`}>
      <h3>Where {pts(lineup.expected)} lands</h3>
      <div className="arc-scale-track">
        <span className="arc-scale-band" style={{ bottom: at(lo), height: `calc(${at(hi)} - ${at(lo)})` }} aria-hidden="true" />
        <span className="arc-scale-mark" style={{ bottom: at(lineup.expected) }} aria-hidden="true" />
        {steps.map((s) => {
          const chance = chanceOf(lineup.totals, s.target);
          return (
            <span key={s.id} className={`arc-scale-tick${s.number === aim ? " is-aim" : ""}`} style={{ bottom: at(s.target) }}>
              <small>Step {s.number}</small><span>{s.target}</span><b className={chance >= 0.6 ? "is-good" : chance >= 0.4 ? "is-mid" : "is-low"}>{pct(chance)}</b>
            </span>
          );
        })}
      </div>
      <p className="arc-sub">{pts(lo)}–{pts(hi)} in 6 of 10 simulated games.</p>
    </aside>
  );
}

/** Pitch spots for the five slots (left %, top %), as a lineup stands. */
const SPOT: Record<string, [number, number]> = { FWD: [40, 22], EXTRA: [72, 27], MID: [55, 50], DEF: [27, 58], GK: [50, 79] };

/** The lineup on a pitch: the card art where each slot stands, its points and start %. */
function Pitch({ lineup, captainBonus, title }: { lineup: Lineup; captainBonus: number; title: string }) {
  const lo = lineup.totals[Math.floor(lineup.totals.length * 0.2)] ?? 0;
  const hi = lineup.totals[Math.floor(lineup.totals.length * 0.8)] ?? 0;
  return (
    <div className="arc-pitch">
      <div className="arc-pitch-lines" aria-hidden="true" />
      <div className="arc-pitch-head">
        <span>{title}</span>
        <b>{pts(lineup.expected)}</b>
        <span>likely {pts(lo)} to {pts(hi)} points</span>
      </div>
      <ol>
        {lineup.picks.map(({ slot, outlook, captain }, i) => {
          const [left, top] = SPOT[slot] ?? [50, 50];
          return (
            <li key={outlook.card.slug} className={captain && captainBonus > 0 ? "is-captain" : undefined} style={{ left: `${left}%`, top: `${top}%`, "--i": i } as CSSProperties}>
              {outlook.card.picture
                // eslint-disable-next-line @next/next/no-img-element -- Sorare's card art, as on the other pages
                ? <img src={outlook.card.picture} alt={outlook.card.name} width={96} height={155} loading="lazy" />
                : <div className="arc-card-blank">{outlook.card.name}</div>}
              <span><b>{captain && captainBonus > 0 ? "C · " : ""}{SLOT[slot] === "Extra" ? "+1" : slot}</b> ~{pts(predicted(outlook, captain, captainBonus) ?? 0)} <small>{outlook.start === null ? "no %" : pct(outlook.start)}</small></span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** "Pick teams": choose games as tickets, Sofix builds the lineup with the best chance at the step you aim at and shows where it lands. */
function PickTeams({ arcade, outlooks, captainBonus, aimDefault }: { arcade: Arcade; outlooks: Map<string, Outlook[]>; captainBonus: number; aimDefault: number }) {
  const steps = arcade.board?.steps ?? [];
  const boards = useContext(FdrContext);
  const crests = useMemo(() => crestsOf(arcade), [arcade]);
  const [now] = useState(() => Date.now());
  const games = useMemo(() => (arcade.games ?? []).filter((g) => Date.parse(g.kickoff) > now && (outlooks.get(g.id) ?? []).length), [arcade.games, outlooks, now]);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(games.slice(0, 8).map((g) => g.id)));
  const [aim, setAim] = useState(aimDefault);
  const target = steps.find((s) => s.number === aim)?.target ?? steps[0]?.target ?? 0;
  const lineup = useMemo(() => bestLineup([...chosen].flatMap((id) => outlooks.get(id) ?? []), target, captainBonus), [chosen, outlooks, target, captainBonus]);
  const toggle = (id: string) => setChosen((was) => { const next = new Set(was); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  // The games where one of your clubs is favourite on Sofix's board (difficulty 1 or 2).
  const easy = games.filter((g) => {
    const f = boards.get(g.id);
    if (!f) return false;
    const mine = new Set((outlooks.get(g.id) ?? []).map((o) => o.card.teamSlug));
    return (mine.has(g.home?.slug ?? null) && f.home.bucket <= 2) || (mine.has(g.away?.slug ?? null) && f.away.bucket <= 2);
  });

  return (
    <div className="arc-teams">
      <div className="arc-teams-bar">
        <label className="arc-aim">Aim at
          <select value={aim} onChange={(e) => setAim(Number(e.target.value))}>
            {steps.map((s) => <option key={s.id} value={s.number}>Step {s.number} · {s.target} pts</option>)}
          </select>
        </label>
        <button type="button" className="arc-small" onClick={() => setChosen(new Set(easy.map((g) => g.id)))} disabled={!easy.length} title="Games where Sofix's board makes one of your clubs favourite (difficulty 1 or 2): LaLiga, Premier League and Bundesliga">
          Easiest games ({easy.length})
        </button>
        <button type="button" className="arc-small" onClick={() => setChosen(new Set())} disabled={!chosen.size}>Clear</button>
      </div>
      <div className="arc-tickets" role="group" aria-label="Games to pick from">
        {games.map((g, i) => {
          const f = boards.get(g.id);
          const on = chosen.has(g.id);
          return (
            <button key={g.id} type="button" className="arc-ticket" aria-pressed={on} onClick={() => toggle(g.id)} style={{ "--i": Math.min(i, 12) } as CSSProperties}>
              <small>{g.competition.name}</small>
              <span className="arc-ticket-crests"><Crest team={g.home} crests={crests} /><i>v</i><Crest team={g.away} crests={crests} /></span>
              <span className="arc-ticket-name">{g.home?.name ?? "?"} v {g.away?.name ?? "?"}</span>
              <span className="arc-ticket-foot">
                <b>{madridDay(g.kickoff).split(" ")[0]} {madridTime(g.kickoff)}</b>
                <span>{(outlooks.get(g.id) ?? []).length} of your cards</span>
              </span>
              {f ? <span className="arc-ticket-fdr" title="Sofix's difficulty, home and away (1 easiest)"><span className={`f${f.home.bucket}`}>{f.home.bucket}</span><span className={`f${f.away.bucket}`}>{f.away.bucket}</span></span> : null}
              {on ? <span className="arc-stamp" aria-hidden="true">IN</span> : null}
            </button>
          );
        })}
      </div>
      {lineup ? (
        <div className="arc-pitch-wrap">
          <Pitch lineup={lineup} captainBonus={captainBonus} title={`Best five from your ${chosen.size} game${chosen.size === 1 ? "" : "s"}`} />
          <Scale lineup={lineup} steps={steps} aim={aim} />
          <details className="arc-detail">
            <summary>Each card&apos;s numbers</summary>
            <LineupCards lineup={lineup} captainBonus={captainBonus} />
            <Chances lineup={lineup} steps={steps} aim={aim} />
          </details>
        </div>
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

/** Time digits as the departures board shows them: one tile a character. */
const Flip = ({ text }: { text: string }) => <span className="arc-flip" aria-hidden="true">{[...text].map((c, i) => <span key={i} aria-hidden="true" style={{ "--i": i } as CSSProperties}>{c}</span>)}</span>;

/** The chance a lineup reaches its target, as a ring around its expected total. */
function Ring({ lineup, target }: { lineup: Lineup; target: number }) {
  const chance = chanceOf(lineup.totals, target);
  return (
    <div className="arc-ring" style={{ "--p": chance } as CSSProperties} role="img" aria-label={`${pct(chance)} to reach ${target}`}>
      <span><b>{pts(lineup.expected)}</b><small>needs {target}</small><small>{pct(chance)}</small></span>
    </div>
  );
}

/** "Pick a day": the climb to the set's end as the tower and the departures board; the day's lineups in the order they settle. */
function PickDay({ arcade, outlooks, captainBonus, now, end }: { arcade: Arcade; outlooks: Map<string, Outlook[]>; captainBonus: number; now: number; end: string | null }) {
  const steps = useMemo(() => stepInfos(arcade), [arcade]);
  const boardSteps = arcade.board?.steps ?? [];
  const current = climbStep(arcade);
  const crests = useMemo(() => crestsOf(arcade), [arcade]);
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
  // Opens on the first day you play (a held day says so in the strip above).
  const chosen = path.days.find((d) => d.day === day) ?? path.days.find((d) => d.play) ?? path.days[0] ?? null;
  // Only the chosen day's lineups are built: the climb compares days without them.
  const plan = useMemo(() => (chosen?.play ? planDay(chosen.list, steps.map((s) => (s.number === chosen.step ? { ...s, lives: chosen.play } : s)), chosen.step, captainBonus) : []), [chosen, steps, captainBonus]);
  const [deck, setDeck] = useState(0);
  const onDeck: Planned | undefined = plan[Math.min(deck, plan.length - 1)];
  // The headline: the highest step still ahead with a real chance (one in four or better), else the step you are on.
  const ahead = boardSteps.filter((s) => s.number >= current);
  const headline = [...ahead].reverse().find((s) => (odds[s.number] ?? 0) >= 0.25) ?? ahead[0] ?? null;
  const lives = start.step === current ? start.lives : 0;
  // Each step's own leg on the likely path: its days and the lineup planned for it.
  const legOf = (n: number) => path.days.find((d) => d.step === n && d.play) ?? null;
  const dayClear = chosen && plan.length ? 1 - plan.filter((p) => p.step === chosen.step).reduce((m, p) => m * (1 - p.chance), 1) : chosen?.clear ?? 0;

  if (!byDay.length) return <p className="arc-note">No game of your cards is left before the set ends.</p>;
  return (
    <div className="arc-climbview">
      <div className="arc-headline" role="status">
        <span className="arc-headline-num">{headline ? pct(odds[headline.number] ?? 0) : "0%"}</span>
        <div>
          <p>to clear <b>step {headline?.number ?? current}</b>{headline?.rewards.length ? <> for <span className="arc-prize">{headline.rewards.join(" + ")}</span></> : null} before the set ends{end ? ` (${madridDay(end)}, ${madridTime(end)})` : ""}.</p>
          <p className="arc-lives-line" aria-label={`${lives} of 4 lives left on step ${current}`}>
            {[0, 1, 2, 3].map((i) => <span key={i} className={i < lives ? "is-on" : undefined} aria-hidden="true" />)}
            <span>{after ? `step ${current}: all 4 lives waiting${clears ? `, ${pct(clears.chance)} one clears it` : ""}` : `${lives} ${lives === 1 ? "life" : "lives"} on step ${current}`}</span>
          </p>
        </div>
      </div>
      {after ? (
        <p className="arc-warn">
          The days below start when your first waiting lineup settles (about {madridDay(new Date(after.at).toISOString())} {madridTime(new Date(after.at).toISOString())}), as if it clears: step {current + 1}{after.movingOn ? `, with ${after.movingOn} of your waiting lineups moving on with you` : ""}. If all {waiting.length} miss, you are back on step 1; the chances count both.
        </p>
      ) : waiting.length ? <p className="arc-warn">You already have {waiting.length} lineup{waiting.length > 1 ? "s" : ""} waiting on step {current}: if one clears it, a planned lineup whose first game has started by then is lost; one not started moves on.</p> : null}
      <div className="arc-days" role="group" aria-label="Day">
        {path.days.map((d) => <button key={d.day} type="button" aria-pressed={d === chosen} onClick={() => { setDay(d.day); setDeck(0); }}>{d.to === d.day ? dayOf(d.day) : legDays(d)} · {d.play ? `step ${d.step}, play ${d.play}` : "hold"}</button>)}
      </div>
      <div className="arc-climb-grid">
        <section className="arc-tower" aria-labelledby="arc-tower-title">
          <h3 id="arc-tower-title">The tower</h3>
          <ol>
            {[...boardSteps].reverse().map((s) => {
              const done = s.number < current || s.state === "CLAIMED" || s.state === "CLAIMABLE";
              const leg = done ? null : legOf(s.number);
              const fan = onDeck && onDeck.step === s.number ? onDeck.lineup.picks : leg?.lineups[0]?.picks ?? [];
              return (
                <li key={s.id} className={`arc-floor${s.number === current ? " is-current" : ""}${done ? " is-done" : ""}`} aria-current={s.number === current ? "step" : undefined}>
                  <span className="arc-floor-level">Step {s.number}</span>
                  <b className="arc-floor-target">{s.target}</b>
                  <span className="arc-floor-reward">{s.rewards.join(" + ") || "no reward"}</span>
                  <span className="arc-fan" aria-hidden={!fan.length}>
                    {fan.map((p) => (p.outlook.card.picture
                      // eslint-disable-next-line @next/next/no-img-element -- Sorare's card art, as on the other pages
                      ? <img key={p.outlook.card.slug} src={p.outlook.card.picture} alt={p.outlook.card.name} width={40} height={65} loading="lazy" />
                      : null))}
                  </span>
                  <span className="arc-floor-odds">{done ? <b>✓</b> : <b>{pct(odds[s.number] ?? 0)}</b>}<small>{done ? "cleared" : leg ? legDays(leg) : (odds[s.number] ?? 0) > 0 ? "later" : "out of reach"}</small></span>
                </li>
              );
            })}
          </ol>
        </section>
        <div className="arc-side">
          <section className="arc-departures" aria-labelledby="arc-dep-title">
            <div className="arc-dep-head">
              <h3 id="arc-dep-title">Departures · {chosen ? (chosen.to === chosen.day ? dayOf(chosen.day) : legDays(chosen)) : ""}</h3>
              <span>each in the order it settles</span>
            </div>
            {chosen && chosen.play ? (
              <ol className="arc-dep-rows">
                {plan.map((p, i) => {
                  const games = [...new Map(p.lineup.picks.map((x) => [x.outlook.game.id, x.outlook.game])).values()];
                  return (
                    <li key={i}>
                      <button type="button" aria-pressed={i === deck} onClick={() => setDeck(i)} aria-label={`Lineup ${i + 1}, ${madridTime(p.lineup.first)}, step ${p.step}, ${pct(p.chance)}`}>
                        <Flip text={madridTime(p.lineup.first)} />
                        <span className="arc-dep-flight">Lineup {i + 1}</span>
                        <span className="arc-dep-to">Step {p.step}<small>{steps.find((s) => s.number === p.step)?.target} pts</small></span>
                        <span className="arc-dep-games">{games.slice(0, 3).map((g) => <span key={g.id}><Crest team={g.home} crests={crests} /><i>v</i><Crest team={g.away} crests={crests} /></span>)}{games.length > 3 ? <small>+{games.length - 3}</small> : null}</span>
                        <Flip text={pct(p.chance)} />
                      </button>
                    </li>
                  );
                })}
              </ol>
            ) : null}
            {chosen ? (
              <p className={`arc-advice${chosen.play ? " is-play" : ""}`}>
                <b>{chosen.play ? `Play ${chosen.play} lineup${chosen.play > 1 ? "s" : ""} on step ${chosen.step}: ${pct(dayClear)} that one clears it.` : `Hold: keep your ${chosen.lives} ${chosen.lives === 1 ? "life" : "lives"} on step ${chosen.step}.`}</b>
                {" "}{chosen.play ? (chosen.play < chosen.lives ? `The other ${chosen.lives - chosen.play} wait for a better day.` : "")
                  : !chosen.can ? "That day's games cannot fill a lineup from your free cards."
                  : chosen === path.days.at(-1) ? "No lineup that day has a real chance; a miss costs a life, and losing the last sends you back to step 1."
                  : "Later days give a better chance with your cards; a miss here costs a life, and losing the last sends you back to step 1."}
                {" "}{chosen.to === chosen.day ? "This day" : `${legDays(chosen)} (lineups take games from these days)`} starts on step {chosen.step} with {chosen.lives} {chosen.lives === 1 ? "life" : "lives"}{chosen === path.days[0] ? "" : ", if the days before go as planned; a miss there means the plan is rebuilt from where you are"}.
              </p>
            ) : null}
          </section>
          {onDeck ? (
            <section className="arc-deck" aria-labelledby="arc-deck-title">
              <Ring lineup={onDeck.lineup} target={steps.find((s) => s.number === onDeck.step)?.target ?? 0} />
              <div className="arc-deck-body">
                <h3 id="arc-deck-title">Lineup {Math.min(deck, plan.length - 1) + 1} boards {weekday(madridDate(onDeck.lineup.first))} {madridTime(onDeck.lineup.first)}</h3>
                <p className="arc-sub">Step {onDeck.step} · settles about {madridTime(onDeck.settles)}</p>
                {onDeck.lostIf !== null ? <p className="arc-warn">Its first game starts before Lineup {onDeck.lostIf + 1} settles: if Lineup {onDeck.lostIf + 1} clears step {onDeck.step}, this one is lost.</p> : null}
                {onDeck.after !== null && onDeck.lostIf === null ? <p className="arc-sub">If Lineup {onDeck.after + 1} misses, this one retries step {onDeck.step}.</p> : null}
                {onDeck.step > chosen!.step && onDeck.lostIf === null ? <p className="arc-sub">Moves on to step {onDeck.step} if the lineups before it clear before its first game.</p> : null}
              </div>
              <LineupCards lineup={onDeck.lineup} captainBonus={captainBonus} />
            </section>
          ) : chosen?.play && !plan.length ? <p className="arc-note">That day&apos;s games cannot fill a lineup from your free cards.</p> : null}
        </div>
      </div>
    </div>
  );
}

export default function ArcadePlanner({ arcade, outlooks, captainBonus }: { arcade: Arcade; outlooks: Map<string, Outlook[]>; captainBonus: number }) {
  const [mode, setMode] = useState<"day" | "teams">("day");
  const [now] = useState(() => Date.now());
  return (
    <section className="arc-plan" aria-labelledby="arc-plan-title">
      <div className="arc-plan-head">
        <h2 id="arc-plan-title">Your climb</h2>
        <div className="arc-modes" role="group" aria-label="Plan by">
          <button type="button" aria-pressed={mode === "day"} onClick={() => setMode("day")}>Pick a day</button>
          <button type="button" aria-pressed={mode === "teams"} onClick={() => setMode("teams")}>Pick teams</button>
        </div>
      </div>
      {mode === "day"
        ? <PickDay arcade={arcade} outlooks={outlooks} captainBonus={captainBonus} now={now} end={arcade.set.end} />
        : <PickTeams arcade={arcade} outlooks={outlooks} captainBonus={captainBonus} aimDefault={climbStep(arcade)} />}
    </section>
  );
}
