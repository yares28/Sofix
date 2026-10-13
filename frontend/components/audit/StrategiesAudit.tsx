import type { ReactNode } from "react";
import { percent, type StrategiesAudit as Strategies, type StrategyLine, type StrategyTally, type Verdict } from "../../lib/audit";
import { real, share } from "../../lib/lineupsAudit";

/** Weeks it takes before a ranking of the strategies means something: under it the page says so instead of crowning one. */
const ENOUGH_WEEKS = 4;
const VERDICT: Record<Verdict, string> = {
  lucky: "Lucky: above the top of its range",
  good: "A good week: in the top half of its range",
  expected: "As expected: inside its range",
  poor: "A poor week: under its range",
};
const average = (t: StrategyTally): number | null => (t.scored ? t.points / t.scored : null);
const ofBest = (t: StrategyTally): number | null => share(t.pointsVs, t.best);
const points = (value: number | null): string => (value === null ? "–" : Math.round(value).toLocaleString("en-GB"));
const names = (list: string[]) => (list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}` : (list[0] ?? ""));

/** One lineup of the latest week against the range written down for it: built on the numbers, or on luck. */
function Line({ line }: { line: StrategyLine }) {
  return (
    <li>
      <b>{line.comp ?? "Lineup"}</b>
      <span>
        {points(line.score)} points{line.x !== null && line.lo !== null && line.hi !== null ? `, expected ${line.x} (${line.lo}–${line.hi})` : ""}
        {line.verdict ? ` · ${VERDICT[line.verdict]}` : ""}
        {line.beat.length ? ` · ${names(line.beat)} scored above ${line.beat.length === 1 ? "his" : "their"} own range` : ""}
      </span>
    </li>
  );
}

/**
 * Audit · Strategies (the owner, 13 Oct 2026). Each strategy builds its best lineup for every competition from your cards before the lock
 * (backend/app/sorare/strategies.py); after the games each is scored the way a real lineup is, beside the lineups you entered and the best
 * lineup in hindsight. A big score gets a plain verdict: built on the numbers, or on luck.
 */
export default function StrategiesAudit({ strategies, updated = null }: { strategies: Strategies; updated?: ReactNode }) {
  const rows = strategies.strategies;
  const weeks = strategies.weeks;
  const mine = strategies.you;
  const ranked = [...rows].filter((r) => r.scored).sort((a, b) => (average(b) ?? 0) - (average(a) ?? 0));
  const top = ranked[0];
  const most = Math.max(1, ...rows.map((r) => average(r) ?? 0), average(mine) ?? 0);
  const few = weeks.length < ENOUGH_WEEKS;
  const latest = weeks.find((week) => week.lines.length);
  const shown = latest?.lines.filter((line) => line.strategy === "xscore") ?? [];
  const label = (key: string) => rows.find((r) => r.key === key)?.label ?? key;
  return (
    <>
      <section className="ax-hero">
        <div className="ax-lead">
          <h1>Strategies</h1>
          <p className="ax-sub">Each way of building a lineup from your cards, written down before the lock and scored after the games</p>
          <dl className="ax-duo">
            <div>
              <dt>{top ? `${top.label} · most points` : "Best strategy"}</dt>
              <dd className="ax-duo-n">{top ? points(average(top)) : "–"}</dd>
              <dd className="ax-duo-s">{top ? `points a lineup, over ${top.scored} lineups` : "Nothing checked yet"}</dd>
            </div>
            <div>
              <dt>You · entered</dt>
              <dd className="ax-duo-n">{points(average(mine))}</dd>
              <dd className="ax-duo-s">{mine.scored ? `points a lineup, over ${mine.scored} lineups` : "Nothing checked yet"}</dd>
            </div>
          </dl>
          <ul className="ax-facts">
            <li><strong>{weeks.length}</strong> {weeks.length === 1 ? "week" : "weeks"} checked</li>
            <li><strong>{rows.length}</strong> {rows.length === 1 ? "strategy" : "strategies"}</li>
          </ul>
          {weeks.length && few ? <p className="au-sub">Only {weeks.length} {weeks.length === 1 ? "week" : "weeks"} so far: too few to tell which strategy is better.</p> : null}
          {updated}
        </div>
        <section className="au-w lg-card" aria-labelledby="au-st-bars">
          <h2 id="au-st-bars">Points a lineup</h2>
          <p className="lg-cap">The average real score of each strategy&apos;s lineups, and of the ones you entered.</p>
          {rows.length ? (
            <ul className="lg-vs">
              {[...ranked, ...rows.filter((r) => !r.scored)].map((row) => (
                <li key={row.key}>
                  <span>{row.label}</span>
                  <span className="vb" aria-hidden="true"><i className="now" style={{ width: `${((average(row) ?? 0) / most) * 100}%` }} /></span>
                  <b>{points(average(row))}</b>
                </li>
              ))}
              <li>
                <span>You</span>
                <span className="vb" aria-hidden="true"><i className="sorare" style={{ width: `${((average(mine) ?? 0) / most) * 100}%` }} /></span>
                <b>{points(average(mine))}</b>
              </li>
            </ul>
          ) : (
            <p className="au-sub">No strategy lineup has been scored yet. They are written down before each lock and scored a day after the week ends.</p>
          )}
        </section>
      </section>

      {rows.length ? (
        <section className="au-w au-vs" aria-labelledby="au-st-all">
          <h2 id="au-st-all">How each one did</h2>
          <p className="au-sub">Over the season. A prize counts once per lineup, by its best; XP alone is not a win.</p>
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
          <div className="au-st-scroll" role="group" aria-label="Strategies table, scrolls sideways on a phone" tabIndex={0}>
          <table className="au-vs-t">
            <caption className="visually-hidden">Each strategy and your own lineups: points, share of the best lineup in hindsight, how often they won essence or better, and how often nothing</caption>
            <thead>
              <tr>
                <th scope="col" />
                <th scope="col">Points a lineup</th>
                <th scope="col">Of the best in hindsight</th>
                <th scope="col">Essence or better</th>
                <th scope="col">Nothing</th>
                <th scope="col">Lucky weeks</th>
              </tr>
            </thead>
            <tbody>
              {[...rows, { key: "you", label: "You", note: "", ...mine }].map((row) => (
                <tr key={row.key}>
                  <th scope="row">
                    {row.label} <small>{row.scored.toLocaleString("en-GB")} {row.scored === 1 ? "lineup" : "lineups"} · {row.weeks} {row.weeks === 1 ? "week" : "weeks"}</small>
                  </th>
                  <td>{points(average(row))}</td>
                  <td>{row.key === "you" ? "–" : percent(ofBest(row))}</td>
                  <td>{percent(share(real(row.won), row.judged))}</td>
                  <td>{percent(share(row.won.none, row.judged))}</td>
                  <td>{row.key === "you" ? "–" : `${row.verdicts.lucky} of ${row.scored}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </section>
      ) : null}

      {shown.length && latest ? (
        <section className="au-w au-vs" aria-labelledby="au-st-luck">
          <h2 id="au-st-luck">Built on the numbers, or on luck? GW{latest.number}</h2>
          <p className="au-sub">Each {label("xscore")} lineup of the latest week against the range written down for it before the lock (8 weeks in 10 land inside it).</p>
          <ul className="au-vs-weeks">
            {shown.map((line, i) => (
              <Line key={`${line.comp}-${i}`} line={line} />
            ))}
          </ul>
        </section>
      ) : null}

      {weeks.length ? (
        <section className="au-w au-vs" aria-labelledby="au-st-weeks">
          <h2 id="au-st-weeks">Week by week</h2>
          <ol className="au-vs-weeks" aria-label="Week by week">
            {weeks.map((week) => (
              <li key={week.slug}>
                <b>GW{week.number}</b>
                <span>
                  {rows
                    .filter((r) => week.strategies[r.key]?.scored)
                    .map((r) => `${r.label} ${points(average(week.strategies[r.key] as StrategyTally))}`)
                    .join(" · ") || "Nothing scored yet"}
                  {week.you ? ` · You ${points(average(week.you))}` : ""}
                  {week.final ? "" : " · still being checked"}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </>
  );
}
