import { formatDay, formatShortKickoff } from "../lib/grid";
import { gameweekMatches, matchOutlook, type Match } from "../lib/matches";
import type { FixtureGrid } from "../lib/types";
import Crest from "./Crest";
import { CardLink } from "./CardLink";

interface Props {
  grid: FixtureGrid;
  column: number;
  onDetails: () => void;
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

/** The next gameweek at a glance: each match's kick-off and win/draw/win odds; games already played get one line. */
export default function GameweekCard({ grid, column, onDetails }: Props) {
  const gameweek = grid.matchdays[column];
  if (!gameweek) return null;
  const { matches } = gameweekMatches(grid, column);
  const upcoming = matches.filter((m) => m.homeCell.status !== "finished");
  const played = matches.filter((m) => m.homeCell.status === "finished" && m.homeCell.result);
  // A gameweek that's finished or mostly played lists every match (results, live and postponed games); otherwise the
  // games still to come, with results played early in one line.
  const done = gameweek.finished || played.length > upcoming.length;
  const rows = done ? matches : upcoming;
  const from = formatDay(gameweek.date_from);
  const to = formatDay(gameweek.date_to);

  return (
    <section className="card bento-card gw-card" aria-labelledby="gw-card-title">
      <header className="bento-head">
        <h2 id="gw-card-title" className="bento-title">Gameweek {gameweek.number}</h2>
        <span className="bento-meta">{from === to ? from : `${from} – ${to}`}</span>
      </header>

      <ol className="gw-matches">
        {rows.map((match) => (
          <MatchRow key={match.fixtureId} match={match} />
        ))}
      </ol>

      {!done && played.length > 0 && (
        <p className="gw-played">
          Played early:{" "}
          {played
            .map((m) => `${m.home.name} ${m.homeCell.result!.goals_for}–${m.homeCell.result!.goals_against} ${m.away.name}`)
            .join(" · ")}
        </p>
      )}

      <CardLink onClick={onDetails}>Match details</CardLink>
    </section>
  );
}

function MatchRow({ match }: { match: Match }) {
  const { home, away, homeCell } = match;
  const outlook = matchOutlook(match);
  const result = homeCell.status === "finished" ? homeCell.result : null;
  const when = homeCell.status === "live" ? "Live" : homeCell.date_confirmed ? formatShortKickoff(homeCell.kickoff_utc) : "TBC";
  const status = homeCell.status === "postponed" ? "Postponed" : null;
  const lead = outlook
    ? outlook.homeWin >= outlook.awayWin
      ? { team: home, chance: outlook.homeWin }
      : { team: away, chance: outlook.awayWin }
    : null;
  const spoken = result
    ? `full time ${home.name} ${result.goals_for}, ${away.name} ${result.goals_against}`
    : outlook
    ? `${home.name} win ${percent(outlook.homeWin)}, draw ${percent(outlook.draw)}, ${away.name} win ${percent(outlook.awayWin)}`
    : status ?? "no forecast";

  return (
    <li className="gw-match">
      <span className={`gw-when ${homeCell.status === "live" ? "live" : ""}`} aria-hidden="true">{when}</span>
      <span className="gw-teams" aria-hidden="true">
        <Crest team={home} size={22} />
        <span className="gw-code">{home.code}</span>
        <span className="gw-v">v</span>
        <span className="gw-code">{away.code}</span>
        <Crest team={away} size={22} />
      </span>
      <span className="gw-odds" aria-hidden="true">
        {result ? (
          <span className="gw-score">FT {result.goals_for}–{result.goals_against}</span>
        ) : outlook ? (
          <>
            <span className="prob">
              <span className="prob-seg home" style={{ flexGrow: outlook.homeWin }} />
              <span className="prob-seg draw" style={{ flexGrow: outlook.draw }} />
              <span className="prob-seg away" style={{ flexGrow: outlook.awayWin }} />
            </span>
            <span className="gw-lead">{lead!.team.name} {percent(lead!.chance)}</span>
          </>
        ) : (
          <span className="gw-lead">{status ?? "No forecast"}</span>
        )}
      </span>
      <span className="visually-hidden">
        {when === "TBC" ? "Date to be confirmed" : when}, {home.name} v {away.name}: {spoken}
      </span>
    </li>
  );
}
