import { interval, liveLine, percent, type XscoreLive } from "../../lib/audit";

export default function PrelockAudit({ data }: { data: XscoreLive }) {
  const available = data.pairs > 0 && data.rate !== null;
  const range = interval(data.lo, data.hi);
  return (
    <section className="au-w au-starts au-result" id="prelock-results" aria-labelledby="au-live-h">
      <h2 id="au-live-h">Written before the lock</h2>
      <p className="au-sub">All recorded GWs, since the first lock</p>
      {available ? (
        <div className="au-prelock-result">
          <p className="au-result-big">{percent(data.rate)}</p>
          <p className="au-result-explainer">of player pairs ranked correctly
            <span>The higher xScore picked the higher actual score.</span>
          </p>
        </div>
      ) : <p className="au-sub">{liveLine(data)}</p>}
      <dl className="au-result-samples">
        <div><dt>Pairs compared</dt><dd>{data.pairs.toLocaleString("en-GB")}</dd></div>
        <div><dt>GWs compared</dt><dd>{data.weeks.toLocaleString("en-GB")}</dd></div>
        <div><dt>Player GWs checked</dt><dd>{data.marked.toLocaleString("en-GB")} <span>/ {data.noted.toLocaleString("en-GB")}</span></dd></div>
      </dl>
      <details className="au-result-method">
        <summary>How this is checked</summary>
        <p>Players in the same position and GW are compared using the xScores saved before lock. Equal actual scores are left out; tied xScores count half. This includes every recorded player. Results are checked a day after the GW ends.</p>
        {available && range ? <p>95% confidence range: {range}. This resamples whole GWs; one compared GW cannot show variation between weeks.</p> : null}
      </details>
    </section>
  );
}
