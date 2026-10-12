import { asOfLabel, dot, missBars, pct, scaleMax, type Band, type LeagueAudit as League } from "../../lib/leagueAudit";

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

/** Audit · xScore, under the live comparison: two LaLiga seasons replayed (how close, against Sorare's own number, goalkeepers' chances). */
export default function LeagueAudit({ data }: { data: League }) {
  const bars = missBars(data.miss);
  const keeperMax = scaleMax(data.keeper.bands);
  const w7 = data.within7;
  return (
    <>
      <h2 className="au-label ax-past">Past games, replayed</h2>
      <div className="ax-grid">
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
        <section className="au-w lg-card ax-4" aria-labelledby="lg-vs-h">
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
        <section className="au-w lg-card ax-4" aria-labelledby="lg-keep-h">
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
