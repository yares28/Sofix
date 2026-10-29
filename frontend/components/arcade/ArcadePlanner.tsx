"use client";

import { useContext, useMemo, useState, type CSSProperties } from "react";
import type { Arcade, ArcadeGame, ArcadeLineup, ArcadeStep } from "../../lib/arcade";
import { climbWindows, WINDOW_MS, type Climb, type Move } from "../../lib/arcadeClimb";
import type { PlayerStatus } from "../../lib/arcadeTeams";
import { FdrChip, FdrContext } from "./Fdr";
import ArcadeTeams from "./ArcadeTeams";
import { bestLineup, bigReward, cashOf, chanceOf, likelyRange, madridDate, predicted, SETTLES_AFTER_MS, type Lineup, type Outlook, type StartSource, type StepInfo } from "../../lib/arcadePlan";

const SOURCE: Record<StartSource, string> = { sorare: "Sorare", futbolfantasy: "Futbol Fantasy", sofix: "Sofix" };
const SLOT: Record<string, string> = { GK: "Goalkeeper", DEF: "Defender", MID: "Midfielder", FWD: "Forward", EXTRA: "Extra" };
export const madridDay = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Europe/Madrid", weekday: "short", day: "numeric", month: "short" });
export const madridTime = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });
export const pct = (x: number) => `${Math.round(x * 100)}%`;
export const pts = (x: number) => Math.round(x).toLocaleString("en-GB");
const iso = (ms: number) => new Date(ms).toISOString();
const weekday = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { timeZone: "Europe/Madrid", weekday: "short" });
/** "Sat 16:15", or "16:15" when it is today. */
const when = (ms: number, now: number) => (madridDate(iso(ms)) === madridDate(iso(now)) ? madridTime(iso(ms)) : `${weekday(ms)} ${madridTime(iso(ms))}`);
/** A settle time beside a kick-off: the time, with the day when it is another day. */
const settleLabel = (settles: number, at: number) => (madridDate(iso(settles)) === madridDate(iso(at)) ? madridTime(iso(settles)) : `${weekday(settles)} ${madridTime(iso(settles))}`);

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
export function Crest({ team, crests }: { team: ArcadeGame["home"]; crests: Map<string, string> }) {
  const src = team?.crest ?? (team ? crests.get(team.slug) : undefined);
  // eslint-disable-next-line @next/next/no-img-element -- Sorare's crest, as on the other pages
  return src ? <img className="arc-crest" src={src} alt={team?.name ?? ""} width={32} height={32} loading="lazy" /> : <span className="arc-crest is-blank" aria-hidden="true">{(team?.name ?? "?").slice(0, 2)}</span>;
}
export const crestsOf = (arcade: Arcade) => new Map(arcade.cards.flatMap((c) => (c.teamSlug && c.teamPicture ? [[c.teamSlug, c.teamPicture] as const] : [])));

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

/**
 * "Pick teams": choose games as tickets, Sofix builds the lineup with the best chance at the step you aim at and shows where it lands.
 * The tickets are the owner's (29 Oct: "leave it as is"); the games picked and the aim live in ArcadePlanner, so Your move and the teams
 * to build around can hand games over. Cards already in a lineup of yours on Sorare are left out until it settles.
 */
