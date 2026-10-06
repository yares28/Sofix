import RewardsAudit from "./RewardsAudit";
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
import LeagueAudit from "./LeagueAudit";

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

export type AuditShow = "xscore" | "starts" | "record" | "rewards";

export default function AuditView({
  data,
  now,
  league,
  show = "xscore",
  season = [],
}: {
  data: Audit | null;
  now: Date;
  league: League | null;
  show?: AuditShow;
  /** The season's finished Sorare gameweeks, for what you won (Rewards). */
  season?: { slug: string; number: number }[];
}) {
  if (!data) {
    return (
      <section className="au-w au-empty" role="status">
        <h1>Audit</h1>
        <p>The audit appears after the next refresh.</p>
      </section>
    );
  }
  return (
    <>
      <header className="au-top">
        <h1>{show === "starts" ? "Who starts?" : show === "record" ? "Written down" : show === "rewards" ? "Rewards" : "Audit"}</h1>
        <p>
          {show === "starts"
            ? "Each source's chance that a player starts, written down before the lock and checked against who started."
            : show === "record"
              ? "Every gameweek's games, written down before the lock, and how many have been checked."
              : show === "rewards"
                ? "The essence the plans expected over the season, against what was really won."
                : "How often the numbers were right, checked against what happened."}
        </p>
        {data.generatedAt ? <p className="au-fresh">Updated {freshLabel(data.generatedAt, now)}</p> : null}
      </header>
      {show === "xscore" && league ? <LeagueAudit data={league} /> : null}
      {show === "starts" ? (
        <section className="au-w au-starts" aria-label="Who starts?">
          <div className="au-srcs">
            {SOURCES.map((source) => (
              <Source key={source} source={source} live={data.starts.live[source]} floor={data.floor} />
            ))}
          </div>
        </section>
      ) : null}
      {show === "rewards" ? <RewardsAudit rewards={data.rewards} floor={data.floor} season={season} /> : null}
      {show === "record" ? (
        <section className="au-w au-starts" aria-label="Written down">
          {data.starts.weeks.length ? <Record data={data} /> : <p className="au-sub">Nothing written down yet.</p>}
        </section>
      ) : null}
    </>
  );
}
