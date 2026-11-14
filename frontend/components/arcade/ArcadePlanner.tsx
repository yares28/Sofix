"use client";

import { memo, useCallback, useContext, useDeferredValue, useEffect, useMemo, useState, type CSSProperties } from "react";
import { z } from "zod";
import type { Arcade, ArcadeGame, ArcadeStep } from "../../lib/arcade";
import { holdSplit, kickOf, type Move } from "../../lib/arcadeClimb";
import { useClimb, type ClimbPlan } from "../../lib/climbClient";
import { aimKey, useArcadeAim } from "../../lib/arcadeAim";
import { climbStart, climbStep, stepInfos } from "../../lib/arcadeBoard";
import type { PlayerStatus } from "../../lib/arcadeTeams";
import { FdrContext } from "./Fdr";
import { fdrOf, leagueLabel } from "../../lib/arcadeFdr";
import ArcadeTeams from "./ArcadeTeams";
import PlayerCard from "./PlayerCard";
import { aimStep, noStartNote, partialFive, SLOTS, bestLineup, chanceOf, madridDate, predicted, sideIn, whenLabel, SETTLES_AFTER_MS, type Lineup, type Slot, type Outlook, type StartSource, type StepInfo } from "../../lib/arcadePlan";

const SOURCE: Record<StartSource, string> = { sorare: "Sorare", futbolfantasy: "Futbol Fantasy", sofix: "Sofix" };
const SLOT: Record<string, string> = { GK: "Goalkeeper", DEF: "Defender", MID: "Midfielder", FWD: "Forward", EXTRA: "Extra" };
const SavedTeams = z.object({ games: z.array(z.string()).max(500), aim: z.number().int().positive() });
export const madridDay = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Europe/Madrid", weekday: "short", day: "numeric", month: "short" });
export const madridTime = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });
export const pct = (x: number) => `${Math.round(x * 100)}%`;
export const pts = (x: number) => Math.round(x).toLocaleString("en-GB");
const iso = (ms: number) => new Date(ms).toISOString();
/** "16:15" today, "Sat 16:15" within six days, "Fri 20 Nov 20:30" beyond (whenLabel). */
const when = whenLabel;
/** A settle time beside a kick-off: the time, with the day when it is another day. */
const settleLabel = (settles: number, at: number) => whenLabel(settles, at);

/** A card's start % with whose it is, or "no start % yet". */
export function StartLabel({ outlook }: { outlook: Outlook }) {
  return outlook.start === null
    ? <i className="arc-nostart">no start % yet</i>
    : outlook.startUrl
      ? <a href={outlook.startUrl} target="_blank" rel="noreferrer" title={`${SOURCE[outlook.startSource!]}’s start %`}>{pct(outlook.start)} start</a>
      : <span title={`${SOURCE[outlook.startSource!]}’s start %`}>{pct(outlook.start)} start</span>;
}

