import { NO_MATCHES, type MatchAudit as Figures } from "../../lib/audit";

export default function MatchAudit({ data = NO_MATCHES }: { data?: Figures }) {
  const available = data.checked > 0 && data.sofix !== null && data.bookmakers !== null;
  const sofix = data.sofix === null ? undefined : (data.sofix * 100).toFixed(1);
  const bookmakers = data.bookmakers === null ? undefined : (data.bookmakers * 100).toFixed(1);
  const gap = available ? Number(sofix) - Number(bookmakers) : 0;
  const lower = gap > 0 ? "Bookmakers" : "Sofix";
  return (
    <section className="au-w au-starts au-result" id="match-results" aria-labelledby="au-matches-h">
      <h2 id="au-matches-h">Match forecasts, checked</h2>
      <p className="au-sub">All saved GWs. How close the predicted win, draw and loss chances were to the results.</p>
      {available ? (
        <>
          <p className="au-error-scale" id="match-error-scale"><strong>Forecast error</strong><span>0 = perfect · 100 = worst</span></p>
          <dl className="au-match-results" aria-label="Match forecast error points" aria-describedby="match-error-scale">
            {[{ name: "Sofix", value: sofix }, { name: "Bookmakers", value: bookmakers }].map(({ name, value }) => (
              <div key={name} data-better={gap !== 0 && lower === name || undefined}>
                <dt>{name}</dt>
                <dd className="au-result-number">{value}<span> / 100</span></dd>
                <dd className="au-error-bar" aria-hidden="true"><i style={{ width: `${value}%` }} /></dd>
                {gap !== 0 && lower === name ? <dd className="au-result-best">Lower error</dd> : null}
              </div>
            ))}
          </dl>
          <p className="au-result-comparison">{gap === 0 ? "Same error at this precision" : `${lower} had ${Math.abs(gap).toFixed(1)} fewer error points`}</p>
        </>
      ) : <p className="au-sub">{data.checked > 0 ? "Statistics await the next update." : "No paired results yet."}</p>}
      <p className="au-result-counts">{data.checked.toLocaleString("en-GB")} {data.checked === 1 ? "match" : "matches"} compared<span aria-hidden="true"> · </span><span>{data.recorded.toLocaleString("en-GB")} forecasts saved</span></p>
      <details className="au-result-method">
        <summary>How this is checked</summary>
        <p>RPS means Ranked Probability Score. It measures error in the home-win, draw and away-win chances saved before kick-off. We multiply it by 100 to show error points: 0 is perfect and 100 is the worst possible error. These are error points, not an accuracy percentage.</p>
        {available ? <p>Original RPS: Sofix {data.sofix!.toFixed(4)} · Bookmakers {data.bookmakers!.toFixed(4)}.</p> : null}
        <p>CSV closing prices come first, then the last available pre-match price. Missing prices or results wait.</p>
        <p>{data.oddsThrough ? `Odds up to ${data.oddsThrough}. Saved prices stay available if a source stops.` : "No odds saved yet."}</p>
      </details>
    </section>
  );
}
