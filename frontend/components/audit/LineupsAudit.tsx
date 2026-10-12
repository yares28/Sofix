import type { ReactNode } from "react";
import { percent, type Rewards } from "../../lib/audit";
import { lineupSuccess, rate, type Tally } from "../../lib/lineupsAudit";
import type { SavedWeek } from "../../lib/myWeeks";

const SIDES = [["you", "Your lineups", "sorare"], ["sofix", "Sofix's lineups", "now"]] as const;
const said = (tally: Tally | null, none: string) => (tally && tally.of ? `${tally.won} of ${tally.of} lineup${tally.of === 1 ? "" : "s"} won a reward` : none);

/**
 * Audit · Lineups (the owner, 13 Oct 2026): how often a lineup won a reward, yours and Sofix's each in big and on its own, then week by
 * week. Shown from the first finished lineup, with the count beside it.
 */
export default function LineupsAudit({ rewards, saved, updated = null }: { rewards: Rewards; saved: SavedWeek[]; updated?: ReactNode }) {
  const result = lineupSuccess(saved, rewards);
  const rates = { you: rate(result.you), sofix: rate(result.sofix) };
  const best = rates.you === null || rates.sofix === null || rates.you === rates.sofix ? null : rates.you > rates.sofix ? "you" : "sofix";
  const none = { you: "No finished lineup saved yet", sofix: rewards.weeks.length ? "Counted at the next refresh" : "No finished week kept yet" };
  return (
    <section className="ax-hero" style={{ alignItems: "start" }}>
      <div className="ax-lead">
        <h1>Lineups</h1>
        <p className="ax-sub">How often a lineup won a reward</p>
        <dl className="ax-duo">
          {SIDES.map(([side, name]) => (
            <div key={side}>
              <dt>{name}</dt>
              <dd className="ax-duo-n">{percent(rates[side])}</dd>
              <dd className="ax-duo-s">{said(result[side], none[side])}</dd>
              {best === side ? <dd className="au-result-best">Won more often</dd> : <dd className="au-result-best" aria-hidden="true">&nbsp;</dd>}
            </div>
          ))}
        </dl>
        <ul className="ax-facts">
          <li><strong>{result.weeks.filter((week) => week.you).length}</strong> of your weeks</li>
          <li><strong>{result.weeks.filter((week) => week.sofix).length}</strong> of Sofix&apos;s weeks</li>
        </ul>
        {updated}
      </div>
      <section className="au-w lg-card" aria-labelledby="au-lu-weeks">
        <h2 id="au-lu-weeks">Week by week</h2>
        <p className="lg-cap">Share of each week&apos;s lineups that won essence, cash or a card.</p>
        {result.weeks.length ? (
          <ul className="lg-vs ax-two">
            {result.weeks.map((week) => (
              <li key={week.number}>
                <span>
                  GW{week.number}
                  <small>
                    {week.you ? `${week.you.won}/${week.you.of}` : "–"} · {week.sofix ? `${week.sofix.won}/${week.sofix.of}` : "–"}
                  </small>
                </span>
                {SIDES.map(([side, label, colour]) => (
                  <span className="ax-two-row" key={side}>
                    <span className="vb" aria-hidden="true">
                      <i className={colour} style={{ width: `${(rate(week[side]) ?? 0) * 100}%` }} />
                    </span>
                    <b>
                      <span className="visually-hidden">{label} </span>
                      {percent(rate(week[side]))}
                    </b>
                  </span>
                ))}
              </li>
            ))}
          </ul>
        ) : (
          <p className="au-sub">No finished lineup yet.</p>
        )}
        <p className="lg-key">
          <span>
            <i className="sorare" />
            You
          </span>
          <span>
            <i className="now" />
            Sofix
          </span>
        </p>
      </section>
    </section>
  );
}