function PickTeams({ arcade, outlooks, captainBonus, chosen, setChosen, aim, setAim, busy, now }: {
  arcade: Arcade; outlooks: Map<string, Outlook[]>; captainBonus: number; chosen: Set<string>; setChosen: (next: Set<string>) => void; aim: number; setAim: (n: number) => void; busy: Set<string>; now: number;
}) {
  const steps = arcade.board?.steps ?? [];
  const boards = useContext(FdrContext);
  const crests = useMemo(() => crestsOf(arcade), [arcade]);
  const games = useMemo(() => (arcade.games ?? []).filter((g) => Date.parse(g.kickoff) > now && (outlooks.get(g.id) ?? []).length), [arcade.games, outlooks, now]);
  const target = steps.find((s) => s.number === aim)?.target ?? steps[0]?.target ?? 0;
  const lineup = useMemo(() => bestLineup([...chosen].flatMap((id) => outlooks.get(id) ?? []).filter((o) => !busy.has(o.card.slug)), target, captainBonus), [chosen, outlooks, target, captainBonus, busy]);
  const toggle = (id: string) => { const next = new Set(chosen); if (next.has(id)) next.delete(id); else next.add(id); setChosen(next); };
  // The games where one of your clubs is favourite on Sofix's board (difficulty 1 or 2).
  const easy = games.filter((g) => {
    const f = boards.get(g.id);
    if (!f) return false;
    const mine = new Set((outlooks.get(g.id) ?? []).map((o) => o.card.teamSlug));
    return (mine.has(g.home?.slug ?? null) && f.home.bucket <= 2) || (mine.has(g.away?.slug ?? null) && f.away.bucket <= 2);
  });
  const settles = lineup ? Date.parse(lineup.last) + SETTLES_AFTER_MS : null;
  const open = steps.filter((s) => !["CLAIMED", "CLAIMABLE"].includes(s.state));

  return (
    <div className="arc-teams">
      <div className="arc-teams-bar">
        <label className="arc-aim">Aim at
          <select value={aim} onChange={(e) => setAim(Number(e.target.value))}>
            {(open.length ? open : steps).map((s) => <option key={s.id} value={s.number}>Step {s.number} · {s.target} pts</option>)}
          </select>
        </label>
        <button type="button" className="arc-small" onClick={() => setChosen(new Set(easy.map((g) => g.id)))} disabled={!easy.length} title="Games where Sofix's board makes one of your clubs favourite (difficulty 1 or 2): LaLiga, Premier League, Bundesliga, Ligue 1 and their European games">
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
          <Pitch lineup={lineup} captainBonus={captainBonus} title={`Best five from your ${chosen.size} game${chosen.size === 1 ? "" : "s"} · settles about ${when(settles!, now)}`} />
          <Scale lineup={lineup} steps={steps} aim={aim} />
          <details className="arc-detail">
            <summary>Each card&apos;s numbers</summary>
            <LineupCards lineup={lineup} captainBonus={captainBonus} />
            <Chances lineup={lineup} steps={steps} aim={aim} />
          </details>
        </div>
      ) : <p className="arc-note">{chosen.size ? "These games cannot fill a goalkeeper, defender, midfielder, forward and one more outfield card from your free cards." : "Pick at least one game."}</p>}
    </div>
  );
}

