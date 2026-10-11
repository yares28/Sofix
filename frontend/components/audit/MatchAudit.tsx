import { NO_MATCHES, type MatchAudit as Figures } from "../../lib/audit";

export default function MatchAudit({ data = NO_MATCHES }: { data?: Figures }) {
  const available = data.checked > 0 && data.sofix !== null && data.bookmakers !== null;
  const sofix = data.sofix?.toFixed(4);
  const bookmakers = data.bookmakers?.toFixed(4);
  const gap = available ? Number(sofix) - Number(bookmakers) : 0;
  const lower = gap > 0 ? "Bookmakers" : "Sofix";
  return (
    <section className="au-w au-starts au-result" id="match-results" aria-labelledby="au-matches-h">
      <h2 id="au-matches-h">Match forecasts, checked</h2>
      <p className="au-sub">All saved GWs, on the same finished LaLiga matches. Lower RPS means less forecast error.</p>
      {available ? (
        <>
          <dl className="au-match-results" aria-label="Match forecast error score">
            {[{ name: "Sofix", value: sofix }, { name: "Bookmakers", value: bookmakers }].map(({ name, value }) => (
              <div key={name}>
                <dt>{name} <span>RPS</span></dt>
                <dd className="au-result-number">{value}</dd>
                {gap !== 0 && lower === name ? <dd className="au-result-best">Lower error</dd> : null}
              </div>
            ))}
          </dl>
          <p className="au-result-comparison">{gap === 0 ? "Same error at this precision" : `${lower} lower by ${Math.abs(gap).toFixed(4)} RPS`}</p>
        </>
      ) : <p className="au-sub">{data.checked > 0 ? "Statistics await the next update." : "No paired results yet."}</p>}
      <p className="au-result-counts">{data.checked.toLocaleString("en-GB")} paired {data.checked === 1 ? "result" : "results"}<span aria-hidden="true"> · </span><span>{data.recorded.toLocaleString("en-GB")} forecasts saved</span></p>
      <details className="au-result-method">
        <summary>How this is checked</summary>
        <p>All saved forecasts, fixed before kick-off, are checked against the result. RPS measures error across the home win, draw and away win probabilities.</p>
        <p>CSV closing prices come first, then the last available pre-match price. Missing prices or results wait.</p>
        <p>{data.oddsThrough ? `Odds up to ${data.oddsThrough}. Saved prices stay available if a source stops.` : "No odds saved yet."}</p>
      </details>
    </section>
  );
}