export function LineupCards({ lineup, captainBonus }: { lineup: Lineup; captainBonus: number }) {
  const crests = new Map(lineup.picks.flatMap(({ outlook }) => outlook.card.teamSlug && outlook.card.teamPicture ? [[outlook.card.teamSlug, outlook.card.teamPicture] as const] : []));
  return (
    <ol className="arc-lineup">
      {lineup.picks.map(({ slot, outlook, captain }, i) => (
        <li key={outlook.card.slug} aria-label={outlook.card.name} style={{ "--i": i } as CSSProperties}>
          <span className="arc-slot">{SLOT[slot]}{captain && captainBonus > 0 ? <b className="arc-captain" title="Captain">C</b> : null}</span>
          <PlayerCard card={outlook.card} outlook={outlook} game={outlook.game} fixtures={[outlook.game]} crests={crests} captain={captain} captainBonus={captainBonus} />
          {/postpon|cancel|suspend/i.test(outlook.game.status) ? <span className="arc-warn">Game {outlook.game.status.toLowerCase()}</span> : null}
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
      <div className="arc-scale-head"><h3>Where {pts(lineup.expected)} lands</h3><span>{pts(lo)}–{pts(hi)} in 6 of 10</span></div>
      <div className="arc-scale-track" aria-hidden="true">
        <span className="arc-scale-band" style={{ left: at(lo), width: `calc(${at(hi)} - ${at(lo)})` }} />
        <span className="arc-scale-mark" style={{ left: at(lineup.expected) }} />
        {steps.map((s) => <i key={s.id} className="arc-scale-target" style={{ left: at(s.target) }} title={`Step ${s.number}: ${s.target}`} />)}
      </div>
      <ol className="arc-scale-chances">
        {steps.map((s) => {
          const chance = chanceOf(lineup.totals, s.target);
          return (
            <li key={s.id} className={`arc-scale-tick${s.number === aim ? " is-aim" : ""}`}>
              <small>Step {s.number} · {s.target}</small><b className={chance >= 0.6 ? "is-good" : chance >= 0.4 ? "is-mid" : "is-low"}>{pct(chance)}</b>
              <span className="arc-bar" aria-hidden="true"><span style={{ width: pct(chance) }} /></span>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

/** Pitch spots for the five slots (left %, top %), as a lineup stands. */
const SPOT: Record<string, [number, number]> = { FWD: [32, 17], EXTRA: [72, 22], MID: [54, 43], DEF: [25, 57], GK: [55, 82] };

/** The lineup on a pitch: the card art where each slot stands, its points and start %. With no lineup, the same pitch keeps its five
 * empty slots and says why no team is built (owner, 10 Nov 2026), so nothing moves when the cards arrive. */
function Pitch({ lineup, partial = [], captainBonus, title }: { lineup: Lineup | null; partial?: { slot: Slot; outlook: Outlook | null }[]; captainBonus: number; title: string }) {
  if (!lineup) return (
    <div className="arc-pitch is-empty">
      <div className="arc-pitch-lines" aria-hidden="true" />
      <div className="arc-pitch-head"><b className="arc-pitch-why" role="status">{title}</b></div>
      <ol aria-label="Team so far">
        {SLOTS.map((slot, i) => {
          const [left, top] = SPOT[slot] ?? [50, 50];
          const o = partial.find((p) => p.slot === slot)?.outlook ?? null;
          return (
            <li key={slot} data-slot={slot} aria-label={o ? o.card.name : `${SLOT[slot]}: empty`} style={{ left: `var(--pitch-x, ${left}%)`, top: `${top}%`, "--i": i } as CSSProperties}>
              {o ? (o.card.picture
                // eslint-disable-next-line @next/next/no-img-element -- Sorare's card art, as on the other pages
                ? <img src={o.card.picture} alt={o.card.name} width={96} height={155} loading="lazy" />
                : <div className="arc-card-blank">{o.card.name}</div>) : <i className="arc-slot-empty" aria-hidden="true" />}
              <span><b>{SLOT[slot] === "Extra" ? "+1" : slot}</b>{o ? <> ~{pts(predicted(o) ?? 0)} <small>{o.start === null ? "no %" : pct(o.start)}</small></> : null}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
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
            <li key={outlook.card.slug} data-slot={slot} className={captain && captainBonus > 0 ? "is-captain" : undefined} style={{ left: `var(--pitch-x, ${left}%)`, top: `${top}%`, "--i": i } as CSSProperties}>
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
function PickTeams({ arcade, outlooks, captainBonus, chosen, setChosen, aim, setAim, busy, now, preset }: {
  arcade: Arcade; outlooks: Map<string, Outlook[]>; captainBonus: number; chosen: Set<string>; setChosen: (next: Set<string>) => void; aim: number; setAim: (n: number) => void; busy: Set<string>; now: number; preset: Lineup | null;
}) {
  const steps = arcade.board?.steps ?? [];
  const boards = useContext(FdrContext);
  const crests = useMemo(() => crestsOf(arcade), [arcade]);
  const games = useMemo(() => (arcade.games ?? []).filter((g) => Date.parse(g.kickoff) > now && (outlooks.get(g.id) ?? []).length), [arcade.games, outlooks, now]);
  const [show, setShow] = useState<"all" | "today" | "picked">("all");
  const todayOnly = show === "today";
  const [page, setPage] = useState(0);
  const today = madridDate(iso(now));
  const picked = games.filter((g) => chosen.has(g.id));
  // "Picked" lists every game in the team on one page, so a pick on another page is never out of sight.
  const filteredGames = show === "picked" ? picked : todayOnly ? games.filter((g) => madridDate(g.kickoff) === today) : games;
  const pages = Math.max(1, Math.ceil(filteredGames.length / 12));
  const atPage = Math.min(page, pages - 1);
  const hiddenSelected = todayOnly ? games.filter((g) => chosen.has(g.id) && madridDate(g.kickoff) !== today).length : 0;
  const target = steps.find((s) => s.number === aim)?.target ?? steps[0]?.target ?? 0;
  // The ticket flips at once; the five follow when worked out (a second with 200 games picked on 9 Nov 2026).
  const pending = useDeferredValue(chosen);
  const lineup = useMemo(() => preset ?? bestLineup([...pending].flatMap((id) => outlooks.get(id) ?? []).filter((o) => !busy.has(o.card.slug)), target, captainBonus), [pending, outlooks, target, captainBonus, busy, preset]);
  const partial = useMemo(() => (lineup ? [] : partialFive([...pending].flatMap((id) => outlooks.get(id) ?? []).filter((o) => !busy.has(o.card.slug)))), [lineup, pending, outlooks, busy]);
  const five = (l: Lineup | null) => (l ? l.picks.map((p) => p.outlook.card.slug).sort().join() : "");
  // The last tap, so one that leaves the five as they were says so instead of looking broken.
  const [tap, setTap] = useState<{ name: string; added: boolean; before: string } | null>(null);
  const toggle = (g: ArcadeGame) => {
    const next = new Set(chosen);
    const added = !next.has(g.id);
    if (added) next.add(g.id); else next.delete(g.id);
    setTap({ name: `${g.home?.name ?? "?"} v ${g.away?.name ?? "?"}`, added, before: five(lineup) });
    setChosen(next);
  };
  const stayed = tap && pending === chosen && lineup && five(lineup) === tap.before
    ? `${tap.name} ${tap.added ? "is in: none of its cards beats these" : "is out: none of its cards was in the team"}, so the five stay.` : null;
  // The games where one of your clubs is favourite on Sofix's board (difficulty 1 or 2).
  const easyAll = (show === "picked" ? games : filteredGames).filter((g) => {
    const f = boards.get(g.id);
    if (!f) return false;
    const mine = new Set((outlooks.get(g.id) ?? []).map((o) => sideIn(o.card, g)));
    return (mine.has(g.home?.slug ?? null) && f.home.bucket <= 2) || (mine.has(g.away?.slug ?? null) && f.away.bucket <= 2);
  });
  // One lineup plays one day: the easy games of the first day that has any (9 Nov 2026: 239 games over two months went in one team).
  const easyDay = easyAll[0] ? madridDate(easyAll[0].kickoff) : null;
  const easy = easyAll.filter((g) => madridDate(g.kickoff) === easyDay);
  const settles = lineup ? Date.parse(lineup.last) + SETTLES_AFTER_MS : null;
  const open = steps.filter((s) => !["CLAIMED", "CLAIMABLE"].includes(s.state));

  return (
    <div className="arc-teams">
      <div className="arc-teams-bar">
        <label className="arc-aim">Aim at
          <select value={aim} onChange={(e) => { setTap(null); setAim(Number(e.target.value)); }}>
            {(open.length ? steps.filter((s) => open.includes(s) || s.number === aim) : steps).map((s) => <option key={s.id} value={s.number}>Step {s.number} · {s.target} pts</option>)}
          </select>
        </label>
        <button type="button" className="arc-small" onClick={() => { setTap(null); setChosen(new Set(easy.map((g) => g.id))); }} disabled={!easy.length} title={`Games on ${easyDay ? madridDay(`${easyDay}T12:00:00Z`) : "the first day"} where Sofix's board makes one of your clubs favourite or very favourite`}>
          Easiest games ({easy.length})
        </button>
        <button type="button" className="arc-small" onClick={() => { setTap(null); setChosen(new Set()); if (show === "picked") setShow("all"); }} disabled={!chosen.size}>Clear</button>
      </div>
      <div className="arc-game-picker">
        <div className="arc-game-filter">
          <div className="arc-modes" role="group" aria-label="Game day">
            <button type="button" aria-pressed={show === "all"} onClick={() => { setShow("all"); setPage(0); }}>All games</button>
            <button type="button" aria-pressed={todayOnly} onClick={() => { setShow("today"); setPage(0); }}>Today</button>
            <button type="button" aria-pressed={show === "picked"} disabled={!picked.length} onClick={() => { setShow("picked"); setPage(0); }}>Picked ({picked.length})</button>
          </div>
          {hiddenSelected ? <span>{hiddenSelected} selected later</span> : null}
        </div>
        <div className="arc-tickets" role="group" aria-label="Games to pick from">
        {filteredGames.slice(atPage * 12, (atPage + 1) * 12).map((g, i) => {
          const f = boards.get(g.id);
          const on = chosen.has(g.id);
          return (
            <button key={g.id} type="button" className="arc-ticket" aria-pressed={on} onClick={() => toggle(g)} style={{ "--i": Math.min(i, 12) } as CSSProperties}>
              <small>{leagueLabel(g.competition)}</small>
              <span className="arc-ticket-crests"><Crest team={g.home} crests={crests} /><i>v</i><Crest team={g.away} crests={crests} /></span>
              <span className="arc-ticket-name">{g.home?.name ?? "?"} v {g.away?.name ?? "?"}</span>
              <span className="arc-ticket-foot">
                <b>{when(Date.parse(g.kickoff), now)}</b>
                <span>{(outlooks.get(g.id) ?? []).length} of your cards</span>
              </span>
              {/* A dot per side, in its FDR band's colour; the number out of 100 is on the cards (one FDR form, 10 Nov 2026). */}
              {f ? <span className="arc-ticket-fdr">{([["Home", f.home], ["Away", f.away]] as const).map(([where, s]) => <span key={where} className={`f${s.bucket}`} title={`${where} (${s.name}): ${fdrOf(s).title}`} />)}</span> : null}
              {on ? <span className="arc-stamp" aria-hidden="true">IN</span> : null}
            </button>
          );
        })}
        </div>
        {!filteredGames.length ? <p className="arc-sub" role="status">{show === "picked" ? "No game picked." : "No games left today."}</p> : null}
        {pages > 1 ? <nav className="arc-pager" aria-label="Game pages">
          <button type="button" aria-label="Previous page" disabled={!atPage} onClick={() => setPage(atPage - 1)}>Previous</button>
          <span>Page {atPage + 1} of {pages}</span>
          <button type="button" aria-label="Next page" disabled={atPage === pages - 1} onClick={() => setPage(atPage + 1)}>Next</button>
        </nav> : null}
      </div>
      {stayed ? <p className="arc-sub arc-pick-note" role="status">{stayed}</p> : null}
      {lineup ? (
        <div className="arc-pitch-wrap" aria-busy={pending !== chosen}>
          <Pitch lineup={lineup} captainBonus={captainBonus} title={`Best five from your ${pending.size} game${pending.size === 1 ? "" : "s"} · settles about ${when(settles!, now)}`} />
          <Scale lineup={lineup} steps={steps} aim={aim} />
          <details className="arc-detail">
            <summary>Each card&apos;s numbers</summary>
            <LineupCards lineup={lineup} captainBonus={captainBonus} />
            <Chances lineup={lineup} steps={steps} aim={aim} />
          </details>
        </div>
      ) : (
        <div className="arc-pitch-wrap">
          {/* Fill what the games can, keep the rest empty (owner, 10 Nov 2026); the line names only what is missing. */}
          <Pitch lineup={null} partial={partial} captainBonus={captainBonus} title={!chosen.size ? "Pick at least one game." : `No ${partial.filter((p) => !p.outlook).map((p) => SLOT[p.slot]!.toLowerCase()).join(", ")} in these games`} />
        </div>
      )}
    </div>
  );
}

export { climbStart, climbStep, stepInfos } from "../../lib/arcadeBoard";


/** Your move: play, wait or spend your lives, why, and the lineup to enter. */
const YourMove = memo(function YourMove({ plan, steps, boardSteps, current, lives, captainBonus, now, onBuild, waitingNote, updating }: {
  plan: ClimbPlan; steps: StepInfo[]; boardSteps: ArcadeStep[]; current: number; lives: number; captainBonus: number; now: number; onBuild: (move: Move, lineup: Lineup | null) => void; waitingNote: string | null; updating: boolean;
}) {
  const move = plan.path[0] ?? null;
  const target = (n: number) => steps.find((s) => s.number === n)?.target ?? 0;
  const lineups = move?.lineups ?? [];
  const [shown, setShown] = useState(0);
  const lineup = lineups[Math.min(shown, lineups.length - 1)] ?? null;
  // A tapped step of the ladder: its five likeliest lineups in the next 7 days (owner, 10 Nov 2026).
  const [stepPick, setStepPick] = useState<{ step: number; shown: number } | null>(null);
  const stepBest = stepPick ? plan.week.best[stepPick.step] ?? [] : [];
  const stepMove = stepPick ? stepBest[Math.min(stepPick.shown, stepBest.length - 1)] ?? null : null;
  // The list opens under the move, out of sight of the ladder that was tapped: bring it into view.
  useEffect(() => {
    if (stepPick?.shown !== 0) return;
    document.getElementById("arc-step-best")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "nearest" });
  }, [stepPick?.step, stepPick?.shown]);
  const v = plan.verdict;
  const step = boardSteps.find((s) => s.number === current);
  const playsNow = move && move.from === 0 && v.kind !== "wait";
  // The bar (owner, 29 Oct): the step you are on, the lineup you would enter now against the best one from the games you would wait for.
  const playMove = v.playNow;
  const holdMove = v.hold;
  const playChance = playMove?.clear ?? 0;
  const holdChance = holdMove?.clear ?? null;
  const holdWins = v.kind === "wait";
  // Whether the lineup's start % will all be known before it is entered: its games kick off together (within the 75-minute window).
  const noStart = lineup ? noStartNote(lineup.picks.filter((p) => p.outlook.start === null).length, Date.parse(lineup.first), now) : null;
  // One bar sharing 100% between Play and Hold by the prize the advice decides on (owner, 9 Nov 2026).
  const split = holdSplit(v);
  const prizeOf = (n: number) => boardSteps.find((s) => s.number === n)?.rewards.join(" + ") || `step ${n}`;
  // A close split keeps a decimal, so 50.6 | 49.4 never reads as an even 50 | 50 beside a clear verdict.
  const close = split && !split.tie && Math.abs(split.play - split.hold) < 0.05;
  const sharePct = (x: number) => (close ? `${(x * 100).toFixed(1)}%` : pct(x));
  const lineupsOf = (m: Move | null) => (m ? `${m.play} lineup${m.play === 1 ? "" : "s"}` : "");
  // Only the Hold side carries a date (owner, 10 Nov 2026): the rest is in the lineup below.
  const side = (name: "Play" | "Hold", m: Move | null, share: number, pick: boolean) => (
    <span className={pick ? "is-pick" : undefined} style={{ flexGrow: share }}>
      <small>{name}{name === "Hold" && m ? <time>{when(kickOf(m), now)}</time> : null}</small>
      <b>{sharePct(share)}</b>
    </span>
  );
  return (
    <section className={`arc-move is-${v.kind}`} aria-labelledby="arc-move-title" aria-busy={updating}>
      <div className="arc-move-main">
        {updating ? <p className="arc-move-updating" role="status">Updating with the latest start %…</p> : null}
        <p className="arc-move-kicker">
          <span>Step {current} · {step?.target ?? ""} pts</span>
          {/* Words, not four dots: dots beside "Step 4" read as steps (owner, 10 Nov 2026). */}
          <span className="arc-lives" aria-label={`${lives} of 4 lives`}>{lives} {lives === 1 ? "life" : "lives"} left</span>
          {step?.rewards.length ? <span className="arc-move-prize">{step.rewards.join(" + ")}</span> : null}
        </p>
        <h2 id="arc-move-title" className="arc-move-verdict">Play next</h2>
        {v.kind === "none" ? <p className="arc-move-why">Your free cards cannot fill a lineup from any game Sorare lists yet (cards in a lineup still running are held until it settles).</p> : null}
        {waitingNote ? <p className="arc-warn">{waitingNote}</p> : null}
        {v.kind !== "none" && split ? (
          <figure className="arc-split">
            <div role="img" aria-label={`${holdWins ? "Hold" : "Play"} advised. Play ${sharePct(split.play)}, Hold ${sharePct(split.hold)}${split.tie ? ", a near tie" : ` of the chances to win step ${split.step} (${prizeOf(split.step)})`}. This step: Play ${playMove ? `${pct(playChance)} with ${lineupsOf(playMove)} at ${when(kickOf(playMove), now)}` : "no lineup"}, Hold ${holdChance === null ? "no later lineup" : `${pct(holdChance)} with ${lineupsOf(holdMove)} from ${when(kickOf(holdMove!), now)}`}.`}>
              {side("Play", playMove, split.play, !holdWins)}
              {side("Hold", holdMove, split.hold, holdWins)}
            </div>
          </figure>
        ) : null}
        {move ? (
          <div className="arc-move-entry">
            <div className="arc-move-entry-head">
              {playsNow && move.play === 1 ? null : <span className="arc-move-chance"><b>{pct(lineup ? chanceOf(lineup.totals, target(move.step)) : move.clear)}</b><small>{playsNow ? "this lineup clears it" : `ready for ${when(kickOf(move), now)}`}</small></span>}
              <button type="button" className="arc-small" onClick={() => onBuild(move, lineup)} disabled={!lineup}>Edit in Pick teams</button>
            </div>
            {lineups.length > 1 ? (
              <div className="arc-modes" role="group" aria-label="Lineup">
                {lineups.map((l, i) => <button key={i} type="button" aria-pressed={i === Math.min(shown, lineups.length - 1)} onClick={() => setShown(i)}>Lineup {i + 1} · {pct(chanceOf(l.totals, target(move.step)))}</button>)}
              </div>
            ) : null}
            {lineup ? <LineupCards lineup={lineup} captainBonus={captainBonus} /> : null}
            {noStart ? <p className="arc-sub">{noStart}</p> : null}
          </div>
        ) : null}
      </div>
      {/* The chance to clear each step within the next 7 days, not by the set's end (owner, 10 Nov 2026); a tap lists its best lineups. */}
      <ol className="arc-ladder" data-caption="Next 7 days" aria-label={`Your board: chance to clear each step at least once by ${when(plan.week.until, now)}; every clear pays again. Tap a step for its five likeliest lineups.`}>
        {[...boardSteps].reverse().map((s) => {
          const done = s.number < current || s.state === "CLAIMED" || s.state === "CLAIMABLE";
          const odds = plan.week.odds[s.number] ?? 0;
          return (
            <li key={s.id} className={`${s.number === current ? "is-current" : ""}${done ? " is-done" : ""}`} aria-current={s.number === current ? "step" : undefined}>
              <button type="button" className="arc-ladder-pick" aria-pressed={stepPick?.step === s.number} onClick={() => setStepPick(stepPick?.step === s.number ? null : { step: s.number, shown: 0 })}>
                <span className="arc-ladder-n">{done ? "✓" : s.number}</span>
                <span className="arc-ladder-t"><b>{s.target}</b><small>{s.rewards.join(" + ") || "no reward"}{s.number === boardSteps.at(-1)?.number ? " · each time" : ""}</small></span>
                <span className="arc-ladder-odds" style={{ "--p": done ? 1 : odds } as CSSProperties}><b>{done ? "✓" : pct(odds)}</b></span>
              </button>
            </li>
          );
        })}
      </ol>
      {stepPick ? (
        <div id="arc-step-best" className="arc-step-best" role="region" aria-label={`Step ${stepPick.step}: five likeliest lineups`}>
          <p className="arc-sub">Step {stepPick.step} · {target(stepPick.step)} pts: {stepBest.length ? `the ${stepBest.length === 1 ? "likeliest lineup" : `${stepBest.length} likeliest lineups`} from the next 7 days' games.` : "no lineup can be built from the next 7 days' games."}</p>
          {stepBest.length ? <div className="arc-modes" role="group" aria-label="Step lineups">
            {stepBest.map((m, i) => <button key={i} type="button" aria-pressed={m === stepMove} onClick={() => setStepPick({ step: stepPick.step, shown: i })}>{when(kickOf(m), now)} · {pct(m.clear)}</button>)}
          </div> : null}
          {stepMove ? <>
            <LineupCards lineup={stepMove.lineups[0]!} captainBonus={captainBonus} />
            <button type="button" className="arc-small" onClick={() => onBuild(stepMove, stepMove.lineups[0]!)}>Edit in Pick teams</button>
          </> : null}
        </div>
      ) : null}
    </section>
  );
});

/** The chain: the next moves, window by window, each settling before the next starts; the other outcome of each a tap away. */
/** A move's two outcomes, asked of the worker when the move is opened; each button waits for its own answer. */
function Outcomes({ plan, picked, now, surest, onFollow }: { plan: ClimbPlan; picked: Move; now: number; surest: boolean; onFollow: (cleared: boolean, after: Move[]) => void }) {
  const [after, setAfter] = useState<{ of: Move; cleared: Move[] | null; missed: Move[] | null }>({ of: picked, cleared: null, missed: null });
  useEffect(() => {
    let live = true;
    setAfter({ of: picked, cleared: null, missed: null });
    void plan.after(picked, true, surest).then((m) => { if (live) setAfter((a) => (a.of === picked ? { ...a, cleared: m } : a)); });
    void plan.after(picked, false, surest).then((m) => { if (live) setAfter((a) => (a.of === picked ? { ...a, missed: m } : a)); });
    return () => { live = false; };
  }, [plan, picked, surest]);
  return (
    <div className="arc-outcomes" role="group" aria-label="What comes next">
      {([true, false] as const).map((cleared) => {
        const moves = after.of === picked ? (cleared ? after.cleared : after.missed) : null;
        const next = moves?.[0] ?? null;
        return (
          <button key={String(cleared)} type="button" disabled={!next} aria-busy={moves === null} onClick={() => moves && onFollow(cleared, moves)}>
            <b>{cleared ? (picked.play > 1 ? "If one clears" : "If it clears") : (picked.play > 1 ? "If all miss" : "If it misses")}</b>
            <span>{moves === null ? "working it out…" : next ? `then step ${next.step} at ${when(kickOf(next), now)}, ${pct(next.clear)}` : "no game left to play"}</span>
          </button>
        );
      })}
    </div>
  );
}

const Chain = memo(function Chain({ plan, captainBonus, now, onBuild }: { plan: ClimbPlan; captainBonus: number; now: number; onBuild: (move: Move, lineup: Lineup | null) => void }) {
  // Fastest is the plan's own path; Surest waits, step by step, for a window 15 points surer (owner, 10 Nov 2026).
  const [surest, setSurest] = useState(false);
  const [branch, setBranch] = useState<{ of: ClimbPlan; moves: Move[]; label: string } | null>(null);
  const moves = branch?.of === plan ? branch.moves : surest ? plan.surest : plan.path;
  const [focus, setFocus] = useState<number | null>(null);
  const [shown, setShown] = useState(0);
  const picked = focus !== null ? moves[focus] ?? null : null;
  const lineups = picked?.lineups ?? [];
  if (plan.path.length < 2 && plan.surest.length < 2 && !branch) return null;
  const pickMode = (sure: boolean) => { setSurest(sure); setBranch(null); setFocus(null); };
  // The difference of the two rounded chances, so "+22" always matches the 98% shown and the fastest chain's 76%.
  const gainOf = (m: Move) => Math.round(m.clear * 100) - Math.round((m.clear - (m.gain ?? 0)) * 100);
  const follow = (m: Move, i: number, cleared: boolean, after: Move[]) => {
    setBranch({ of: plan, moves: [...moves.slice(0, i + 1), ...after], label: `if ${m.play > 1 ? (cleared ? "one clears" : "all miss") : cleared ? "it clears" : "it misses"} at ${when(kickOf(m), now)}` });
    setFocus(null);
  };
  let day = "";
  return (
    <section className="arc-chain" aria-labelledby="arc-chain-title">
      <div className="arc-plan-head">
        <h2 id="arc-chain-title">The chain</h2>
        <div className="arc-modes" role="group" aria-label="Chain">
          <button type="button" aria-pressed={!surest} onClick={() => pickMode(false)}>Fastest</button>
          <button type="button" aria-pressed={surest} onClick={() => pickMode(true)}>Surest</button>
        </div>
        {branch?.of === plan ? <span className="arc-sub">The plan {branch.label}.</span> : null}
        {branch?.of === plan ? <button type="button" className="arc-small" onClick={() => { setBranch(null); setFocus(null); }}>Back to the likely plan</button> : null}
      </div>
      {/* A new chain starts at its first move: the rail is drawn afresh, not left scrolled where the other one was. */}
      <ol className="arc-chain-rail" key={`${surest}:${branch?.label ?? ""}`}>
        {moves.slice(0, 12).map((m, i) => {
          const d = madridDate(iso(kickOf(m)));
          const newDay = d !== day;
          day = d;
          const q = m.lineups[0];
          return (
            <li key={`${m.from}-${m.step}-${i}`} style={{ "--i": i } as CSSProperties} className={newDay ? "is-day" : undefined}>
              {newDay ? <span className="arc-chain-day">{madridDay(iso(kickOf(m)))}</span> : <span className="arc-chain-day" aria-hidden="true" />}
              <button type="button" className={`arc-chain-node${m.clear >= 0.5 ? " is-likely" : " is-long"}`} aria-pressed={focus === i} onClick={() => { setFocus(focus === i ? null : i); setShown(0); }}>
                <span className="arc-chain-time">{madridTime(iso(kickOf(m)))}</span>
                <span className="arc-chain-step">Step {m.step}{m.play > 1 ? <small> × {m.play}</small> : null}</span>
                <b>{pct(m.clear)}</b>
                <span className="arc-fan" aria-hidden="true">
                  {(q?.picks ?? []).map((p) => (p.outlook.card.picture
                    // eslint-disable-next-line @next/next/no-img-element -- Sorare's card art
                    ? <img key={p.outlook.card.slug} src={p.outlook.card.picture} alt="" width={26} height={42} loading="lazy" />
                    : null))}
                </span>
                <small>settles {settleLabel(m.settles, kickOf(m))}</small>
                {m.gain !== undefined ? <small className={`arc-chain-gain${m.same ? " is-same" : ""}`}>{m.same ? "same as fastest" : `+${gainOf(m)} vs fastest`}</small> : null}
              </button>
              <span className="arc-chain-miss">{m.clear >= 0.5 ? "" : "likely miss · "}miss: {m.lives - m.play > 0 ? `${m.lives - m.play} ${m.lives - m.play === 1 ? "life" : "lives"} left` : "back to step 1"}</span>
            </li>
          );
        })}
      </ol>
      {picked ? (
        <div className="arc-chain-detail">
          <p className="arc-sub">Step {picked.step} at {when(kickOf(picked), now)}: {picked.play} lineup{picked.play > 1 ? "s" : ""}, {pct(picked.clear)} that one clears, settles about {when(picked.settles, now)}.</p>
          {picked.gain !== undefined ? <p className="arc-sub">{picked.same
            ? "No window before the set ends beats the fastest chain by 15 points here, so this step plays the fastest chain's move."
            : `+${gainOf(picked)} points over the fastest chain (${pct(picked.clear - picked.gain)}), the nearest window that beats it by 15.`}</p> : null}
          {lineups.length > 1 ? <div className="arc-modes" role="group" aria-label="Chain lineup">{lineups.map((_, i) => <button key={i} type="button" aria-pressed={shown === i} onClick={() => setShown(i)}>Lineup {i + 1}</button>)}</div> : null}
          {lineups[shown] ? <LineupCards lineup={lineups[shown]} captainBonus={captainBonus} /> : null}
          <button type="button" className="arc-small" onClick={() => onBuild(picked, lineups[shown] ?? null)}>Edit in Pick teams</button>
          <Outcomes plan={plan} picked={picked} now={now} surest={surest} onFollow={(cleared, after) => follow(picked, moves.indexOf(picked), cleared, after)} />
        </div>
      ) : null}
    </section>
  );
});

export default function ArcadePlanner({ arcade, outlooks, captainBonus, status }: { arcade: Arcade; outlooks: Map<string, Outlook[]>; captainBonus: number; status: Record<string, PlayerStatus> }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- Advance the planning clock on fresh board/forecast inputs, without rebuilding it when a picker control changes.
  const now = useMemo(() => Date.now(), [arcade, outlooks]);
  const steps = useMemo(() => stepInfos(arcade), [arcade]);
  const current = climbStep(arcade);
  const { start, waiting, after } = useMemo(() => climbStart(arcade, steps, current), [arcade, steps, current]);
  const all = useMemo(() => [...outlooks.values()].flat(), [outlooks]);
  const { plan, updating } = useClimb(all, steps, start, captainBonus, now);
  const busy = useMemo(() => new Set(start.held.filter((h) => h.until > now).map((h) => h.card)), [start.held, now]);
  const games = useMemo(() => (arcade.games ?? []).filter((g) => Date.parse(g.kickoff) > now && (outlooks.get(g.id) ?? []).length), [arcade.games, outlooks, now]);
  const storageKey = `sofix-arcade-teams:${arcade.set.slug}:${arcade.board?.id ?? ""}`;
  const [selection, setSelection] = useState<{ chosen: Set<string>; aim: number; preset: { plan: ClimbPlan; lineup: Lineup } | null; fromMove?: boolean } | null>(() => {
    try {
      const saved = SavedTeams.safeParse(JSON.parse(localStorage.getItem(storageKey) ?? "null"));
      return saved.success ? { chosen: new Set(saved.data.games), aim: saved.data.aim, preset: null } : null;
    } catch { return null; }
  });
  useEffect(() => {
    if (!selection) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ games: [...selection.chosen], aim: selection.aim })); } catch { /* Storage blocked or full: retain the choice for this visit. */ }
  }, [selection, storageKey]);
  // One Set per change, not per render: Pick teams reruns its lineup search whenever this changes.
  const chosen = useMemo(() => {
    const available = new Set(games.map((g) => g.id));
    // Starts empty (owner, 9 Nov 2026: "prepick the teams instead of letting me pick"): only your picks, kept between visits.
    return new Set([...(selection?.chosen ?? [])].filter((id) => available.has(id)));
  }, [games, selection?.chosen]);
  // One aim with Batch (useArcadeAim); the one saved with your picks before 10 Nov 2026 counts until you choose again.
  const [sharedAim, setSharedAim] = useArcadeAim(aimKey(arcade.set.slug, arcade.board?.id ?? ""));
  const wantedAim = sharedAim ?? selection?.aim ?? plan?.path[0]?.step ?? current;
  const aim = aimStep(arcade.board?.steps ?? [], wantedAim, current, !!selection?.fromMove);
  const preset = selection?.preset?.plan === plan ? selection.preset.lineup : null;
  // A move's step stays the aim while you change its games (it may be a step claimed before the climb restarts).
  const setChosen = (next: Set<string>) => setSelection({ chosen: next, aim, preset: null, fromMove: selection?.fromMove });
  const setAim = (next: number) => { setSharedAim(next); setSelection({ chosen, aim: next, preset: null, fromMove: selection?.fromMove }); };
  const lives = start.step === current ? start.lives : 0;
  const waitingNote = after
    ? `Your ${waiting.length} lineup${waiting.length > 1 ? "s" : ""} on step ${current} settle${waiting.length > 1 ? "" : "s"} first (about ${when(after.at, now)}); the plan goes on as if one clears it.`
    : waiting.length ? `You have ${waiting.length} lineup${waiting.length > 1 ? "s" : ""} waiting on step ${current}: if one clears it, Sorare cancels any other you entered on the step.` : null;
  const build = useCallback((move: Move, lineup: Lineup | null) => {
    setSharedAim(move.step);
    setSelection({ chosen: new Set(move.list.map((o) => o.game.id)), aim: move.step, preset: lineup && plan ? { plan, lineup } : null, fromMove: true });
    document.getElementById("arc-teams-title")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
  }, [plan, setSharedAim]);
  if (!games.length) return <p className="arc-note">No game of your cards is left before the set ends.</p>;
  return (
    <>
      {plan ? <>
        <YourMove plan={plan} steps={steps} boardSteps={arcade.board?.steps ?? []} current={current} lives={lives} captainBonus={captainBonus} now={now} onBuild={build} waitingNote={waitingNote} updating={updating} />
        <Chain plan={plan} captainBonus={captainBonus} now={now} onBuild={build} />
      </> : <p className="arc-read-state" role="status">Planning the climb…</p>}
      <ArcadeTeams arcade={arcade} outlooks={outlooks} status={status} chosen={chosen} onToggle={(id) => { const next = new Set(chosen); if (next.has(id)) next.delete(id); else next.add(id); setChosen(next); }} now={now} />
      <section className="arc-plan" aria-labelledby="arc-teams-title">
        <div className="arc-plan-head"><h2 id="arc-teams-title">Pick teams</h2></div>
        <PickTeams arcade={arcade} outlooks={outlooks} captainBonus={captainBonus} chosen={chosen} setChosen={setChosen} aim={aim} setAim={setAim} busy={busy} now={now} preset={preset} />
      </section>
    </>
  );
}

