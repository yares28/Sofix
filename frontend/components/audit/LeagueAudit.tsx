import { alongPairs, asOfLabel, dot, enough, missBars, pct, POSITION_NAME, scaleMax, weekHeight, weeklyStory, type Band, type LeagueAudit as League } from "../../lib/leagueAudit";

const count = (n: number) => n.toLocaleString("en-GB");

/** Chances against what happened: one dot per group of starts, on the diagonal when honest. */
function Calibration({ bands, max, label, unit }: { bands: Band[]; max: number; label: string; unit: string }) {
  if (!bands.length) return <p className="au-sub">Too few to tell.</p>;
  return (
    <div className="lg-cal" role="img" aria-label={label}>
      <div className="lg-plot">
        <i className="diag" />
        {bands.map((b) => {
          const d = dot(b, max);
          return <i key={b.said} className="pt" style={{ left: `${d.x}%`, bottom: `${d.y}%`, width: d.size, height: d.size, margin: `-${d.size / 2}px 0 0 -${d.size / 2}px` }} />;
        })}
      </div>
      <p className="lg-key">
        across: what Sofix said · up: how often it happened · 0 to {Math.round(max * 100)}% {unit}
      </p>
    </div>
  );
}

/** The share of all pairs, every position together, that the xScore picks right now: the page's one number. */
function overall(data: League): number | null {
  const rated = data.positions.flatMap((p) => (enough(p.now) ? [p.now] : []));
  const pairs = rated.reduce((sum, r) => sum + r.pairs, 0);
  return pairs ? rated.reduce((sum, r) => sum + r.rate * r.pairs, 0) / pairs : null;
}

