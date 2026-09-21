import Link from "next/link";
import { decimalOdds, formatDay, formatKickoff } from "../lib/grid";
import { gameweekMatches, matchOutlook, type Match } from "../lib/matches";
import type { CellPrediction, FixtureGrid, GridTeam } from "../lib/types";
import Crest from "./Crest";

interface Props {
  grid: FixtureGrid;
  column: number;
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

/** One gameweek, match by match, with the detail the grid only shows in tooltips (the toolbar steps gameweeks). */
export default function NextGameweek({ grid, column }: Props) {
  const gameweek = grid.matchdays[column];
  if (!gameweek) return null;
  const { matches, notPlaying, doubles } = gameweekMatches(grid, column);
  const dates = formatDay(gameweek.date_from) === formatDay(gameweek.date_to)
    ? formatDay(gameweek.date_from)
    : `${formatDay(gameweek.date_from)} – ${formatDay(gameweek.date_to)}`;

  return (
    <div className="next-gw" aria-labelledby="next-gw-title" role="region">
      <header className="next-gw-head">
        <h2 id="next-gw-title">Gameweek {gameweek.number}</h2>
        <div className="insight-meta">
          {dates} · {matches.length} {matches.length === 1 ? "match" : "matches"}
          {doubles.length > 0 && ` · plays twice: ${doubles.map((t) => t.name).join(", ")}`}
          {notPlaying.length > 0 && ` · no game: ${notPlaying.map((t) => t.name).join(", ")}`}
        </div>
      </header>

      <ol className="match-list">
        {matches.map((match) => (
          <li key={match.fixtureId}>
            <MatchCard match={match} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function MatchCard({ match }: { match: Match }) {
  const { home, away, homeCell, awayCell } = match;
  const hp = homeCell.prediction;
  const ap = awayCell.prediction;
  const outlook = matchOutlook(match);
  const when = homeCell.date_confirmed
    ? formatKickoff(homeCell.kickoff_utc)
    : `Date TBC · weekend of ${formatDay(homeCell.kickoff_utc)}`;
  const result = homeCell.status === "finished" ? homeCell.result : null;

  return (
    <article className="match" aria-label={`${home.name} v ${away.name}`}>
      <div className="match-when">
        <span>{when}</span>
        {homeCell.status === "live" && <span className="match-flag live">Live</span>}
        {homeCell.status === "postponed" && <span className="match-flag">Postponed</span>}
        {homeCell.rescheduled && <span className="match-flag">Moved</span>}
      </div>

      <div className="match-teams">
        <TeamSide team={home} align="home" />
        <div className="match-score" aria-label={result ? `Final score ${result.goals_for}–${result.goals_against}` : undefined}>
          {result ? `${result.goals_for}–${result.goals_against}` : "v"}
        </div>
        <TeamSide team={away} align="away" />
      </div>

      {outlook && hp && ap && (
        <>
          <div className="prob" role="img" aria-label={`${home.name} win ${percent(outlook.homeWin)}, draw ${percent(outlook.draw)}, ${away.name} win ${percent(outlook.awayWin)}`}>
            <span className="prob-seg home" style={{ flexGrow: outlook.homeWin }} />
            <span className="prob-seg draw" style={{ flexGrow: outlook.draw }} />
            <span className="prob-seg away" style={{ flexGrow: outlook.awayWin }} />
          </div>
          <div className="prob-legend" aria-hidden="true">
            <span>{home.code} win {percent(outlook.homeWin)}</span>
            <span>Draw {percent(outlook.draw)}</span>
            <span>{away.code} win {percent(outlook.awayWin)}</span>
          </div>

          <table className="match-stats">
            <caption className="visually-hidden">
              {home.name} and {away.name} forecast
            </caption>
            <thead className="visually-hidden">
              <tr>
                <th scope="col">{home.name}</th>
                <th scope="col">Measure</th>
                <th scope="col">{away.name}</th>
              </tr>
            </thead>
            <tbody>
              <StatRow label="Expected goals" home={hp.xg_for?.toFixed(2)} away={ap.xg_for?.toFixed(2)} better={compare(hp.xg_for, ap.xg_for)} />
              <StatRow label="Clean sheet" home={pct(hp.clean_sheet)} away={pct(ap.clean_sheet)} better={compare(hp.clean_sheet, ap.clean_sheet)} />
              <StatRow label="Expected points" home={hp.expected_points.toFixed(1)} away={ap.expected_points.toFixed(1)} better={compare(hp.expected_points, ap.expected_points)} />
              <tr>
                <td className="stat-home"><DifficultyChip prediction={hp} /></td>
                <th scope="row">Difficulty</th>
                <td className="stat-away"><DifficultyChip prediction={ap} /></td>
              </tr>
              {hp.both_score !== null && hp.both_score !== undefined && (
                <tr className="stat-single">
                  <td colSpan={3}>
                    Both teams to score {percent(hp.both_score)}
                    {homeCell.market && <span className="muted"> · bookmakers {decimalOdds(homeCell.market.both_score)}</span>}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <p className="match-take">{takeaway(match)}</p>
        </>
      )}

    </article>
  );
}

function TeamSide({ team, align }: { team: GridTeam; align: "home" | "away" }) {
  return (
    <Link href={`/team/${team.code}`} prefetch={false} className={`match-team ${align}`}>
      <Crest team={team} size={32} />
      <span className="match-team-name">{team.name}</span>
      <span className="match-venue">{align === "home" ? "Home" : "Away"}</span>
    </Link>
  );
}

function StatRow({ label, home, away, better }: { label: string; home?: string; away?: string; better: -1 | 0 | 1 }) {
  return (
    <tr>
      <td className={`stat-home ${better === -1 ? "better" : ""}`}>{home ?? "—"}</td>
      <th scope="row">{label}</th>
      <td className={`stat-away ${better === 1 ? "better" : ""}`}>{away ?? "—"}</td>
    </tr>
  );
}

function DifficultyChip({ prediction }: { prediction: CellPrediction }) {
  return (
    <span className={`difficulty-chip f${prediction.bucket}`}>
      {Math.round(prediction.difficulty)} {prediction.label}
    </span>
  );
}

const pct = (value: number | null) => (value === null ? undefined : percent(value));

/** -1 when home is higher, 1 when away is, 0 when equal or unknown. */
function compare(home: number | null, away: number | null): -1 | 0 | 1 {
  if (home === null || away === null || Math.abs(home - away) < 1e-9) return 0;
  return home > away ? -1 : 1;
}

/** One plain-language line for picking players from this match. */
function takeaway({ home, away, homeCell, awayCell }: Match): string {
  const hp = homeCell.prediction!;
  const ap = awayCell.prediction!;
  const attack = (hp.xg_for ?? 0) >= (ap.xg_for ?? 0) ? { team: home, xg: hp.xg_for } : { team: away, xg: ap.xg_for };
  const defence = (hp.clean_sheet ?? 0) >= (ap.clean_sheet ?? 0) ? { team: home, cs: hp.clean_sheet } : { team: away, cs: ap.clean_sheet };
  const totalGoals = (hp.xg_for ?? 0) + (ap.xg_for ?? 0);
  const tempo = totalGoals >= 3 ? "Open game" : totalGoals <= 2.2 ? "Tight game" : "Average game";
  return `${tempo} (${totalGoals.toFixed(1)} goals expected). Attackers: ${attack.team.name} (${attack.xg?.toFixed(2) ?? "—"} xG). Clean sheet: ${defence.team.name} (${pct(defence.cs) ?? "—"}).`;
}
