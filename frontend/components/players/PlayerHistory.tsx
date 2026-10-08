import { scoreColour } from "../../lib/cards";
import { absenceText } from "../../lib/absence";
import type { PlayerKind } from "../../lib/lineups";
import { seasonGames, seasonSummary, type PlayerHistory as History } from "../../lib/playerHistory";

const day = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Madrid" }).format(new Date(iso));
const competition = (slug: string) => ({ "laliga-es": "LaLiga", "premier-league-gb": "Premier League", "bundesliga-de": "Bundesliga", "champions-league": "Champions League", "copa-del-rey": "Copa del Rey" }[slug] ?? slug.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "));
function Score({ value, label }: { value: number | null; label: string }) {
  return <div><small>{label}</small><b className="sc-chip" style={value === null ? undefined : { background: scoreColour(value).fill, color: scoreColour(value).ink }}>{value === null ? "—" : Math.round(value)}</b></div>;
}

export default function PlayerHistory({ history, now }: { history: History | null; now: string }) {
  const date = new Date(now);
  const games = seasonGames(history?.games ?? [], date);
  const summary = seasonSummary(games, date);
  const readAt = history?.games.map(g => g.read_at).filter((v): v is string => !!v).sort().at(-1);
  return <>
    <section className="pd-card pd-history" aria-labelledby="saved-games-title">
      <h2 id="saved-games-title">This season <span className="sub">Every saved game</span></h2>
      {!history ? <p className="pd-foot">Saved games could not be read. Try again in a minute.</p> : !games.length ? <p className="pd-foot">No games saved for this season yet. They appear after the daily read.</p> : <>
        <dl className="pd-history-summary">
          <div><dt>Games played</dt><dd>{summary.games}</dd></div>
          <div><dt>Starts</dt><dd>{summary.starts}</dd></div>
          <div><dt>Average score</dt><dd>{summary.average === null ? "—" : summary.average.toFixed(1)} <small>{summary.scored} scored games</small></dd></div>
          <div><dt>LaLiga yellows</dt><dd>{summary.yellowComplete ? "" : "At least "}{summary.yellows}{summary.yellowComplete && summary.yellows % 5 === 4 ? <small>one away from a ban</small> : !summary.yellowComplete ? <small>Some cards not read</small> : null}</dd></div>
          {([ ["Sofix", summary.sofix], ["Sorare", summary.sorare] ] as const).map(([name, value]) => <div key={name}><dt>{name} mean miss</dt><dd>{value ? value.miss.toFixed(1) : "—"}<small>{value ? `${value.n} checked starts` : "No checked starts yet"}</small></dd></div>)}
        </dl>
        <ol className="pd-saved-games" data-long={games.length > 50 ? "true" : undefined}>
          {games.map(g => <li className="pd-saved-game" key={g.game_id}>
            <div className="pd-history-fixture"><small><time dateTime={g.date}>{day(g.date)}</time> · {competition(g.competition)}</small><b>{g.home ?? "Home side not read"} v {g.away ?? "Away side not read"}</b></div>
            <div className="pd-history-appearance"><span>{g.status !== "FINAL" || g.played === null ? "Result not read" : g.started === true ? "Started" : g.played === false ? "Did not play" : g.started === false ? "Came on" : "Start not read"}</span><small>{g.mins === null ? "Minutes not read" : `${g.mins} min`}{g.yellow ? ` · ${g.yellow} yellow` : ""}{g.red ? " · Red card" : ""}{g.yellow === null || g.red === null ? " · Cards not read" : ""}</small></div>
            <div className="pd-history-scores"><Score value={g.status === "FINAL" ? g.score : null} label="Real" /><Score value={g.sofix_x} label="Sofix" /><Score value={g.sorare_x} label="Sorare" /></div>
          </li>)}
        </ol>
        <p className="pd-foot">Latest saved game {day(games[0]!.date)}{readAt ? ` · last read ${day(readAt)}` : ""}. Saved forecasts are scores if he starts; mean miss checks starts only. A missing number means it was not read.</p>
      </>}
    </section>
    <section className="pd-card pd-absences" aria-labelledby="saved-absences-title">
      <h2 id="saved-absences-title">Injuries and suspensions</h2>
      {!history ? <p className="pd-foot">Saved absences could not be read. Try again in a minute.</p> : !history.absences.length ? <p className="pd-foot">No absence spells saved yet. This does not mean he has never been injured.</p> : <>
        <ol>{history.absences.map(a => {
          const text = absenceText({ name: "", kind: a.kind as PlayerKind, cause: a.cause ?? undefined }, null, date);
          return <li key={a.id}><div><b>{a.kind === "out" ? "Out" : a.kind === "doubt" ? "Doubtful" : "Suspended"}</b><span>First seen {day(a.first_seen)} · last seen {day(a.last_seen)}</span></div>{text.cause ? <p>{text.causeFf ? "FF’s words: " : ""}{text.cause}</p> : null}<p>{a.back ? `Returned by ${day(a.back)}` : `Still reported at the last reading, ${day(a.last_seen)}`}</p>{a.url ? <a href={a.url} target="_blank" rel="noreferrer">Futbol Fantasy</a> : <span>Futbol Fantasy</span>}</li>;
        })}</ol>
        <p className="pd-foot">Dates are when Sofix read the report, rather than a medical diagnosis. A failed read leaves the spell open.</p>
      </>}
    </section>
  </>;
}