/** Each step's target, lives left (Sorare's count for a started step, else the full 4) and whether its reward is big. */
function stepInfos(arcade: Arcade): StepInfo[] {
  return (arcade.board?.steps ?? []).map((s) => ({ number: s.number, target: s.target, lives: s.lineups?.remaining ?? s.lineups?.max ?? 4, big: bigReward(s.rewards), cash: cashOf(s.rewards) }));
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

/** A move's lineups built exactly (simulated), each aimed at its step, no player twice. */
function exactLineups(move: Move, target: number, captainBonus: number): Lineup[] {
  const used = new Set<string>();
  const out: Lineup[] = [];
  for (let k = 0; k < move.play; k++) {
    const lineup = bestLineup(move.list.filter((o) => !used.has(o.card.player)), target, captainBonus);
    if (!lineup) break;
    out.push(lineup);
    lineup.picks.forEach((p) => used.add(p.outlook.card.player));
  }
  return out;
}

const VERB: Record<Climb["verdict"]["kind"], string> = { play: "Play now", wait: "Wait", spend: "Spend them now", none: "Nothing to play yet" };

/** Your move: play, wait or spend your lives, why, and the lineup to enter. */
function YourMove({ plan, steps, boardSteps, current, lives, captainBonus, now, onBuild, waitingNote, busy }: {
  plan: Climb; steps: StepInfo[]; boardSteps: ArcadeStep[]; current: number; lives: number; captainBonus: number; now: number; onBuild: (games: string[], step: number) => void; waitingNote: string | null; busy: Set<string>;
}) {
  const move = plan.path[0] ?? null;
  const target = (n: number) => steps.find((s) => s.number === n)?.target ?? 0;
  const lineups = useMemo(() => (move ? exactLineups(move, target(move.step), captainBonus) : []), [move, captainBonus]); // eslint-disable-line react-hooks/exhaustive-deps
  const [shown, setShown] = useState(0);
  const lineup = lineups[Math.min(shown, lineups.length - 1)] ?? null;
  const v = plan.verdict;
  const step = boardSteps.find((s) => s.number === current);
  const playsNow = move && move.from === 0 && v.kind !== "wait";
  const clear = lineups.length ? 1 - lineups.reduce((m, l) => m * (1 - chanceOf(l.totals, target(move!.step))), 1) : move?.clear ?? 0;
  const title = v.kind === "wait" && v.waitFor ? `Wait for ${when(v.waitFor.at, now)}` : v.kind === "spend" && move ? (move.play === 1 ? "Spend your last life now" : `Spend all ${move.play} lives now`) : VERB[v.kind];
  // The bar (owner, 29 Oct): the step you are on, the lineup you would enter now against the best one from the games you would wait for.
  const holdAt = v.kind === "wait" && v.waitFor ? plan.windows.findIndex((w) => w.at === v.waitFor!.at) : 1;
  const holdWindow = plan.windows[holdAt] ?? null;
  const playLineup = useMemo(() => (lineup && move?.from === 0 ? lineup : plan.windows[0] ? bestLineup(plan.windows[0].list.filter((o) => !busy.has(o.card.slug)), target(current), captainBonus) : null), [lineup, move, plan.windows, busy, current, captainBonus]); // eslint-disable-line react-hooks/exhaustive-deps
  const holdLineup = useMemo(() => (holdWindow ? bestLineup(holdWindow.list.filter((o) => !busy.has(o.card.slug)), target(current), captainBonus) : null), [holdWindow, busy, current, captainBonus]); // eslint-disable-line react-hooks/exhaustive-deps
  const playChance = playLineup ? chanceOf(playLineup.totals, target(current)) : 0;
  const holdChance = holdLineup ? chanceOf(holdLineup.totals, target(current)) : null;
  const holdWins = v.kind === "wait";
  // The reason in one line; the numbers are in the bar below it.
  const why = v.kind === "play" ? (holdChance !== null && holdChance > playChance + 0.005 && lives > 1
      ? `${when(holdWindow!.at, now)} is a little better, but playing now keeps that try: miss and you still have ${lives - 1} ${lives - 1 === 1 ? "life" : "lives"} for it.`
      : holdChance === null ? "No later game before the set ends." : "Every window you skip is a try lost.")
    : v.kind === "wait" && v.waitFor ? `Worth the ${v.skipped} window${v.skipped === 1 ? "" : "s"} it costs: those games are clearly better for this step.`
    : v.kind === "spend" && move ? `If it misses you are back on step 1 about ${when(move.settles, now)}, and the steps below come back fast.`
    : "Your free cards cannot fill a lineup from any game Sorare lists yet (cards in a lineup still running are held until it settles).";
  // Whether the lineup's start % will all be known before it is entered: its games kick off together (within the 75-minute window).
  const together = lineup ? Date.parse(lineup.last) - Date.parse(lineup.first) <= WINDOW_MS : true;
  const share = (p: number | null) => Math.max(0.18, p ?? 0); // each side keeps room for its label
  return (
    <section className={`arc-move is-${v.kind}`} aria-labelledby="arc-move-title">
      <div className="arc-move-main">
        <p className="arc-move-kicker">
          <span>Step {current} · {step?.target ?? ""} pts</span>
          <span className="arc-lives" aria-label={`${lives} of 4 lives`}>{[0, 1, 2, 3].map((i) => <i key={i} className={i < lives ? "is-on" : undefined} aria-hidden="true" />)}</span>
          {step?.rewards.length ? <span className="arc-move-prize">{step.rewards.join(" + ")}</span> : null}
        </p>
        <h2 id="arc-move-title" className="arc-move-verdict">{title}</h2>
        <p className="arc-move-why">{why}</p>
        {waitingNote ? <p className="arc-warn">{waitingNote}</p> : null}
        {v.kind !== "none" ? (
          <figure className="arc-split">
            <figcaption>Chance to clear step {current} ({target(current)} pts)</figcaption>
            <div role="img" aria-label={`${holdWins ? "Hold" : "Play"}: ${pct(playChance)} with the lineup now, ${holdChance === null ? "no later game" : `${pct(holdChance)} with ${when(holdWindow!.at, now)}'s games`}`}>
              <span className={holdWins ? undefined : "is-pick"} style={{ flexGrow: share(playChance) }}><small>Play{plan.windows[0] ? ` · ${madridTime(iso(plan.windows[0].at))}` : ""}</small><b>{pct(playChance)}</b></span>
              <span className={holdWins ? "is-pick" : undefined} style={{ flexGrow: share(holdChance) }}><small>Hold{holdWindow ? ` · ${madridTime(iso(holdWindow.at))}` : ""}</small><b>{holdChance === null ? "—" : pct(holdChance)}</b></span>
            </div>
          </figure>
        ) : null}
        {move ? (
          <div className="arc-move-entry">
            <div className="arc-move-entry-head">
              {playsNow && move.play === 1 ? null : <span className="arc-move-chance"><b>{pct(lineup ? chanceOf(lineup.totals, target(move.step)) : move.clear)}</b><small>{playsNow ? "this lineup clears it" : `ready for ${when(move.at, now)}`}</small></span>}
              <span className="arc-move-times">
                {lineup ? <span>{together ? `All five play at ${madridTime(lineup.first)}: you see the official lineups before you enter.` : `Its games run ${madridTime(lineup.first)} to ${madridTime(lineup.last)}: the later cards' start % can still change after you enter.`}</span> : null}
                <span>Enter before <b>{when(lineup ? Date.parse(lineup.first) : move.at, now)}</b></span>
                <span>Settles about <b>{when(lineup ? Date.parse(lineup.last) + SETTLES_AFTER_MS : move.settles, now)}</b></span>
                {move.play > 1 ? <span>{move.play} lineups together: <b>{pct(clear)}</b> one clears (Sorare cancels the others)</span> : null}
              </span>
              <button type="button" className="arc-small" onClick={() => onBuild([...new Set((lineup?.picks ?? []).map((p) => p.outlook.game.id))], move.step)} disabled={!lineup}>Edit in Pick teams</button>
            </div>
            {lineups.length > 1 ? (
              <div className="arc-modes" role="group" aria-label="Lineup">
                {lineups.map((l, i) => <button key={i} type="button" aria-pressed={i === Math.min(shown, lineups.length - 1)} onClick={() => setShown(i)}>Lineup {i + 1} · {pct(chanceOf(l.totals, target(move.step)))}</button>)}
              </div>
            ) : null}
            {lineup ? <LineupCards lineup={lineup} captainBonus={captainBonus} /> : null}
            {lineup && lineup.picks.some((p) => p.outlook.start === null) ? <p className="arc-sub">{lineup.picks.filter((p) => p.outlook.start === null).length} of 5 have no start % yet and count as starting: read start % again closer to kick-off.</p> : null}
          </div>
        ) : null}
      </div>
      <ol className="arc-ladder" aria-label="Your board: chance to clear each step at least once by the last game Sorare lists; every clear pays again">
        {[...boardSteps].reverse().map((s) => {
          const done = s.number < current || s.state === "CLAIMED" || s.state === "CLAIMABLE";
          const odds = plan.odds[s.number] ?? 0;
          return (
            <li key={s.id} className={`${s.number === current ? "is-current" : ""}${done ? " is-done" : ""}`} aria-current={s.number === current ? "step" : undefined}>
              <span className="arc-ladder-n">{done ? "✓" : s.number}</span>
              <span className="arc-ladder-t"><b>{s.target}</b><small>{s.rewards.join(" + ") || "no reward"}{s.number === boardSteps.at(-1)?.number ? " · each time" : ""}</small></span>
              <span className="arc-ladder-odds" style={{ "--p": done ? 1 : odds } as CSSProperties}><b>{done ? "✓" : pct(odds)}</b></span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** The chain: the next moves, window by window, each settling before the next starts; the other outcome of each a tap away. */
function Chain({ plan, steps, captainBonus, now }: { plan: Climb; steps: StepInfo[]; captainBonus: number; now: number }) {
  const [branch, setBranch] = useState<{ of: Climb; moves: Move[]; label: string } | null>(null);
  const moves = branch?.of === plan ? branch.moves : plan.path;
  const [focus, setFocus] = useState<number | null>(null);
  const picked = focus !== null ? moves[focus] ?? null : null;
  const target = (n: number) => steps.find((s) => s.number === n)?.target ?? 0;
  const lineups = useMemo(() => (picked ? exactLineups(picked, target(picked.step), captainBonus) : []), [picked, captainBonus]); // eslint-disable-line react-hooks/exhaustive-deps
  if (moves.length < 2 && !branch) return null;
  const follow = (m: Move, i: number, cleared: boolean) => {
    setBranch({ of: plan, moves: [...moves.slice(0, i + 1), ...plan.after(m, cleared)], label: `if ${m.play > 1 ? (cleared ? "one clears" : "all miss") : cleared ? "it clears" : "it misses"} at ${when(m.at, now)}` });
    setFocus(null);
  };
  let day = "";
  return (
    <section className="arc-chain" aria-labelledby="arc-chain-title">
      <div className="arc-plan-head">
        <h2 id="arc-chain-title">The chain</h2>
        <span className="arc-sub">{branch?.of === plan ? `The plan ${branch.label}.` : "Each lineup settles before the next one starts; a clear opens the next step at once."}</span>
        {branch?.of === plan ? <button type="button" className="arc-small" onClick={() => { setBranch(null); setFocus(null); }}>Back to the likely plan</button> : null}
      </div>
      <ol className="arc-chain-rail">
        {moves.slice(0, 12).map((m, i) => {
          const d = madridDate(iso(m.at));
          const newDay = d !== day;
          day = d;
          const q = m.lineups[0];
          return (
            <li key={`${m.from}-${m.step}-${i}`} style={{ "--i": i } as CSSProperties} className={newDay ? "is-day" : undefined}>
              {newDay ? <span className="arc-chain-day">{madridDay(iso(m.at))}</span> : <span className="arc-chain-day" aria-hidden="true" />}
              <button type="button" className={`arc-chain-node${m.clear >= 0.5 ? " is-likely" : " is-long"}`} aria-pressed={focus === i} onClick={() => setFocus(focus === i ? null : i)}>
                <span className="arc-chain-time">{madridTime(iso(m.at))}</span>
                <span className="arc-chain-step">Step {m.step}{m.play > 1 ? <small> × {m.play}</small> : null}</span>
                <b>{pct(m.clear)}</b>
                <span className="arc-fan" aria-hidden="true">
                  {(q?.picks ?? []).map((p) => (p.outlook.card.picture
                    // eslint-disable-next-line @next/next/no-img-element -- Sorare's card art
                    ? <img key={p.outlook.card.slug} src={p.outlook.card.picture} alt="" width={26} height={42} loading="lazy" />
                    : null))}
                </span>
                <small>settles {settleLabel(m.settles, m.at)}</small>
              </button>
              <span className="arc-chain-miss">{m.clear >= 0.5 ? "" : "likely miss · "}miss: {m.lives - m.play > 0 ? `${m.lives - m.play} ${m.lives - m.play === 1 ? "life" : "lives"} left` : "back to step 1"}</span>
            </li>
          );
        })}
      </ol>
      {picked ? (
        <div className="arc-chain-detail">
          <p className="arc-sub">Step {picked.step} at {when(picked.at, now)}: {picked.play} lineup{picked.play > 1 ? "s" : ""}, {pct(picked.clear)} that one clears, settles about {when(picked.settles, now)}.</p>
          {lineups[0] ? <LineupCards lineup={lineups[0]} captainBonus={captainBonus} /> : null}
          <div className="arc-outcomes" role="group" aria-label="What comes next">
            {([true, false] as const).map((cleared) => {
              const next = plan.after(picked, cleared)[0] ?? null;
              const i = moves.indexOf(picked);
              return (
                <button key={String(cleared)} type="button" disabled={!next} onClick={() => follow(picked, i, cleared)}>
                  <b>{cleared ? (picked.play > 1 ? "If one clears" : "If it clears") : (picked.play > 1 ? "If all miss" : "If it misses")}</b>
                  <span>{next ? `then step ${next.step} at ${when(next.at, now)}, ${pct(next.clear)}` : "no game left to play"}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default function ArcadePlanner({ arcade, outlooks, captainBonus, status }: { arcade: Arcade; outlooks: Map<string, Outlook[]>; captainBonus: number; status: Record<string, PlayerStatus> }) {
  const [now] = useState(() => Date.now());
  const steps = useMemo(() => stepInfos(arcade), [arcade]);
  const current = climbStep(arcade);
  const { start, waiting, after } = useMemo(() => climbStart(arcade, steps, current), [arcade, steps, current]);
  const all = useMemo(() => [...outlooks.values()].flat(), [outlooks]);
  const plan = useMemo(() => climbWindows(all, steps, start, captainBonus, now), [all, steps, start, captainBonus, now]);
  const busy = useMemo(() => new Set(start.held.filter((h) => h.until > now).map((h) => h.card)), [start.held, now]);
  const games = useMemo(() => (arcade.games ?? []).filter((g) => Date.parse(g.kickoff) > now && (outlooks.get(g.id) ?? []).length), [arcade.games, outlooks, now]);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set((plan.path[0]?.list ?? []).map((o) => o.game.id)));
  const [aim, setAim] = useState(current);
  const lives = start.step === current ? start.lives : 0;
  const waitingNote = after
    ? `Your ${waiting.length} lineup${waiting.length > 1 ? "s" : ""} on step ${current} settle${waiting.length > 1 ? "" : "s"} first (about ${when(after.at, now)}); the plan goes on as if one clears it.`
    : waiting.length ? `You have ${waiting.length} lineup${waiting.length > 1 ? "s" : ""} waiting on step ${current}: if one clears it, Sorare cancels any other you entered on the step.` : null;
  const build = (ids: string[], step: number) => {
    setChosen(new Set(ids));
    setAim(step);
    document.getElementById("arc-teams-title")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  if (!games.length) return <p className="arc-note">No game of your cards is left before the set ends.</p>;
  return (
    <>
      <YourMove plan={plan} steps={steps} boardSteps={arcade.board?.steps ?? []} current={current} lives={lives} captainBonus={captainBonus} now={now} onBuild={build} waitingNote={waitingNote} busy={busy} />
      <Chain plan={plan} steps={steps} captainBonus={captainBonus} now={now} />
      <ArcadeTeams arcade={arcade} outlooks={outlooks} status={status} chosen={chosen} onToggle={(id) => { const next = new Set(chosen); if (next.has(id)) next.delete(id); else next.add(id); setChosen(next); }} now={now} />
      <section className="arc-plan" aria-labelledby="arc-teams-title">
        <div className="arc-plan-head"><h2 id="arc-teams-title">Pick teams</h2></div>
        <PickTeams arcade={arcade} outlooks={outlooks} captainBonus={captainBonus} chosen={chosen} setChosen={setChosen} aim={aim} setAim={setAim} busy={busy} now={now} />
      </section>
    </>
  );
}

