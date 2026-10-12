import type { ReactNode } from "react";
import { accuracy, percent, points, type Line, type Versus, type VersusFigures } from "../../lib/audit";
import { POSITION_NAME } from "../../lib/leagueAudit";

const LINES: Line[] = ["GK", "DEF", "MID", "FWD"];
const SIDES = [["sofix", "Sofix"], ["sorare", "Sorare"]] as const;
const count = (n: number) => n.toLocaleString("en-GB");

/** Which side was nearer: the lower miss. Equal or missing: neither. */
function closer(figures: VersusFigures): "sofix" | "sorare" | null {
  const { sofix, sorare } = figures;
  return sofix.miss === null || sorare.miss === null || sofix.miss === sorare.miss ? null : sofix.miss < sorare.miss ? "sofix" : "sorare";
}

/** One row of the table: the same figure for Sofix and for Sorare, the better of the two in bold. Under the floor it says so instead. */
function Row({ name, figures, floor }: { name: string; figures: VersusFigures; floor: number }) {
  if (figures.starts < floor) {
    return (
      <tr>
        <th scope="row">{name}</th>
        <td colSpan={3} className="au-vs-few">
          Too few to tell · {figures.starts} of {floor} starts
        </td>
      </tr>
    );
  }
  const better = (a: number | null, b: number | null, low: boolean) => (a === null || b === null || a === b ? null : (low ? a < b : a > b) ? "sofix" : "sorare");
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
        {name} <small>{count(figures.starts)} starts</small>
      </th>
      {cell(points(sofix.miss), points(sorare.miss), better(sofix.miss, sorare.miss, true))}
      {cell(percent(sofix.within), percent(sorare.within), better(sofix.within, sorare.within, false))}
      {cell(points(sofix.lean, true), points(sorare.lean, true), better(sofix.lean === null ? null : Math.abs(sofix.lean), sorare.lean === null ? null : Math.abs(sorare.lean), true))}
    </tr>
  );
}

/**
 * Audit · xScore: Sofix's xScore against Sorare's projection (the owner, 12 Oct 2026: each one's accuracy in big, every player counted
 * on his own, no pairs). Both numbers are written down for every LaLiga player before each lock and scored on the games he started.
 * Accuracy is 100 minus the average points off, the Scores page's figure.
 */
export default function VersusAudit({ versus, floor, updated = null }: { versus: Versus; floor: number; updated?: ReactNode }) {
  const all = versus.all;
  const enough = all.starts >= floor;
  const best = enough ? closer(all) : null;
  const rows = [{ name: "All", figures: all }, ...LINES.map((line) => ({ name: POSITION_NAME[line], figures: versus.positions[line] }))];
  return (
    <>
      <section className="ax-hero">
        <div className="ax-lead">
          <h1>Sofix against Sorare</h1>
          <p className="ax-sub">Both expected scores, saved before each lock, against what the player scored</p>
          <dl className="ax-duo">
            {SIDES.map(([side, name]) => {
              const found = enough ? accuracy(all[side].miss) : null;
              return (
                <div key={side}>
                  <dt>{name} accuracy</dt>
                  <dd className="ax-duo-n">{found === null ? "–" : `${found}%`}</dd>
                  <dd className="ax-duo-s">{found !== null ? `${points(all[side].miss)} pts off on average` : versus.recorded && !all.starts ? "Waiting for results" : "Too few to tell"}</dd>
                  {best === side ? <dd className="au-result-best">Closer</dd> : null}
                </div>
              );
            })}
          </dl>
          <ul className="ax-facts">
            <li><strong>{count(all.starts)}</strong>{enough ? " starts" : ` of ${floor} starts`}</li>
            <li><strong>{versus.settled}</strong> of {versus.recorded} {versus.recorded === 1 ? "week" : "weeks"} checked</li>
            {enough && all.sofixCloser !== null ? <li>Sofix closer on <strong>{percent(all.sofixCloser)}</strong></li> : null}
          </ul>
          {updated}
        </div>
        <section className="au-w lg-card" aria-labelledby="au-vs-graph">
          <h2 id="au-vs-graph">Accuracy by position</h2>
          <p className="lg-cap">100 minus the average points off, on every start with both numbers.</p>
          <ul className="lg-vs ax-two">
            {rows.map(({ name, figures }) => (
              <li key={name}>
                <span>
                  {name}
                  <small>{count(figures.starts)} starts</small>
                </span>
                {figures.starts < floor ? (
                  <span className="ax-few">Too few to tell</span>
                ) : (
                  SIDES.map(([side, label]) => {
                    const found = accuracy(figures[side].miss);
                    return (
                      <span className="ax-two-row" key={side}>
                        <span className="vb" aria-hidden="true">
                          <i className={side === "sofix" ? "now" : "sorare"} style={{ width: `${found ?? 0}%` }} />
                        </span>
                        <b>
                          <span className="visually-hidden">{label} </span>
                          {found === null ? "–" : `${found}%`}
                        </b>
                      </span>
                    );
                  })
                )}
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
        <h2 id="au-vs-h">The same starts, three ways</h2>
        <table className="au-vs-t">
          <caption className="visually-hidden">Sofix&apos;s xScore against Sorare&apos;s projection, on the games the player started</caption>
          <thead>
            <tr>
              <th scope="col" />
              <th scope="col" title="How far off, on average, in points">
                Off by <small>SF · SO</small>
              </th>
              <th scope="col" title="How often within 7 points of what he scored">
                Within 7 <small>SF · SO</small>
              </th>
              <th scope="col" title="Too high (+) or too low (−) on average">
                Leans <small>SF · SO</small>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ name, figures }) => (
              <Row key={name} name={name} figures={figures} floor={floor} />
            ))}
          </tbody>
        </table>
        {versus.weeks.length ? (
          <ol className="au-vs-weeks" aria-label="Week by week">
            {versus.weeks.map((week) => (
              <li key={week.week}>
                <b>GW{week.week}</b>
                <span>
                  {week.starts < floor
                    ? `Too few to tell · ${week.starts} of ${floor} starts`
                    : `${week.starts} starts · Sofix ${accuracy(week.sofix.miss)}% · Sorare ${accuracy(week.sorare.miss)}% · off by ${points(week.sofix.miss)} vs ${points(week.sorare.miss)}`}
                </span>
              </li>
            ))}
          </ol>
        ) : null}
      </section>
    </>
  );
}
