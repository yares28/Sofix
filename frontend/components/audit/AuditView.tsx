import { freshLabel } from "../../lib/fresh";
import {
  bandLabel,
  lockDay,
  percent,
  recordLine,
  SOURCES,
  sourceStory,
  type Audit,
  type LiveSource,
} from "../../lib/audit";
import { SOURCE_NAME, SOURCE_SHORT, type StartSource } from "../../lib/play";
import type { LeagueAudit as League } from "../../lib/leagueAudit";
import SourceMark from "../SourceMark";
import LeagueAudit, { StartsCheck } from "./LeagueAudit";

const NAME: Record<StartSource, string> = { futbolfantasy: "Futbol Fantasy", sorare: "Sorare", sofix: "Sofix" };
function Progress({ settled, floor }: { settled: number; floor: number }) {
  const share = Math.min(1, settled / floor);
  return (
    <span
      className="au-progress"
      role="progressbar"
      aria-label="Games checked"
      aria-valuemin={0}
      aria-valuemax={floor}
      aria-valuenow={Math.min(settled, floor)}
    >
      <i style={{ ["--w" as string]: `${share * 100}%` }} />
    </span>
  );
}

function Source({ source, live, floor }: { source: StartSource; live: LiveSource; floor: number }) {
  const story = sourceStory(source, live, floor);
  const top = live.buckets && live.buckets.length > 0 ? live.buckets[live.buckets.length - 1] : null;
  return (
    <article className="au-src" data-state={live.state} aria-label={NAME[source]}>
      <h3>
        <SourceMark source={source} />
        {NAME[source]}
      </h3>
      <p className="au-src-what">{SOURCE_NAME[source]}</p>
      <p className={live.state === "enough" ? "au-src-main figure" : "au-src-main"}>{story.main}</p>
      <p className="au-src-sub">{story.sub}</p>
      {live.state === "few" || live.state === "waiting" ? <Progress settled={live.settled} floor={floor} /> : null}
      {live.state === "enough" ? (
        <dl className="au-src-more">
          {top ? (
            <div>
              <dt>{bandLabel(top)}</dt>
              <dd>{percent(top.was)} started</dd>
            </div>
          ) : null}
          <div>
            <dt>Error score</dt>
            <dd>{live.brier === null ? "–" : live.brier.toFixed(2)}</dd>
          </div>
        </dl>
      ) : null}
    </article>
  );
}

function Record({ data }: { data: Audit }) {
  if (data.starts.weeks.length === 0) return null;
  return (
    <div className="au-record">
      <table>
        <caption className="visually-hidden">Games written down before each lock, and how many have been checked</caption>
        <thead>
          <tr>
            <th scope="col">Locked</th>
            <th scope="col">Games</th>
            <th scope="col">Checked</th>
            {SOURCES.map((source) => (
              <th scope="col" key={source} title={NAME[source]}>
                <SourceMark source={source} />
                <span aria-hidden="true">{SOURCE_SHORT[source]}</span>
                <span className="visually-hidden">{NAME[source]}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.starts.weeks.map((week) => (
            <tr key={week.slug} title={recordLine(week)}>
              <th scope="row">{lockDay(week.lock)}</th>
              <td>{week.games}</td>
              <td>{week.settled}</td>
              {SOURCES.map((source) => (
                <td key={source}>{week.sources[source] ?? 0}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type AuditShow = "xscore" | "starts";

export default function AuditView({ data, now, league, show = "xscore" }: { data: Audit | null; now: Date; league: League | null; show?: AuditShow }) {
  if (!data) {
    return (
      <section className="au-w au-empty" role="status">
        <h1>Audit</h1>
        <p>The audit appears after the next refresh.</p>
      </section>
    );
  }
  const updated = data.generatedAt ? <p className="au-fresh">Updated {freshLabel(data.generatedAt, now)}</p> : null;
  if (show === "xscore") {
    return (
      <>
        {league ? <LeagueAudit data={league} /> : <h1>Audit</h1>}
        {updated}
      </>
    );
  }
  // Who starts, checked (canvas board "7b"): the past games first, then each source live, then what was written down.
  const right = league ? league.starts_calibration.right : null;
  return (
    <>
      <section className="ax-hero">
        <div className="ax-lead">
          <h1>Who starts, checked</h1>
          <p className="ax-sub">Each source&apos;s chance that a player starts, against who did</p>
          <p className="ax-big">
            <b>{right === null ? "–" : `${Math.round(right * 100)}%`}</b>
            <span>right on past games, from Sofix&apos;s form alone</span>
          </p>
          {league ? (
            <ul className="ax-facts">
              <li><strong>{league.starts_calibration.games.toLocaleString("en-GB")}</strong> games</li>
            </ul>
          ) : null}
          {updated}
        </div>
        {league ? <StartsCheck data={league} /> : null}
      </section>
      <section className="au-w au-starts" aria-label="Who starts?">
        <div className="au-srcs">
          {SOURCES.map((source) => (
            <Source key={source} source={source} live={data.starts.live[source]} floor={data.floor} />
          ))}
        </div>
      </section>
      <section className="au-w au-starts" id="written" aria-labelledby="au-written-h">
        <h2 id="au-written-h">Written down so far</h2>
        <p className="au-sub">Before each lock; checked a day after the gameweek ends.</p>
        {data.starts.weeks.length ? <Record data={data} /> : <p className="au-sub">Nothing written down yet.</p>}
      </section>
    </>
  );
}
