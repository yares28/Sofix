import type { ReactNode } from "react";
import { percent, type LineupsAudit as Lineups, type PlanTally } from "../../lib/audit";
import { judged, NO_PLAN, PRIZE_NAME, PRIZES, real, share, yourPrizes, type Won } from "../../lib/lineupsAudit";
import type { SavedWeek } from "../../lib/myWeeks";
import type { StrategyWeek } from "../../lib/audit";
import WeekComparison from "./WeekComparison";

const SIDES = [["sofix", "Sofix", "now"], ["sorare", "Sorare", "sorare"]] as const;
const plural = (n: number) => `${n.toLocaleString("en-GB")} lineup${n === 1 ? "" : "s"}`;
const hit = (plan: PlanTally) => share(plan.hit, plan.scored);
const higher = (a: number | null, b: number | null) => (a === null || b === null || a === b ? null : a > b ? "sofix" : "sorare");

/** One side's lineups as a single bar, split by the best prize each won: a card, cash, essence, XP only, nothing. */
function Prizes({ name, note, won }: { name: string; note: string; won: Won }) {
  const of = judged(won);
  return (
    <li>
      <span>
        {name}
        <small>{note}</small>
      </span>
      <span>
        <span className="au-lu-bar" aria-hidden="true">
          {of ? PRIZES.map((kind) => (won[kind] ? <i key={kind} className={kind} style={{ flexGrow: won[kind] }} /> : null)) : null}
        </span>
        <small>{of ? PRIZES.filter((kind) => won[kind]).map((kind) => `${PRIZE_NAME[kind]} ${won[kind]}`).join(" · ") : "Nothing checked yet"}</small>
      </span>
      <b>
        {percent(share(real(won), of))}
        <small>essence or better</small>
      </b>
    </li>
  );
}

/**
 * Audit · Lineups (the owner, 13 Oct 2026). Two questions, apart. The score: how often a lineup landed within 15 points of the score
 * expected for it, for Sofix's and Sorare's plans as saved before the lock. The prize: what each lineup won, yours, Sofix's and Sorare's,
 * by its best prize, because XP is not essence. The big figures are each side's best plan; every plan has its own row.
 */
