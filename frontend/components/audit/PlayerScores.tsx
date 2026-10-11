"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { PlayerScoreWeek } from "../../lib/audit";
import { scoreColour } from "../../lib/cards";
import { playerSummaries, scoreStats, type ScoreGame } from "../../lib/playerScoreViews";
import SorareImage from "../play/SorareImage";
import Shield from "../lineups/Shield";
import { competitionName } from "../AwayWeek";

const points = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const value = (n: number | null) => n === null ? "—" : points.format(n);
const diff = (n: number | null) => n === null ? "—" : `${n > 0 ? "+" : ""}${points.format(n)}`;
const when = (iso: string | null) => iso ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(iso)) : "Date TBC";
const source = { sofix: "SF", sorare: "SO", form: "L5" };
const sourceName = { sofix: "Sofix model", sorare: "Sorare projection", form: "Last five games" };
type ScoreWeek = Omit<PlayerScoreWeek, "rows"> & { rows: ScoreGame[] };
export type ScoreChoice = { slug: string; number: number | null; gw?: string };

function Scores({ x, sorare, actual, difference, actualLabel, by, averages = false }: {
  x: number | null; sorare: number | null; actual: number | null; difference: number | null; actualLabel?: string; by?: string; averages?: boolean;
}) {
  return <dl className="au-score-values">
    <div><dt>xScore</dt><dd>{value(x)}{by ? <small>{by}</small> : x === null && !averages ? <small>Not saved</small> : null}</dd></div>
    <div><dt>Sorare</dt><dd>{value(sorare)}{sorare === null && !averages ? <small>Not saved</small> : null}</dd></div>
    <div><dt>Actual</dt><dd><b style={actual !== null ? { background: scoreColour(actual).fill, color: scoreColour(actual).ink } : undefined}>{actualLabel ?? value(actual)}</b></dd></div>
    <div><dt>Diff</dt><dd>{diff(difference)}</dd></div>
  </dl>;
}

function Side({ name, crest }: { name: string; crest?: string | null }) {
  return <span className="au-score-side">{crest?.startsWith("https://assets.sorare.com/") || crest?.startsWith("https://frontend-assets.sorare.com/")
    ? <SorareImage src={crest} width={24} height={26} /> : <Shield crest={crest ?? null} code={name.slice(0, 3).toUpperCase()} width={24} />}{name}</span>;
}

function Game({ row }: { row: ScoreGame }) {
  const status = row.state === "pending" ? "Pending" : row.played === false ? "DNP" : row.state === "provisional" ? "Provisional" : "Rechecked";
  const actual = row.state !== "pending" && row.played === true ? row.actual : null;
  return <article className="au-score-row" aria-label={`${row.name}, ${row.home ?? "Team TBC"} vs ${row.away ?? "Opponent TBC"}`}>
    <Link href={`/players/${row.player}`} className="au-score-art" aria-label={`${row.name}: open his page`}><SorareImage src={row.pic} width={96} height={144} />{!row.pic ? <span>Card unavailable</span> : null}</Link>
    <div className="au-score-body">
      <div className="au-score-id"><h3><Link href={`/players/${row.player}`}>{row.name}</Link></h3>
        <p className="au-score-game"><Side name={row.home ?? "Team TBC"} crest={row.homeCrest} /><span className="au-score-vs">vs</span><Side name={row.away ?? "Opponent TBC"} crest={row.awayCrest} /></p>
        <p className="au-score-meta">{when(row.kickoff)}{row.competition ? ` · ${row.competition === "laliga-es" ? "LaLiga" : competitionName(row.competition)}` : ""}</p>
        <p className="au-score-meta"><strong>{status}</strong>{row.started === true ? " · Started" : row.played === true && row.started === false ? " · Came on" : ""}</p>
      </div>
      <Scores x={row.xscore} sorare={row.sorare} actual={actual} actualLabel={row.played === false && row.state !== "pending" ? "DNP" : undefined}
        difference={actual !== null ? row.difference : null} by={row.by && row.xscore !== null ? `${source[row.by]} · ${sourceName[row.by]}` : undefined} />
      <details className="au-score-check"><summary>Check details{row.state === "rechecked" && actual !== null && row.firstScore !== null && row.firstScore !== actual ? ` · Corrected ${value(row.firstScore)} → ${value(actual)}` : ""}</summary>
        <p>{row.state === "pending" ? row.reason : `${row.recheckedAt ? "Rechecked" : "Read"} ${when(row.checkedAt)}`}</p>
        {row.state === "pending" && !row.checkedAt ? <p>First check due {when(row.firstDue)}</p> : null}
        {row.state === "provisional" ? <p>Recheck due {when(row.recheckDue)}{row.reason ? ` · ${row.reason}` : ""}</p> : null}
      </details>
    </div>
  </article>;
}

