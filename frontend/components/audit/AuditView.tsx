import { freshLabel } from "../../lib/fresh";
import {
  bandLabel,
  docUrl,
  interval,
  liveLine,
  lockDay,
  percent,
  recordLine,
  SOURCES,
  sourceStory,
  type Audit,
  type LiveSource,
  type SofixReplay,
  type XscoreReplay,
} from "../../lib/audit";
import { SOURCE_NAME, SOURCE_SHORT, type StartSource } from "../../lib/play";
import SourceMark from "../SourceMark";

const NAME: Record<StartSource, string> = { futbolfantasy: "Futbol Fantasy", sorare: "Sorare", sofix: "Sofix" };
const METHOD = "xscore_success_rate.md";
const MONTHS = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

/** "Aug 2025 – Oct 2026" from the first and last day the replay covers. */
function span(from: string | null | undefined, to: string | null | undefined): string | null {
  if (!from || !to) return null;
  const a = MONTHS.format(new Date(`${from}T12:00:00Z`));
  const b = MONTHS.format(new Date(`${to}T12:00:00Z`));
  return a === b ? a : `${a} – ${b}`;
}

/** Where a share sits between a coin flip (the left end) and always right (the right end), as a share of the track. */
const along = (rate: number) => `${Math.max(0, Math.min(1, (rate - 0.5) / 0.5)) * 100}%`;
const count = (n: number) => n.toLocaleString("en-GB");

function Hero({ data }: { data: Audit }) {
  const replay: XscoreReplay | null = data.xscore.replay;
  const pairs = replay?.pairs;
  const covers = span(data.replay?.from, data.replay?.to);
  if (!replay || !pairs || pairs.rate === null) {
    return (
      <section className="au-w au-hero" aria-labelledby="au-hero-h">
        <p className="au-label">xScore</p>
        <h2 id="au-hero-h" className="au-none">The count from past games is not here yet</h2>
        <p className="au-live">{liveLine(data.xscore.live)}</p>
      </section>
    );
  }
  const rate = pairs.rate;
  const range = interval(pairs.lo, pairs.hi);
  const last5 = replay.last5.rate;
  return (
    <section className="au-w au-hero" aria-labelledby="au-hero-h">
      <div className="au-hero-main">
        <p className="au-label au-label-name">xScore success rate</p>
        <p className="au-big" aria-hidden="true">
          {Math.round(rate * 100)}
          <span>%</span>
        </p>
        <h2 id="au-hero-h">
          <span className="visually-hidden">{percent(rate)} </span>
          of the time it picks the better of two players
        </h2>
        <p className="au-sub">
          Take two of your players in the same position and gameweek. The one the xScore rated higher scored more in{" "}
          <b>{Math.round(rate * 100)}</b> of every 100 pairs. A coin flip gets 50.
        </p>
      </div>
      <div className="au-hero-evidence">
        <ul className="au-bars" aria-label="How often each picks the better of two players, from a coin flip to always right">
          <li>
            <span className="au-bar-name">xScore</span>
            <span className="au-bar-track" aria-hidden="true">
              <i className="au-bar-fill" style={{ ["--w" as string]: along(rate) }} />
            </span>
            <b className="au-bar-value">{percent(rate)}</b>
          </li>
          {last5 !== null ? (
            <li>
              <span className="au-bar-name">His last five games</span>
              <span className="au-bar-track" aria-hidden="true">
                <i className="au-bar-fill grey" style={{ ["--w" as string]: along(last5) }} />
              </span>
              <b className="au-bar-value">{percent(last5)}</b>
            </li>
          ) : null}
        </ul>
        <div className="au-axis" aria-hidden="true">
          <span />
          <span className="au-axis-line">
            <span>
              50%<small>coin flip</small>
            </span>
            <span>75%</span>
            <span>
              100%<small>always right</small>
            </span>
          </span>
          <span />
        </div>
        {last5 !== null && Math.abs(last5 - rate) < 0.01 ? (
          <p className="au-note">An average of his last five games does just as well.</p>
        ) : null}
        <ul className="au-facts" aria-label="What the count rests on">
          <li>{count(pairs.pairs)} pairs</li>
          <li>{count(pairs.weeks)} gameweeks</li>
          {data.replay?.players ? <li>{count(data.replay.players)} of your players</li> : null}
          {covers ? <li>{covers}</li> : null}
          {range ? <li>likely {range}</li> : null}
        </ul>
        {replay.typicalMiss !== null ? (
          <p className="au-meta">
            On a typical game the real score is about {Math.round(replay.typicalMiss)} points from the xScore
            {replay.bias !== null && Math.abs(replay.bias) >= 1
              ? `, and the xScore runs about ${Math.round(Math.abs(replay.bias))} points ${replay.bias < 0 ? "low" : "high"}`
              : ""}
            .
          </p>
        ) : null}
      </div>
      <div className="au-hero-foot">
        <p className="au-live">
          <b>Live check</b> {liveLine(data.xscore.live)}
        </p>
        <a className="au-link" href={docUrl(METHOD)} target="_blank" rel="noreferrer">
          How it is counted
        </a>
      </div>
    </section>
  );
}

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