export default function LineupsAudit({ lineups, saved, updated = null, weeks = [], pics = {} }: { lineups: Lineups; saved: SavedWeek[]; updated?: ReactNode; weeks?: StrategyWeek[]; pics?: Record<string, string> }) {
  const best = { sofix: lineups.plans.sofix[0] ?? NO_PLAN, sorare: lineups.plans.sorare[0] ?? NO_PLAN };
  const closer = higher(hit(best.sofix), hit(best.sorare));
  const ranks = [...new Set([...lineups.plans.sofix, ...lineups.plans.sorare].map((plan) => plan.rank))].sort((a, b) => a - b);
  const plan = (side: "sofix" | "sorare", rank: number) => lineups.plans[side].find((p) => p.rank === rank) ?? { ...NO_PLAN, rank };
  const yours = yourPrizes(saved);
  const pair = (a: number | null, b: number | null) => {
    const winner = higher(a, b);
    return (
      <td>
        <span className={winner === "sofix" ? "w" : ""}>{percent(a)}</span>
        <span className="au-vs-sep" aria-hidden="true">·</span>
        <span className={winner === "sorare" ? "w" : ""}>{percent(b)}</span>
      </td>
    );
  };
  return (
    <>
      <section className="ax-hero">
        <div className="ax-lead">
          <h1>Lineups</h1>
          <p className="ax-sub">How often a lineup&apos;s real score landed within {lineups.band} points of the score expected before the lock</p>
          <dl className="ax-duo">
            {SIDES.map(([side, name]) => (
              <div key={side}>
                <dt>{name} · best plan</dt>
                <dd className="ax-duo-n">{percent(hit(best[side]))}</dd>
                <dd className="ax-duo-s">{best[side].scored ? `${best[side].hit} of ${plural(best[side].scored)} within ${lineups.band}` : "Nothing checked yet"}</dd>
                {closer === side ? <dd className="au-result-best">Right more often</dd> : <dd className="au-result-best" aria-hidden="true">&nbsp;</dd>}
              </div>
            ))}
          </dl>
          <ul className="ax-facts">
            <li><strong>{lineups.weeks.length}</strong> {lineups.weeks.length === 1 ? "week" : "weeks"} checked</li>
            <li><strong>{ranks.length}</strong> {ranks.length === 1 ? "plan" : "plans"} a week</li>
          </ul>
          {updated}
        </div>
        <section className="au-w lg-card" aria-labelledby="au-lu-plans">
          <h2 id="au-lu-plans">Within {lineups.band} points, every plan</h2>
          <p className="lg-cap">Plan 1 is the best plan; the others are what Sofix and Sorare offered beside it.</p>
          {ranks.length ? (
            <ul className="lg-vs ax-two">
              {ranks.map((rank) => (
                <li key={rank}>
                  <span>
                    Plan {rank}
                    <small>{plural(plan("sofix", rank).scored)} · {plan("sorare", rank).scored}</small>
                  </span>
                  {SIDES.map(([side, label, colour]) => (
                    <span className="ax-two-row" key={side}>
                      <span className="vb" aria-hidden="true">
                        <i className={colour} style={{ width: `${(hit(plan(side, rank)) ?? 0) * 100}%` }} />
                      </span>
                      <b>
                        <span className="visually-hidden">{label} </span>
                        {percent(hit(plan(side, rank)))}
                      </b>
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          ) : (
            <p className="au-sub">No saved plan has finished yet.</p>
          )}
          <p className="lg-key">
            <span>
              <i className="now" />
              Sofix
            </span>
            <span>
              <i className="sorare" />
              Sorare
            </span>
          </p>
        </section>
      </section>

      <section className="au-w au-vs" aria-labelledby="au-lu-won">
        <h2 id="au-lu-won">What the lineups won</h2>
        <p className="au-sub">Each lineup counts once, by its best prize. XP alone is not counted as a win.</p>
        <ul className="au-lu">
          <Prizes name="You" note={`${plural(judged(yours))} entered`} won={yours} />
          <Prizes name="Sofix" note={`best plan · ${plural(best.sofix.judged)}`} won={best.sofix.won} />
          <Prizes name="Sorare" note={`best plan · ${plural(best.sorare.judged)}`} won={best.sorare.won} />
        </ul>
        <p className="lg-key au-lu-key">
          {PRIZES.map((kind) => (
            <span key={kind}>
              <i className={kind} />
              {PRIZE_NAME[kind]}
            </span>
          ))}
        </p>
      </section>

      {ranks.length ? (
        <section className="au-w au-vs" aria-labelledby="au-lu-all">
          <h2 id="au-lu-all">Every plan, both ways</h2>
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- keyboard access to the scrollable comparison */}
          <div className="au-lu-scroll" role="region" aria-label="Plan comparison" tabIndex={0}>
            <table className="au-vs-t">
              <caption className="visually-hidden">Each plan&apos;s lineups, Sofix&apos;s and Sorare&apos;s: how often the score was hit and what they won</caption>
              <thead>
                <tr>
                  <th scope="col" />
                  <th scope="col">Within {lineups.band} <small>SF · SO</small></th>
                  <th scope="col">Essence or better <small>SF · SO</small></th>
                  <th scope="col">XP only <small>SF · SO</small></th>
                  <th scope="col">Nothing <small>SF · SO</small></th>
                </tr>
              </thead>
              <tbody>
                {ranks.map((rank) => {
                  const [a, b] = [plan("sofix", rank), plan("sorare", rank)];
                  return (
                    <tr key={rank}>
                      <th scope="row">
                        Plan {rank} <small>{plural(a.lineups)} · {b.lineups}</small>
                      </th>
                      {pair(hit(a), hit(b))}
                      {pair(share(real(a.won), a.judged), share(real(b.won), b.judged))}
                      {pair(share(a.won.xp, a.judged), share(b.won.xp, b.judged))}
                      <td>
                        {percent(share(a.won.none, a.judged))}
                        <span className="au-vs-sep" aria-hidden="true">·</span>
                        {percent(share(b.won.none, b.judged))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ol className="au-vs-weeks" aria-label="Week by week">
            {lineups.weeks.map((week) => {
              const [a, b] = [week.sofix[0] ?? NO_PLAN, week.sorare[0] ?? NO_PLAN];
              const line = (
                <>
                  <b>GW{week.number}</b>
                  <span>
                    best plans · within {lineups.band}: Sofix {a.hit}/{a.scored}, Sorare {b.hit}/{b.scored} · essence or better: Sofix {real(a.won)}/{a.judged}, Sorare {real(b.won)}/{b.judged}
                    {week.final ? "" : " · still being checked"}
                  </span>
                </>
              );
              const compare = weeks.find((w) => w.slug === week.slug);
              return (
                <li key={week.slug}>
                  {compare ? (
                    <details>
                      <summary>{line}</summary>
                      <WeekComparison boards={compare.boards} pics={pics} />
                    </details>
                  ) : (
                    line
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}
    </>
  );
}