/** All recorded history is delivered with the page: filters require no extension or extra source read. */
export default function PlayerScores({ week, number, weeks = [], choices = [], selectedSlug = "" }: {
  week: ScoreWeek | null; number: number | null; weeks?: ScoreWeek[]; choices?: ScoreChoice[]; selectedSlug?: string;
}) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const mode = params.get("scores") === "all" ? "all" : params.get("scores") === "summary" ? "summary" : "gw";
  const shown = mode === "gw" ? week ? [week] : [] : weeks;
  const stats = scoreStats(shown.flatMap(w => w.rows));
  const url = (view: string, slug?: string) => {
    const query = new URLSearchParams(params.toString());
    if (view === "gw") query.delete("scores"); else query.set("scores", view);
    if (slug !== undefined) {
      const choice = choices.find(c => c.slug === slug);
      query.delete("w"); query.delete("scoreGw");
      if (choice?.gw) query.set("gw", choice.gw); else query.set("scoreGw", slug);
    }
    return `${pathname}?${query.toString()}#player-scores`;
  };
  return <section className="au-w au-player-scores" id="player-scores" aria-label="Your players, xScore against actual">
    <div className="au-player-head"><div><p className="au-label">Your players · {mode === "gw" ? number !== null ? `GW${number}` : "Selected week" : "All time"}</p><h2>xScore against actual</h2></div>
      <p aria-live="polite">{stats.checked} of {stats.total} player games checked{mode !== "gw" ? <span>{weeks.length} recorded GWs</span> : null}</p></div>
    <div className="au-score-controls"><nav aria-label="Player score view">{([["gw", "Gameweek"], ["all", "All GWs"], ["summary", "Summary"]] as const).map(([id, label]) =>
      <Link key={id} href={url(id)} scroll={false} aria-current={mode === id ? "page" : undefined}>{label}</Link>)}</nav>
      {mode === "gw" && choices.length ? <label>GW<select name="player-gameweek" aria-label="Player gameweek" value={selectedSlug} onChange={e => router.push(url("gw", e.target.value), { scroll: false })}>
        {choices.map(c => <option key={c.slug} value={c.slug}>{c.number !== null ? `GW${c.number}` : c.slug}{weeks.some(w => w.slug === c.slug) ? "" : " · No games saved"}</option>)}
      </select></label> : null}</div>
    {stats.starts > 0 ? <dl className="au-player-summary">
      <div><dt>xScore average miss</dt><dd>{value(stats.xMiss)} <small>pts · {stats.xCases} starts</small></dd></div>
      <div><dt>Sorare average miss</dt><dd>{value(stats.sorareMiss)} <small>pts · {stats.sorareCases} starts</small></dd></div>
      <div><dt>Average diff</dt><dd>{diff(stats.diff)} <small>pts · {stats.xCases} starts</small></dd></div>
    </dl> : <p className="au-player-note">No checked starts yet.</p>}
    <p className="au-player-note">Diff = actual − xScore. Averages use checked starts; forecast samples can differ.{mode === "summary" ? " Player scores below are averages over their recorded history." : " Substitutes and DNPs stay in the list."}</p>
    {mode === "summary" ? playerSummaries(weeks).map(player => <article className="au-score-row" key={player.player} aria-label={`${player.name}, all-time summary`}>
      <Link className="au-score-art" href={`/players/${player.player}`} aria-label={`${player.name}: open his page`}><SorareImage src={player.pic} width={96} height={144} /></Link>
      <div className="au-score-body"><div className="au-score-id"><h3><Link href={`/players/${player.player}`}>{player.name}</Link></h3><p className="au-score-meta">{player.weeks} GWs · {player.stats.checked} of {player.stats.total} games checked</p><p className="au-score-meta">{player.stats.starts} starts · xScore {player.stats.xCases} · Sorare {player.stats.sorareCases}</p></div>
        <Scores x={player.stats.xscore} sorare={player.stats.sorare} actual={player.stats.actual} difference={player.stats.diff} by={player.stats.xCases ? player.sources.map(s => source[s]).join(", ") : undefined} averages />
        <p className="au-score-total">Total diff {diff(player.stats.totalDiff)} pts · Average miss {value(player.stats.xMiss)} pts</p>
      </div></article>) : shown.map(w => <div key={w.slug} className="au-score-week">
        {mode === "all" ? <h3 className="au-score-week-title">GW{w.number ?? "?"}<span>{w.rows.length} player games</span></h3> : null}
        {w.rows.map((row, i) => <Game key={`${row.player}-${row.game}-${i}`} row={row} />)}
      </div>)}
    {stats.total === 0 ? <p className="au-sub" role="status">{mode !== "gw" ? "No player history saved yet." : number === null ? "No Sorare gameweek for the selected week." : "No player games saved for this GW yet. They appear after the next refresh; missing forecasts stay marked as not saved."}</p> : null}
    <details className="au-score-method"><summary>About these checks</summary><p>Saved forecasts stay unchanged. First check at kickoff + 3h, then at + 26h, once Sorare says finished. Automatic half-hourly runs can arrive later. All times Madrid. SF = Sofix, SO = Sorare, L5 = last five games. All time covers the retained recorded GWs.</p></details>
  </section>;
}