function Replay({ sofix, from, to }: { sofix: SofixReplay; from?: string | null; to?: string | null }) {
  const covers = span(from, to);
  return (
    <div className="au-replay">
      <div className="au-replay-head">
        <p className="au-label">On past games</p>
        <p className="au-replay-big">
          <span className="figure">{percent(sofix.right)}</span>
          <span> right on {count(sofix.games)} games{covers ? `, ${covers}` : ""}</span>
        </p>
        <p className="au-src-sub">
          Sofix&apos;s chance from his form alone, replayed. Only Sofix&apos;s can be: the other two are not kept once a game is over. Saying he
          always starts would be right {percent(sofix.always)} of the time.
        </p>
      </div>
      {sofix.buckets && sofix.buckets.length > 0 ? (
        <div>
          <ul className="au-bands" aria-label="What Sofix said against how often he started">
            {sofix.buckets.map((band) => (
              <li key={band.from}>
                <span className="au-band-name">{bandLabel(band)}</span>
                <span className="au-band-track" aria-hidden="true">
                  <i className="au-band-fill" style={{ ["--w" as string]: `${band.was * 100}%` }} />
                  <i className="au-band-said" style={{ ["--x" as string]: `${band.said * 100}%` }} />
                </span>
                <span className="au-band-text">
                  said {percent(band.said)} · started <b>{percent(band.was)}</b>
                  <small>{count(band.n)} games</small>
                </span>
              </li>
            ))}
          </ul>
          <p className="au-bands-key">Bar: how often he started. Tick: what Sofix said.</p>
        </div>
      ) : null}
    </div>
  );
}

function Record({ data }: { data: Audit }) {
  if (data.starts.weeks.length === 0) return null;
  return (
    <div className="au-record">
      <p className="au-label">Written down so far</p>
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

export default function AuditView({ data, now }: { data: Audit | null; now: Date }) {
  if (!data) {
    return (
      <section className="au-w au-empty" role="status">
        <h1>Audit</h1>
        <p>The audit appears after the next refresh.</p>
      </section>
    );
  }
  const sofix = data.starts.replay?.sofix;
  return (
    <>
      <header className="au-top">
        <h1>Audit</h1>
        <p>How often the numbers were right, checked against what happened.</p>
        {data.generatedAt ? <p className="au-fresh">Updated {freshLabel(data.generatedAt, now)}</p> : null}
      </header>
      <Hero data={data} />
      <section className="au-w au-starts" aria-labelledby="au-starts-h">
        <h2 id="au-starts-h">Who starts?</h2>
        <p className="au-sub">Each source&apos;s chance that a player starts, written down before the lock and checked against who started.</p>
        <div className="au-srcs">
          {SOURCES.map((source) => (
            <Source key={source} source={source} live={data.starts.live[source]} floor={data.floor} />
          ))}
        </div>
        {sofix ? <Replay sofix={sofix} from={data.replay?.from} to={data.replay?.to} /> : null}
        <Record data={data} />
      </section>
    </>
  );
}
