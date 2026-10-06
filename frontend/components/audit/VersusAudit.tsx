import { percent, points, type Line, type Versus, type VersusFigures } from "../../lib/audit";
import { POSITION_NAME, pct, type LeagueAudit } from "../../lib/leagueAudit";

const LINES: Line[] = ["GK", "DEF", "MID", "FWD"];

/** One row: the same figure for Sofix and for Sorare, the better of the two in bold. Under the floor it says so instead. */
function Row({ name, figures, floor }: { name: string; figures: VersusFigures; floor: number }) {
  if (figures.starts < floor) {
    return (
      <tr>
        <th scope="row">{name}</th>
        <td colSpan={4} className="au-vs-few">
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
        {name} <small>{figures.starts.toLocaleString("en-GB")} starts</small>
      </th>
      {cell(points(sofix.miss), points(sorare.miss), better(sofix.miss, sorare.miss, true))}
      {cell(percent(sofix.within), percent(sorare.within), better(sofix.within, sorare.within, false))}
      {cell(percent(sofix.pair), percent(sorare.pair), better(sofix.pair, sorare.pair, false))}
      {cell(points(sofix.lean, true), points(sorare.lean, true), better(sofix.lean === null ? null : Math.abs(sofix.lean), sorare.lean === null ? null : Math.abs(sorare.lean), true))}
    </tr>
  );
}

/**
 * Audit · Sorare vs Sofix (the owner, 6 Oct 2026: "see who is actually more precise"). Both numbers are written down for every LaLiga
 * player before each lock and scored on the games he started; the past games replayed sit below, apart, since a replay is not a promise
 * made in time.
 */
export default function VersusAudit({ versus, floor, league }: { versus: Versus; floor: number; league: LeagueAudit | null }) {
  const all = versus.all;
  const enoughAll = all.starts >= floor && all.sofixCloser !== null;
  return (
    <>
      <section className="au-w au-vs" aria-labelledby="au-vs-h">
        <p className="ax-big">
          {enoughAll ? <b>{percent(all.sofixCloser)}</b> : null}
          <span id="au-vs-h">
            {enoughAll
              ? "of starts, Sofix's number was closer than Sorare's"
              : `Too few to tell yet: ${all.starts.toLocaleString("en-GB")} of ${floor} starts checked`}
          </span>
        </p>
        <p className="au-sub">
          {versus.recorded
            ? `${versus.recorded} week${versus.recorded === 1 ? "" : "s"} written down before the lock, ${versus.settled} checked (a day after the last game).`
            : "Written down from the next lock on; checked a day after the week's last game."}
        </p>
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
              <th scope="col" title="Of two starters of one position, how often it rated the one who scored more higher">
                Better of two <small>SF · SO</small>
              </th>
              <th scope="col" title="Too high (+) or too low (−) on average">
                Leans <small>SF · SO</small>
              </th>
            </tr>
          </thead>
          <tbody>
            <Row name="All" figures={all} floor={floor} />
            {LINES.map((line) => (
              <Row key={line} name={POSITION_NAME[line]} figures={versus.positions[line]} floor={floor} />
            ))}
          </tbody>
        </table>
        {versus.weeks.length ? (
          <ol className="au-vs-weeks" aria-label="Week by week">
            {versus.weeks.map((week) => (
              <li key={week.week}>
                <b>GW{week.week}</b>
                <span>
                  {week.starts} starts · Sofix closer in {percent(week.sofixCloser)} · off by {points(week.sofix.miss)} vs {points(week.sorare.miss)}
                </span>
              </li>
            ))}
          </ol>
        ) : null}
      </section>
      {league ? (
        <section className="au-w au-vs" aria-labelledby="au-vs-past">
          <h2 id="au-vs-past">Past games, replayed</h2>
          <p className="au-sub">
            {league.starts.toLocaleString("en-GB")} LaLiga starts, each scored by a model fitted only on the weeks before it. Sofix&apos;s number
            uses Sorare&apos;s projection as one of its inputs.
          </p>
          <table className="au-vs-t">
            <thead>
              <tr>
                <th scope="col" />
                <th scope="col">
                  Within 7 <small>SF · SO</small>
                </th>
                <th scope="col">
                  Better of two <small>SF · SO</small>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">All</th>
                <td>
                  {pct(league.within7.now) ?? "–"}% <span className="au-vs-sep">·</span> {pct(league.within7.sorare) ?? "–"}%
                </td>
                <td />
              </tr>
              {league.positions.map((row) => (
                <tr key={row.pos}>
                  <th scope="row">{POSITION_NAME[row.pos]}</th>
                  <td />
                  <td>
                    {row.now ? `${Math.round(row.now.rate * 100)}%` : "–"} <span className="au-vs-sep">·</span>{" "}
                    {row.sorare ? `${Math.round(row.sorare.rate * 100)}%` : "–"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </>
  );
}