/** Audit · xScore, as the canvas draws it (board "7 · Audit · xScore"): the one number, the four positions against the old number, then the charts. */
export default function LeagueAudit({ data }: { data: League }) {
  const story = weeklyStory(data.weeks);
  const bars = missBars(data.miss);
  const keeperMax = scaleMax(data.keeper.bands);
  const w7 = data.within7;
  const all = overall(data);
  return (
    <>
      <section className="ax-hero">
        <div className="ax-lead">
          <h1>How often the xScore is right</h1>
          <p className="ax-sub">Two LaLiga seasons replayed, each game predicted from the weeks before it</p>
          <p className="ax-big">
            <b>{all === null ? "–" : `${pct(all)}%`}</b>
            <span>of the time it picks the better of two players. A coin flip gets 50.</span>
          </p>
          <ul className="ax-facts">
            <li><strong>{count(data.starts)}</strong> starts</li>
            <li><strong>{data.weeks.length}</strong> gameweeks</li>
            {data.weeks.length ? <li>{asOfLabel(data.weeks[0]!.from)} to {asOfLabel(data.asOf)}</li> : null}
          </ul>
        </div>
        <section className="au-w lg-card ax-pairs" aria-labelledby="lg-pairs-h">
          <h2 id="lg-pairs-h">Pick the better of two</h2>
          <p className="lg-cap">now, against the old number</p>
          <div className="lg-dum">
            <div className="lg-scale" aria-hidden="true">
              <span>45</span>
              <span style={{ left: "25%" }}>50 · coin flip</span>
              <span style={{ left: "100%" }}>65</span>
            </div>
            <ul className="lg-rows" aria-label="How often each position's xScore picks the better of two, now and before">
              {data.positions.map((p) => (
                <li key={p.pos}>
                  <span>{POSITION_NAME[p.pos]}</span>
                  {enough(p.now) ? (
                    <>
                      <span className="lg-ax" aria-hidden="true">
                        <i className="coin" />
                        {enough(p.before) ? (
                          <i className="link" style={{ left: `${Math.min(alongPairs(p.before.rate), alongPairs(p.now.rate))}%`, width: `${Math.abs(alongPairs(p.now.rate) - alongPairs(p.before.rate))}%` }} />
                        ) : null}
                        {enough(p.before) ? <i className="was" style={{ left: `${alongPairs(p.before.rate)}%` }} /> : null}
                        <i className="now" style={{ left: `${alongPairs(p.now.rate)}%` }} />
                      </span>
                      <span className="lg-val">
                        {pct(p.now.rate)}%<small>{count(p.now.games)} starts</small>
                      </span>
                    </>
                  ) : (
                    <span className="lg-few">Too few to tell</span>
                  )}
                </li>
              ))}
            </ul>
            <p className="lg-key">
              <span>
                <i className="now" />
                now
              </span>
              <span>
                <i className="was" />
                the old number
              </span>
            </p>
          </div>
        </section>
      </section>

      <div className="ax-grid">
      {story ? (
        <section className="au-w lg-card ax-8" aria-labelledby="lg-weeks-h">
          <p className="au-label">Week by week</p>
          <h2 id="lg-weeks-h">{story.above === story.total ? `Above a coin flip in every one of ${story.total} gameweeks` : `Above a coin flip in ${story.above} of ${story.total} gameweeks`}</h2>
          <p className="lg-cap">
            The same figure for each gameweek, all positions together. Lowest {pct(story.lowest)}%, highest {pct(story.highest)}%.
          </p>
          <div className="lg-wk" role="img" aria-label={`The share of pairs picked right in each of ${story.total} gameweeks, against a coin flip at 50%`}>
            {data.weeks.map((w) => (
              <i key={w.from} title={`${asOfLabel(w.from)}: ${pct(w.rate)}%`} style={{ height: `${weekHeight(w.rate)}%` }} />
            ))}
            <b className="line" style={{ bottom: `${weekHeight(0.5)}%` }} />
            <span className="lab" style={{ bottom: `${weekHeight(0.5)}%` }}>
              coin flip
            </span>
          </div>
          <p className="lg-x">
            <span>{asOfLabel(data.weeks[0]!.from)}</span>
            <span>{asOfLabel(data.weeks[data.weeks.length - 1]!.from)}</span>
          </p>
        </section>
      ) : null}
        <section className="au-w lg-card ax-4" aria-labelledby="lg-miss-h">
          <p className="au-label">How close</p>
          <h2 id="lg-miss-h">How far the score lands from the xScore</h2>
          <p className="lg-cap">Each bar counts starts by how many points the score was above or below.</p>
          <div className="lg-hs" role="img" aria-label={`${pct(data.miss.within7)}% of ${count(data.miss.n)} starts landed within 7 points of the xScore`}>
            {bars.map((b, i) => (
              <i key={i} className={b.middle ? "mid" : undefined} style={{ height: `${b.h}%` }} />
            ))}
          </div>
          <p className="lg-hx">
            <span>−49</span>
            <span>−25</span>
            <span>0</span>
            <span>+25</span>
            <span>+49</span>
          </p>
          <dl className="lg-stats">
            <div>
              <dt>within 7 points (the green bars)</dt>
              <dd>{pct(data.miss.within7)}%</dd>
            </div>
            <div>
              <dt>within 15 points</dt>
              <dd>{pct(data.miss.within15)}%</dd>
            </div>
            <div>
              <dt>starts</dt>
              <dd>{count(data.miss.n)}</dd>
            </div>
          </dl>
        </section>
        <section className="au-w lg-card ax-6" aria-labelledby="lg-vs-h">
          <p className="au-label">Against Sorare&apos;s own number</p>
          <h2 id="lg-vs-h">Landing within 7 points of the score</h2>
          <p className="lg-cap">Share of starts where the number was that close.</p>
          <ul className="lg-vs" aria-label="Share of starts within 7 points">
            {[
              { name: "Sorare's projection", v: w7.sorare, cls: "sorare" },
              { name: "Sofix before", v: w7.before, cls: "before" },
              { name: "Sofix now", v: w7.now, cls: "now" },
            ].map((r) => (
              <li key={r.name}>
                <span>{r.name}</span>
                <span className="vb">
                  <i className={r.cls} style={{ width: `${(r.v ?? 0) * 100}%` }} />
                </span>
                <b>{pct(r.v)}%</b>
              </li>
            ))}
          </ul>
          {data.keeper.range !== null ? (
            <>
              <p className="au-label lg-sp">Goalkeepers&apos; range</p>
              <ul className="lg-vs" aria-label="Share of goalkeepers' starts inside the range">
                <li>
                  <span>Inside the range</span>
                  <span className="vb">
                    <i className="now" style={{ width: `${data.keeper.range * 100}%` }} />
                    <u style={{ left: "80%" }} />
                  </span>
                  <b>{pct(data.keeper.range)}%</b>
                </li>
              </ul>
              <p className="lg-key">the line is the aim: 80 in 100</p>
            </>
          ) : null}
        </section>
        <section className="au-w lg-card ax-6" aria-labelledby="lg-keep-h">
          <p className="au-label">Goalkeepers</p>
          <h2 id="lg-keep-h">When Sofix says 30%, does it happen 30% of the time?</h2>
          <p className="lg-cap">The chance of a clean sheet or a penalty save. On the line means honest.</p>
          <div className="lg-rw">
            <Calibration bands={data.keeper.bands} max={keeperMax} label="Goalkeepers' chance of a decisive action against how often it happened" unit="of starts" />
            <dl className="lg-stats col">
              <div>
                <dt>said on average</dt>
                <dd>{(data.keeper.said * 100).toFixed(1)}%</dd>
              </div>
              <div>
                <dt>happened</dt>
                <dd>{(data.keeper.happened * 100).toFixed(1)}%</dd>
              </div>
              <div>
                <dt>starts</dt>
                <dd>{count(data.keeper.games)}</dd>
              </div>
            </dl>
          </div>
        </section>
      </div>

      <p className="lg-foot">
        {count(data.starts)} starts over two LaLiga seasons to {asOfLabel(data.asOf)}, each predicted from the weeks before it only (the models are fitted through {asOfLabel(data.through)}).
      </p>
    </>
  );
}

/** Who starts, checked (canvas board "7b"): Sofix's chance that a player starts, against who did, on past games. */
export function StartsCheck({ data }: { data: League }) {
  const startsMax = scaleMax(data.starts_calibration.bands);
  return (
    <section className="au-w lg-card" aria-labelledby="lg-start-h">
          <p className="au-label">Who starts</p>
          <h2 id="lg-start-h">Sofix&apos;s chance that a player starts, against who started</h2>
          <p className="lg-cap">His chance from his own form, replayed on {count(data.starts_calibration.games)} games.</p>
          <div className="lg-rw">
            <Calibration bands={data.starts_calibration.bands} max={startsMax} label="Sofix's chance that a player starts against how often he started" unit="of games" />
            <dl className="lg-stats col">
              <div>
                <dt>of games right</dt>
                <dd>{pct(data.starts_calibration.right)}%</dd>
              </div>
              <div>
                <dt>games</dt>
                <dd>{count(data.starts_calibration.games)}</dd>
              </div>
            </dl>
          </div>
    </section>
  );
}
