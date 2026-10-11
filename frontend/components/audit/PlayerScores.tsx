/* eslint-disable @next/next/no-img-element -- Hot-linked Sorare card art, matching the gallery; no paid image transforms. */
import Link from "next/link";
import type { PlayerScoreWeek } from "../../lib/audit";
import { scoreColour } from "../../lib/cards";

const value = (n: number | null) => n === null ? "—" : n.toFixed(1);
const when = (iso: string | null) => iso ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(iso)) : "Date TBC";
const source = { sofix: "SF", sorare: "SO", form: "L5" };

/** Owned player games, including pending and non-LaLiga games. Small samples remain visible and explicitly counted. */
export default function PlayerScores({ week, number }: { week: PlayerScoreWeek | null; number: number | null }) {
  const summary = week?.summary;
  return <section className="au-w au-player-scores" aria-label="Your players, xScore against actual">
    <div className="au-player-head">
      <div><p className="au-label">Your players {number !== null ? `· GW${number}` : ""}</p><h2>xScore against actual</h2></div>
      {summary ? <p>{summary.checked} of {summary.total} player games checked<br /><span>{summary.rechecked} rechecked the next day</span></p> : null}
    </div>
    <p className="au-sub">First check about an hour after the game, then again the next day. Saved forecasts stay unchanged.</p>
    <p className="au-player-note">Checks use kickoff + 3h and + 26h, once Sorare says finished. Automatic half-hourly runs can arrive later. All times Madrid.</p>
    {summary && summary.starts > 0 ? <><dl className="au-player-summary">
      <div><dt>xScore average miss</dt><dd>{value(summary.xMiss)} <small>pts · {summary.xCases} starts</small></dd></div>
      <div><dt>Sorare average miss</dt><dd>{value(summary.sorareMiss)} <small>pts · {summary.sorareCases} starts</small></dd></div>
    </dl><p className="au-player-note">Early results · starts only; substitutes and DNPs are listed below. Samples can differ where a forecast is missing.</p></> : null}
    {week?.rows.length ? <table className="au-player-table">
      <caption className="visually-hidden">Your players&apos; saved xScore and Sorare projection against their actual score</caption>
      <thead><tr><th scope="col">Player / game</th><th scope="col">xScore</th><th scope="col">Sorare</th><th scope="col">Actual</th><th scope="col" title="Actual minus xScore">+/−</th></tr></thead>
      <tbody>{week.rows.map((row, i) => <tr key={`${row.player}-${row.game}-${i}`}>
        <th scope="row"><div className="au-player-id">
          {row.pic ? <img src={row.pic} alt="" width={36} height={54} loading="lazy" /> : null}
          <div><Link href={`/players/${row.player}`}>{row.name}</Link><span>{row.home ?? "Team TBC"} · {row.away ?? "Opponent TBC"}</span><span>{when(row.kickoff)}{row.started === true ? " · Started" : row.played === false ? " · Did not play" : row.started === false ? " · Came on" : ""}</span>
            <span className={`au-player-state ${row.state}`}>{row.state === "pending" ? "Pending" : row.state === "provisional" ? "Provisional" : "Rechecked"}</span>
            <span>{row.state === "pending" ? row.reason : `${row.recheckedAt ? "Rechecked" : "Read"} ${when(row.checkedAt)}`}</span>
            {row.state === "provisional" ? <span>Recheck due {when(row.recheckDue)}</span> : null}
            {row.state === "provisional" && row.reason ? <span>Recheck pending · {row.reason}</span> : null}
            {row.state === "pending" && !row.checkedAt ? <span>First check due {when(row.firstDue)}</span> : null}
            {row.state === "rechecked" && row.actual !== null && row.firstScore !== null && row.firstScore !== row.actual ? <span className="au-player-correction">Corrected {value(row.firstScore)} → {value(row.actual)}</span> : null}
          </div>
        </div></th>
        <td>{value(row.xscore)}{row.xscore !== null && row.by ? <small title={row.by === "form" ? "Last five games" : row.by === "sorare" ? "Sorare projection" : "Sofix model"}>{source[row.by]}</small> : row.xscore === null ? <small>Not saved</small> : null}</td>
        <td>{value(row.sorare)}</td>
        <td>{row.state === "pending" ? "—" : row.played === false ? "DNP" : row.actual !== null ? <b className="au-player-score" style={{ background: scoreColour(row.actual).fill, color: scoreColour(row.actual).ink }}>{value(row.actual)}</b> : "—"}</td>
        <td>{row.difference === null ? "—" : `${row.difference > 0 ? "+" : ""}${row.difference.toFixed(1)}`}</td>
      </tr>)}</tbody>
    </table> : <p className="au-sub" role="status">{number === null ? "No Sorare gameweek for the selected week." : "No player games saved for this GW yet. They appear after the next refresh; missing forecasts stay marked as not saved."}</p>}
  </section>;
}
