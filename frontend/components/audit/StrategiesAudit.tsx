import type { ReactNode } from "react";
import { percent, type StrategiesAudit as Strategies, type StrategyTally } from "../../lib/audit";
import { real, share } from "../../lib/lineupsAudit";
import WeekComparison from "./WeekComparison";

const average = (t: StrategyTally): number | null => (t.scored ? t.points / t.scored : null);
const ofBest = (t: StrategyTally): number | null => share(t.pointsVs, t.best);
const points = (value: number | null): string => (value === null ? "–" : Math.round(value).toLocaleString("en-GB"));
const count = (n: number, one: string, many: string = `${one}s`) => `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;

/**
 * Audit · Strategies (the owner, 13 Oct 2026). Each strategy builds its best lineup for every competition from your cards before the lock
 * (backend/app/sorare/strategies.py); after the games each is scored the way a real lineup is, beside Sofix's best plan and the lineups you
 * entered. Always shown: a strategy with no week yet has dashes, and each finished gameweek is added by the first refresh a day after it ends.
 */
export default function StrategiesAudit({ strategies, pics, updated = null }: { strategies: Strategies; pics: Record<string, string>; updated?: ReactNode }) {
  const { weeks, you, sofix } = strategies;
  const rows = strategies.strategies;
  const all = [
    ...rows,
    { key: "sofix", label: "Sofix plan 1", note: "", ...sofix },
    { key: "you", label: "You", note: "", ...you },
  ];
  const ranked = [...all].filter((r) => r.scored).sort((a, b) => (average(b) ?? 0) - (average(a) ?? 0));
  const top = ranked[0];
  const most = Math.max(1, ...all.map((r) => average(r) ?? 0));
  const bars = [...ranked, ...all.filter((r) => !r.scored)];
  return (
    <>
      <section className="ax-hero">
        <div className="ax-lead">
          <h1>Strategies</h1>
          <p className="ax-sub">Each way of building a lineup from your cards, written down before the lock and scored after the games</p>
          <dl className="ax-duo">
            <div>
              <dt>{top ? `${top.label} · most points` : "Most points"}</dt>
              <dd className="ax-duo-n">{top ? points(average(top)) : "–"}</dd>
              <dd className="ax-duo-s">{top ? `a lineup, over ${count(top.scored, "lineup")}` : "Nothing scored yet"}</dd>
            </div>
            <div>
              <dt>You · entered</dt>
              <dd className="ax-duo-n">{points(average(you))}</dd>
              <dd className="ax-duo-s">{you.scored ? `a lineup, over ${count(you.scored, "lineup")}` : "Nothing scored yet"}</dd>
            </div>
          </dl>
          <ul className="ax-facts">
            <li><strong>{weeks.length}</strong> {weeks.length === 1 ? "week" : "weeks"} scored</li>
            <li><strong>{rows.length || 10}</strong> strategies</li>
          </ul>
          <p className="au-sub">{weeks.length ? "Each gameweek is added a day after it ends, once its scores are final." : "The first gameweek is scored a day after it ends."}</p>
          {updated}
        </div>
        <section className="au-w lg-card" aria-labelledby="au-st-bars">
          <h2 id="au-st-bars">Points a lineup</h2>
          <p className="lg-cap">The average real score of each strategy&apos;s lineups, Sofix&apos;s best plan and the ones you entered.</p>
          <ul className="lg-vs">
            {bars.map((row) => (
              <li key={row.key}>
                <span>{row.label}</span>
                <span className="vb" aria-hidden="true"><i className={row.key === "you" ? "sorare" : "now"} style={{ width: `${((average(row) ?? 0) / most) * 100}%` }} /></span>
                <b>{points(average(row))}</b>
              </li>
            ))}
          </ul>
        </section>
      </section>

      <section className="au-w au-vs" aria-labelledby="au-st-all">
        <h2 id="au-st-all">How each one did</h2>
        <p className="au-sub">Over the season. A prize counts once per lineup, by its best; XP alone is not a win.</p>
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
        <div className="au-st-scroll" role="group" aria-label="Strategies table, scrolls sideways on a phone" tabIndex={0}>
          <table className="au-vs-t">
            <caption className="visually-hidden">Each strategy, Sofix&apos;s best plan and your own lineups: points, share of the best lineup in hindsight, how often they won essence or better, and how often nothing</caption>
            <thead>
              <tr>
                <th scope="col" />
                <th scope="col">Points a lineup</th>
                <th scope="col">Of the best in hindsight</th>
                <th scope="col">Essence or better</th>
                <th scope="col">Nothing</th>
                <th scope="col">Lucky</th>
              </tr>
            </thead>
            <tbody>
              {all.map((row) => (
                <tr key={row.key}>
                  <th scope="row">
                    {row.label} <small>{count(row.scored, "lineup")} · {count(row.weeks, "week")}</small>
                  </th>
                  <td>{points(average(row))}</td>
                  <td>{percent(ofBest(row))}</td>
                  <td>{percent(share(real(row.won), row.judged))}</td>
                  <td>{percent(share(row.won.none, row.judged))}</td>
                  <td>{row.key === "you" ? "–" : row.scored ? `${row.verdicts.lucky} of ${row.scored}` : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="au-w au-vs" aria-labelledby="au-st-weeks">
        <h2 id="au-st-weeks">Week by week</h2>
        <p className="au-sub">Open a week to see each competition: your lineup, Sofix&apos;s and every strategy&apos;s, with the cards and what each scored. Your lineup says which strategies it fits.</p>
        {weeks.length ? (
          <ol className="au-st-weeks" aria-label="Week by week">
            {weeks.map((week) => {
              const tallies = rows.filter((r) => week.strategies[r.key]?.scored);
              return (
                <li key={week.slug}>
                  <details>
                    <summary>
                      <b>GW{week.number}</b>
                      <span>
                        {[
                          week.you ? `You ${points(average(week.you))}` : null,
                          week.sofix?.scored ? `Sofix ${points(average(week.sofix))}` : null,
                          ...tallies.map((r) => `${r.label} ${points(average(week.strategies[r.key] as StrategyTally))}`),
                        ].filter(Boolean).join(" · ") || "Nothing scored yet"}
                        {week.final ? "" : " · still being checked"}
                      </span>
                    </summary>
                    <WeekComparison boards={week.boards} pics={pics} />
                  </details>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="au-sub">No week has been scored yet.</p>
        )}
      </section>
    </>
  );
}
