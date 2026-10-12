import type { ReactNode } from "react";
import { percent, points, type Line, type Versus, type VersusFigures } from "../../lib/audit";
import { POSITION_NAME } from "../../lib/leagueAudit";

const LINES: Line[] = ["GK", "DEF", "MID", "FWD"];
const SIDES = [["sofix", "Sofix"], ["sorare", "Sorare"]] as const;
const count = (n: number) => n.toLocaleString("en-GB");
const plural = (n: number, one: string) => `${count(n)} ${one}${n === 1 ? "" : "s"}`;

/** Which side was right more often: the higher share within 7 points. Equal or missing: neither. */
function better(figures: VersusFigures): "sofix" | "sorare" | null {
  const { sofix, sorare } = figures;
  return sofix.within === null || sorare.within === null || sofix.within === sorare.within ? null : sofix.within > sorare.within ? "sofix" : "sorare";
}

/** One row of the table: the same figure for Sofix and for Sorare, the better of the two in bold. */
function Row({ name, figures, unit = "start" }: { name: string; figures: VersusFigures; unit?: string }) {
  const best = (a: number | null, b: number | null, low: boolean) => (a === null || b === null || a === b ? null : (low ? a < b : a > b) ? "sofix" : "sorare");
  const cell = (sofix: string, sorare: string, winner: "sofix" | "sorare" | null) => (
    <td>
      <span className={winner === "sofix" ? "w" : ""}>{sofix}</span>
      <span className="au-vs-sep" aria-hidden="true">·</span>
      <span className={winner === "sorare" ? "w" : ""}>{sorare}</span>
    </td>
  );
  const { sofix, sorare } = figures;
  return (
    <tr>
      <th scope="row">
        {name} <small>{plural(figures.starts, unit)}</small>
      </th>
      {cell(percent(sofix.within), percent(sorare.within), best(sofix.within, sorare.within, false))}
      {cell(points(sofix.miss), points(sorare.miss), best(sofix.miss, sorare.miss, true))}
      {cell(points(sofix.lean, true), points(sorare.lean, true), best(sofix.lean === null ? null : Math.abs(sofix.lean), sorare.lean === null ? null : Math.abs(sorare.lean), true))}
    </tr>
  );
}

/**
 * Audit · xScore: Sofix's xScore against Sorare's projection (the owner, 12 and 13 Oct 2026). Each one's success rate in big: a number
 * within 7 points of what the player scored is a success, anything else is a miss. Every player with both numbers saved before the lock
 * counts on his own, starters and the men who came on as two separate rates, from the first game checked (no floor).
 */
export default function VersusAudit({ versus, updated = null }: { versus: Versus; updated?: ReactNode }) {
  const { all, subs } = versus;
  const best = better(all);
  const rows = [{ name: "All", figures: all }, ...LINES.map((line) => ({ name: POSITION_NAME[line], figures: versus.positions[line] }))];
  const none = versus.recorded && !all.starts && !subs.starts ? "Waiting for results" : "Nothing checked yet";
  return (
    <>
      <section className="ax-hero">
        <div className="ax-lead">
          <h1>Sofix against Sorare</h1>
          <p className="ax-sub">How often each expected score, saved before the lock, landed within 7 points of the real one</p>
          <dl className="ax-duo">
            {SIDES.map(([side, name]) => (
              <div key={side}>
                <dt>{name} · starters</dt>
                <dd className="ax-duo-n">{percent(all[side].within)}</dd>
                <dd className="ax-duo-s">{all.starts ? `${points(all[side].miss)} pts off on average` : none}</dd>
                {best === side ? <dd className="au-result-best">Right more often</dd> : <dd className="au-result-best" aria-hidden="true">&nbsp;</dd>}
                <dd className="ax-duo-m">
                  {name} · substitutes
                  <b>{percent(subs[side].within)}</b>
                </dd>
                <dd className="ax-duo-s">{subs.starts ? `${points(subs[side].miss)} pts off on average` : none}</dd>
              </div>
            ))}
          </dl>
          <ul className="ax-facts">
            <li><strong>{count(all.starts)}</strong> {all.starts === 1 ? "start" : "starts"}</li>
            <li><strong>{count(subs.starts)}</strong> came on</li>
            <li><strong>{versus.settled}</strong> of {versus.recorded} {versus.recorded === 1 ? "week" : "weeks"} checked</li>
          </ul>
          {updated}
        </div>
        <section className="au-w lg-card" aria-labelledby="au-vs-graph">
          <h2 id="au-vs-graph">Within 7 points, by position</h2>
          <p className="lg-cap">Share of starts where the number landed within 7 points of the score.</p>
          <ul className="lg-vs ax-two">
            {rows.map(({ name, figures }) => (
              <li key={name}>
                <span>
                  {name}
                  <small>{plural(figures.starts, "start")}</small>
                </span>
                {SIDES.map(([side, label]) => (
                  <span className="ax-two-row" key={side}>
                    <span className="vb" aria-hidden="true">
                      <i className={side === "sofix" ? "now" : "sorare"} style={{ width: `${(figures[side].within ?? 0) * 100}%` }} />
                    </span>
                    <b>
                      <span className="visually-hidden">{label} </span>
                      {percent(figures[side].within)}
                    </b>
                  </span>
                ))}
              </li>
            ))}
          </ul>
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
      <section className="au-w au-vs" aria-labelledby="au-vs-h">
        <h2 id="au-vs-h">The same games, three ways</h2>
        <table className="au-vs-t">
          <caption className="visually-hidden">Sofix&apos;s xScore against Sorare&apos;s projection, on the games the player started and the games he came on in</caption>
          <thead>
            <tr>
              <th scope="col" />
              <th scope="col" title="How often within 7 points of what he scored">
                Within 7 <small>SF · SO</small>
              </th>
              <th scope="col" title="How far off, on average, in points">
                Off by <small>SF · SO</small>
              </th>
              <th scope="col" title="Too high (+) or too low (−) on average">
                Leans <small>SF · SO</small>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ name, figures }) => (
              <Row key={name} name={name === "All" ? "Starters" : name} figures={figures} />
            ))}
            <Row name="Substitutes" figures={subs} unit="game" />
          </tbody>
        </table>
        {versus.weeks.length ? (
          <ol className="au-vs-weeks" aria-label="Week by week">
            {versus.weeks.map((week) => (
              <li key={week.week}>
                <b>GW{week.week}</b>
                <span>
                  {plural(week.starts, "start")} · within 7: Sofix {percent(week.sofix.within)}, Sorare {percent(week.sorare.within)} · off by {points(week.sofix.miss)} vs {points(week.sorare.miss)}
                </span>
              </li>
            ))}
          </ol>
        ) : null}
      </section>
    </>
  );
}
