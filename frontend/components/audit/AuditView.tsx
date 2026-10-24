import MissionsAudit from "./MissionsAudit";
import MatchAudit from "./MatchAudit";
import ElevensAudit from "./ElevensAudit";
import VersusAudit from "./VersusAudit";
import RewardsAudit from "./RewardsAudit";
import LineupsAudit from "./LineupsAudit";
import StrategiesAudit from "./StrategiesAudit";
import { freshLabel } from "../../lib/fresh";
import {
  bandLabel,
  lockDay,
  percent,
  recordLine,
  SOURCES,
  sourceStory,
  competitionName,
  competitionStory,
  type Audit,
  type LiveSource,
  type StartFix,
} from "../../lib/audit";
import { SOURCE_NAME, SOURCE_SHORT, type StartSource } from "../../lib/play";
import type { LeagueAudit as League } from "../../lib/leagueAudit";
import SourceMark from "../SourceMark";
import LeagueAudit, { StartsCheck } from "./LeagueAudit";
import type { SavedWeek } from "../../lib/myWeeks";
import PlayerScores from "./PlayerScores";
import type { PlayerScoreWeek } from "../../lib/audit";

const NAME: Record<StartSource, string> = { futbolfantasy: "Futbol Fantasy", sorare: "Sorare", sofix: "Sofix" };
function Source({ source, live }: { source: StartSource; live: LiveSource }) {
  const story = sourceStory(source, live);
  const hasFigure = live.settled > 0 && live.right !== null;
  const top = live.buckets && live.buckets.length > 0 ? live.buckets[live.buckets.length - 1] : null;
  return (
    <article className="au-src" data-state={live.state} aria-label={NAME[source]}>
      <h3>
        <SourceMark source={source} />
        {NAME[source]}
      </h3>
      <p className="au-src-what">{SOURCE_NAME[source]}</p>
      <p className={hasFigure ? "au-src-main figure" : "au-src-main"}>{story.main}</p>
      <p className="au-src-sub">{story.sub}</p>
      {hasFigure ? (
        <dl className="au-src-more">
          {top ? (
            <div>
              <dt>{bandLabel(top)}</dt>
              <dd>{percent(top.was)} started · {top.n.toLocaleString("en-GB")} {top.n === 1 ? "game" : "games"}</dd>
            </div>
          ) : null}
          <div>
            <dt>Error score</dt>
            <dd>{live.brier === null ? "–" : live.brier.toFixed(2)}</dd>
          </div>
        </dl>
      ) : null}
      {live.byCompetition?.length ? (
        <dl className="au-src-more au-src-comps" aria-label={`${NAME[source]} by competition`}>
          {live.byCompetition.map((line) => (
            <div key={line.competition}>
              <dt>{competitionName(line.competition)}</dt>
              <dd>{competitionStory(line)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </article>
  );
}

/** Said against happened, per source: the runs of chances that hold 100 settled games are moved to what happened before the plans are made. */
function Fixes({ fixes, floor }: { fixes: Partial<Record<StartSource, StartFix[]>>; floor: number }) {
  const rows = SOURCES.flatMap((source) => (fixes[source] ?? []).map((fix) => ({ source, fix })));
  if (rows.length === 0) return null;
  return (
    <section className="au-w au-starts" aria-labelledby="au-fixes-h">
      <h2 id="au-fixes-h">Start chances, corrected from the record</h2>
      <p className="au-sub">A run of chances with {floor} settled games is moved to how often those players really started; thinner runs are left as they were.</p>
      <div className="au-record">
        <table>
          <caption className="visually-hidden">Each source&apos;s chances against how often the players started</caption>
          <thead>
            <tr>
              <th scope="col">Source</th>
              <th scope="col">Said</th>
              <th scope="col">Started</th>
              <th scope="col">Games</th>
              <th scope="col">Used</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ source, fix }) => (
              <tr key={`${source}-${fix.from}`}>
                <th scope="row"><SourceMark source={source} /> {NAME[source]}</th>
                <td>{fix.from === fix.to ? percent(fix.from) : `${percent(fix.from)} to ${percent(fix.to)}`}</td>
                <td>{percent(fix.was)}</td>
                <td>{fix.n}</td>
                <td>{fix.used ? "Yes" : `Not yet (${floor - fix.n} to go)`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
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

export type AuditShow = "xscore" | "starts" | "lineups" | "strategies" | "rewards" | "missions";

export default function AuditView({
  data,
  now,
  league,
  show = "xscore",
  season = [],
  saved = [],
  pics = {},
  playerWeek = null,
  playerWeekNumber = null,
  playerWeeks = [],
}: {
  data: Audit | null;
  now: Date;
  league: League | null;
  show?: AuditShow;
  /** The season's finished Sorare gameweeks, for what you won (Rewards). */
  season?: { slug: string; number: number }[];
  saved?: SavedWeek[];
  /** Sorare's card art by card slug: your collection and the cards of your saved lineups. */
  pics?: Record<string, string>;
  playerWeek?: PlayerScoreWeek | null;
  playerWeekNumber?: number | null;
  playerWeeks?: PlayerScoreWeek[];
}) {
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
        <VersusAudit versus={data.versus} updated={updated} />
        {league ? <LeagueAudit data={league} /> : null}
        <MatchAudit data={data.matches} />
        <PlayerScores week={playerWeek} number={playerWeekNumber} weeks={playerWeeks} />
      </>
    );
  }
  if (show === "missions") {
    return (
      <>
        <header className="au-top">
          <h1>Missions</h1>
          <p>How often Sofix&apos;s mission picks were the best your cards could have done.</p>
          {updated}
        </header>
        <MissionsAudit missions={data.missions} floor={data.floor} />
      </>
    );
  }
  if (show === "lineups") return <LineupsAudit lineups={data.lineups} saved={saved} updated={updated} weeks={data.strategies.weeks} pics={pics} />;
  if (show === "strategies") return <StrategiesAudit strategies={data.strategies} pics={pics} updated={updated} />;
  if (show === "rewards") {
    return (
      <>
        <header className="au-top">
          <h1>Rewards</h1>
          <p>The essence the plans expected over the season, against what was really won.</p>
          {updated}
        </header>
        <RewardsAudit rewards={data.rewards} floor={data.floor} season={season} saved={saved} frozen={data.frozenPlans} />
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
            <Source key={source} source={source} live={data.starts.live[source]} />
          ))}
        </div>
      </section>
      <Fixes fixes={data.startFixes ?? {}} floor={data.floor} />
      <section className="au-w au-starts" id="written" aria-labelledby="au-written-h">
        <h2 id="au-written-h">Written down so far</h2>
        <p className="au-sub">Checked as each game&apos;s result arrives.</p>
        {data.starts.weeks.length ? <Record data={data} /> : <p className="au-sub">Nothing written down yet.</p>}
      </section>
      <ElevensAudit data={data.elevens} />
    </>
  );
}
