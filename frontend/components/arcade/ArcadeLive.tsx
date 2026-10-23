"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { readArcadeLineups, type Arcade, type ArcadeLineup } from "../../lib/arcade";
import { bigReward, cutLosses, liveLineup, madridDate, planDay, type Outlook } from "../../lib/arcadePlan";
import { madridTime, pct, pts } from "./ArcadePlanner";
import ArcadeAction from "./ArcadeAction";

const LIVE_EVERY_MS = 2 * 60_000; // only while a game of yours is live and the page is in front: Sorare, through your tab, never Neon

/**
 * Step 6: your entered lineups while they play. Dead when the cards still able to score cannot reach the target even at their best;
 * "cut losses" (cancel on Sorare, which costs the life a miss would) only when the cards still to play add more to the next planned
 * lineup than this one has left. Shown here only; nothing is entered or cancelled from Sofix.
 */
export default function ArcadeLive({ arcade, outlooks, captainBonus, actions }: { arcade: Arcade; outlooks: Map<string, Outlook[]>; captainBonus: number; actions: HTMLElement | null }) {
  const [entered, setEntered] = useState(() => new Map((arcade.board?.steps ?? []).map((s) => [s.id, s.entered])));
  const [now, setNow] = useState(() => Date.now());
  const [state, setState] = useState<"idle" | "reading" | "failed">("idle");
  useEffect(() => {
    setEntered(new Map((arcade.board?.steps ?? []).map((s) => [s.id, s.entered])));
    setNow(Date.now());
  }, [arcade]);
  const refresh = useCallback(async () => {
    setState("reading");
    const read = await readArcadeLineups();
    if (read) setEntered(read);
    setNow(Date.now());
    setState(read ? "idle" : "failed");
  }, []);

  const steps = useMemo(() => arcade.board?.steps ?? [], [arcade]);
  const open = useMemo(() => steps.flatMap((step) => (entered.get(step.id) ?? [])
    .filter((l) => !l.cancelled && !l.draft && (l.live || l.cards.some((c) => !c.kickoff || Date.parse(c.kickoff) + 115 * 60_000 > now)))
    .map((lineup) => ({ step, lineup }))), [steps, entered, now]);
  const anyLive = open.some(({ lineup }) => lineup.live);
  useEffect(() => {
    if (!anyLive) return;
    const timer = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, LIVE_EVERY_MS);
    return () => clearInterval(timer);
  }, [anyLive, refresh]);

  const find = useCallback((lineup: ArcadeLineup) => (slug: string | null) => {
    const card = lineup.cards.find((c) => c.slug === slug);
    return card?.game ? outlooks.get(card.game)?.find((o) => o.card.slug === slug) ?? null : null;
  }, [outlooks]);
  const pictures = useMemo(() => new Map(arcade.cards.flatMap((c) => (c.picture ? [[c.slug, c.picture] as const] : []))), [arcade.cards]);
  const busy = useMemo(() => new Set(open.flatMap(({ lineup }) => lineup.cards.flatMap((c) => (c.slug ? [c.slug] : [])))), [open]);
  const infos = useMemo(() => steps.map((s) => ({ number: s.number, target: s.target, lives: s.lineups?.remaining ?? 4, big: bigReward(s.rewards) })), [steps]);

  const action = actions ? createPortal(<ArcadeAction label="Refresh scores" kind="scores" onClick={() => void refresh()} busy={state === "reading"} />, actions) : null;
  if (!open.length) return <>{action}{state === "failed" ? <p className="arc-note" role="status">Sorare did not answer; scores could not be refreshed.</p> : null}</>;
  return (
    <>{action}
    <section className="arc-live" aria-labelledby="arc-live-title">
      <div className="arc-plan-head">
        <h2 id="arc-live-title">Your lineups on Sorare</h2>
      </div>
      {state === "failed" ? <p className="arc-note" role="status">Sorare did not answer; the scores below are from the last read.</p> : null}
      <ul className="arc-races">
        {open.map(({ step, lineup }, index) => {
          const verdict = liveLineup(lineup.cards, step.target, find(lineup), now);
          const toPlay = verdict.cards.filter((c) => c.state === "to play" && c.outlook);
          // What its cards still to play would add to the next planned lineup of their day if this one were cancelled.
          const day = toPlay.length ? madridDate(toPlay.map((c) => c.outlook!.game.kickoff).sort()[0]!) : null;
          let gain = 0;
          if (day && lineup.forfeitable) {
            const pool = [...outlooks.values()].flat().filter((o) => madridDate(o.game.kickoff) === day && Date.parse(o.game.kickoff) > now);
            const freed = new Set(toPlay.map((c) => c.slug));
            const current = arcade.board?.current ?? step.number;
            const without = planDay(pool, infos, current, captainBonus, busy)[0]?.chance ?? 0;
            const withCards = planDay(pool, infos, current, captainBonus, new Set([...busy].filter((s) => !freed.has(s))))[0]?.chance ?? 0;
            gain = Math.max(0, withCards - without);
          }
          const cut = cutLosses(verdict, gain, lineup.forfeitable);
          // The race: points so far, what the cards still able to score add at their best, and the target as the finish line.
          const reach = Number.isFinite(verdict.ceiling) ? verdict.ceiling : verdict.now + Math.max(0, step.target - verdict.now);
          const scale = Math.max(step.target, reach, verdict.now) * 1.12;
          const at = (v: number) => `${Math.min(100, (v / scale) * 100)}%`;
          return (
            <li key={lineup.id} className={`arc-race${verdict.dead ? " is-dead" : ""}`} style={{ "--i": index } as CSSProperties}>
              <div className="arc-race-hero">
                <small>Step {step.number} · {step.target} pts</small>
                {verdict.dead ? <b className="is-dead">Dead</b> : <b>{pct(verdict.chance)}</b>}
                <span>{verdict.dead ? `Even at their best its cards cannot reach ${step.target}.` : `chance left · ${pts(verdict.now)} of ${step.target}${Number.isFinite(verdict.ceiling) ? `, at most ${pts(verdict.ceiling)}` : ""}`}</span>
              </div>
              <div>
                <div className="arc-track" role="img" aria-label={`${pts(verdict.now)} scored of ${step.target}${Number.isFinite(verdict.ceiling) ? `, at most ${pts(verdict.ceiling)}` : ""}`}>
                  <span className="arc-track-run" style={{ width: at(verdict.now) }} />
                  {Number.isFinite(verdict.ceiling) ? <span className="arc-track-fuel" style={{ left: at(verdict.now), width: `calc(${at(verdict.ceiling)} - ${at(verdict.now)})` }} /> : null}
                  {verdict.dead ? <span className="arc-track-gap" style={{ left: at(verdict.ceiling), width: `calc(${at(step.target)} - ${at(verdict.ceiling)})` }} /> : null}
                  <span className="arc-track-finish" style={{ left: at(step.target) }} />
                </div>
                <p className="arc-track-legend"><span><b>{pts(verdict.now)}</b> scored</span>{Number.isFinite(verdict.ceiling) ? <span><b>+{pts(verdict.ceiling - verdict.now)}</b> at their best</span> : <span>some cards have no past scores yet</span>}<span>finish <b>{step.target}</b></span></p>
                <ol className="arc-race-cards">
                  {verdict.cards.map((c, i) => {
                    const picture = c.outlook?.card.picture ?? pictures.get(c.slug ?? "") ?? null;
                    return (
                      <li key={c.slug ?? i} data-state={c.state} className={c.state === "played" && c.points === 0 ? "is-zero" : undefined}>
                        <span>
                          {picture
                            // eslint-disable-next-line @next/next/no-img-element -- Sorare's card art, as on the other pages
                            ? <img src={picture} alt={c.name} width={72} height={116} loading="lazy" />
                            : null}
                          <b>{c.state === "to play" ? "–" : pts(c.points)}</b>
                        </span>
                        <span className="arc-card-name">{c.name}</span>
                        <span>{c.state === "to play" ? (c.outlook ? `plays ${madridTime(c.outlook.game.kickoff)}` : "to play") : c.state === "live" ? "live" : c.points === 0 ? "did not score" : "played"}</span>
                      </li>
                    );
                  })}
                </ol>
                {cut ? <p className="arc-advice"><b>Cut losses: cancel it on Sorare</b> (costs a life, as a miss would). Its cards still to play raise the next lineup&apos;s chance by {pct(gain)}, more than the {pct(verdict.chance)} this one has left.</p> : null}
                {verdict.dead && !lineup.forfeitable ? <p className="arc-sub">Sorare no longer lets it be cancelled.</p> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section></>
  );
}
