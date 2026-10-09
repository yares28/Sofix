import { NO_MATCHES, type MatchAudit as Figures } from "../../lib/audit";

export default function MatchAudit({ data = NO_MATCHES }: { data?: Figures }) {
  const enough = data.checked >= data.floor && data.sofix !== null && data.bookmakers !== null;
  return (
    <section className="au-w au-starts" aria-labelledby="au-matches-h">
      <h2 id="au-matches-h">Match forecasts, checked</h2>
      <p className="au-sub">Sofix and the bookmakers against the LaLiga result, on the same matches. Each forecast is saved before kick-off.</p>
      {enough ? (
        <div className="au-record">
          <table>
            <caption className="visually-hidden">Match forecast error score</caption>
            <thead><tr><th scope="col">Source</th><th scope="col">RPS</th></tr></thead>
            <tbody>
              <tr><th scope="row">Sofix</th><td>{data.sofix!.toFixed(4)}</td></tr>
              <tr><th scope="row">Bookmakers</th><td>{data.bookmakers!.toFixed(4)}</td></tr>
            </tbody>
          </table>
        </div>
      ) : <p className="au-sub"><b>Too few to tell</b> — {data.checked.toLocaleString("en-GB")} of {data.floor} matches checked.</p>}
      <p className="au-sub">{data.recorded.toLocaleString("en-GB")} forecasts saved. {enough ? `${data.checked.toLocaleString("en-GB")} paired results. ` : ""}RPS measures forecast error; lower is better. CSV closing prices come first, then the last available pre-match price. Missing prices or results wait.</p>
      <p className="au-sub">{data.oddsThrough ? `Odds up to ${data.oddsThrough}. Saved prices stay available if a source stops.` : "No odds saved yet."}</p>
    </section>
  );
}
