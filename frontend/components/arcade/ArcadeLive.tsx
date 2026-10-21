"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { readArcadeLineups, type Arcade, type ArcadeLineup } from "../../lib/arcade";
import { bigReward, cutLosses, liveLineup, madridDate, planDay, type Outlook } from "../../lib/arcadePlan";
import { madridTime, pct, pts } from "./ArcadePlanner";

const LIVE_EVERY_MS = 2 * 60_000; // only while a game of yours is live and the page is in front: Sorare, through your tab, never Neon

/**
 * Step 6: your entered lineups while they play. Dead when the cards still able to score cannot reach the target even at their best;
 * "cut losses" (cancel on Sorare, which costs the life a miss would) only when the cards still to play add more to the next planned
 * lineup than this one has left. Shown here only; nothing is entered or cancelled from Sofix.
 */
export default function ArcadeLive({ arcade, outlooks, captainBonus }: { arcade: Arcade; outlooks: Map<string, Outlook[]>; captainBonus: number }) {
  const [entered, setEntered] = useState(() => new Map((arcade.board?.steps ?? []).map((s) => [s.id, s.entered])));
  const [now, setNow] = useState(() => Date.now());
  const [state, setState] = useState<"idle" | "reading" | "failed">("idle");
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
  const busy = useMemo(() => new Set(open.flatMap(({ lineup }) => lineup.cards.flatMap((c) => (c.slug ? [c.slug] : [])))), [open]);
  const infos = useMemo(() => steps.map((s) => ({ number: s.number, target: s.target, lives: s.lineups?.remaining ?? 4, big: bigReward(s.rewards) })), [steps]);

  if (!open.length) return null;
  return (
    <section className="arc-live" aria-labelledby="arc-live-title">
      <div className="arc-plan-head">
        <h2 id="arc-live-title">Your lineups on Sorare</h2>
        <button type="button" className="arc-small" onClick={() => void refresh()} disabled={state === "reading"}>{state === "reading" ? "Reading…" : "Refresh scores"}</button>
      </div>
      {state === "failed" ? <p className="arc-note" role="status">Sorare did not answer; the scores below are from the last read.</p> : null}
      <ul className="arc-live-list">
        {open.map(({ step, lineup }) => {
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
          return (
            <li key={lineup.id} className={verdict.dead ? "is-dead" : undefined}>
              <p className="arc-when">
                <b>Step {step.number}</b> · {pts(verdict.now)} of {step.target} pts
                {verdict.dead ? <b className="arc-dead">Dead: even at their best its cards cannot reach {step.target}</b> : <span>{pct(verdict.chance)} chance left{Number.isFinite(verdict.ceiling) ? ` · at most ${pts(verdict.ceiling)}` : ""}</span>}
              </p>
              <ol className="arc-live-cards">
                {verdict.cards.map((c, i) => (
                  <li key={c.slug ?? i} data-state={c.state}>
                    <span>{c.name}</span>
                    <span>{c.state === "to play" ? `to play${c.outlook ? ` · ${madridTime(c.outlook.game.kickoff)}` : ""}` : `${pts(c.points)} pts${c.state === "live" ? " · live" : ""}`}</span>
                  </li>
                ))}
              </ol>
              {cut ? <p className="arc-warn"><b>Cut losses:</b> cancel it on Sorare (costs a life, as a miss would). Its cards still to play raise the next lineup&apos;s chance by {pct(gain)}, more than the {pct(verdict.chance)} this one has left.</p> : null}
              {verdict.dead && !lineup.forfeitable ? <p className="arc-sub">Sorare no longer lets it be cancelled.</p> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
