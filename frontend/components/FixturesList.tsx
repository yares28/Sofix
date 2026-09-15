import Link from "next/link";
import { formatDay } from "../lib/grid";
import { gameweekMatches, type Match } from "../lib/matches";
import type { FixtureGrid, GridTeam } from "../lib/types";
import Crest from "./Crest";

interface Props {
  grid: FixtureGrid;
  column: number; // the app-wide gameweek
}

const MADRID = "Europe/Madrid";
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: MADRID, year: "numeric", month: "2-digit", day: "2-digit" });
const dayTitle = new Intl.DateTimeFormat("en-GB", { timeZone: MADRID, weekday: "long", day: "numeric", month: "long" });
const time = new Intl.DateTimeFormat("en-GB", { timeZone: MADRID, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** A plain list of one gameweek's fixtures and results, grouped by day (Madrid time). */
export default function FixturesList({ grid, column }: Props) {
  const gameweek = grid.matchdays[column];
  if (!gameweek) return null;
  const { matches, notPlaying } = gameweekMatches(grid, column);

  // Unconfirmed dates go last under "Date to be confirmed"; the rest by Madrid calendar day.
  const groups = new Map<string, { title: string; matches: Match[] }>();
  for (const match of matches) {
    const kickoff = new Date(match.kickoff);
    const key = match.homeCell.date_confirmed ? dayKey.format(kickoff) : "~tbc";
    const title = match.homeCell.date_confirmed ? dayTitle.format(kickoff) : `Date to be confirmed · weekend of ${formatDay(match.kickoff)}`;
    const group = groups.get(key) ?? { title, matches: [] };
    group.matches.push(match);
    groups.set(key, group);
  }
  const ordered = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, group]) => group);

  return (
    <section className="card fixtures" aria-labelledby="fixtures-title">
      <header className="section-head">
        <div>
          <h2 id="fixtures-title">Gameweek {gameweek.number} fixtures</h2>
          <div className="insight-meta">
            {matches.length} {matches.length === 1 ? "match" : "matches"}
            {notPlaying.length > 0 && ` · no game: ${notPlaying.map((t) => t.name).join(", ")}`}
          </div>
        </div>
      </header>

      {ordered.map((group) => (
        <div key={group.title} className="fixture-day">
          <h3 className="fixture-day-title">{group.title}</h3>
          <ul className="fixture-rows">
            {group.matches.map((match) => (
              <li key={match.fixtureId}>
                <FixtureRow match={match} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function FixtureRow({ match }: { match: Match }) {
  const { home, away, homeCell } = match;
  const result = homeCell.status === "finished" ? homeCell.result : null;
  const middle = result
    ? `${result.goals_for}–${result.goals_against}`
    : homeCell.status === "postponed"
      ? "PPD"
      : homeCell.date_confirmed
        ? time.format(new Date(match.kickoff))
        : "TBC";
  const label = result
    ? `${home.name} ${result.goals_for}, ${away.name} ${result.goals_against}, full time`
    : homeCell.status === "postponed"
      ? `${home.name} v ${away.name}, postponed`
      : `${home.name} v ${away.name}, ${homeCell.date_confirmed ? `kick-off ${middle}` : "time to be confirmed"}`;

  return (
    <div className={`fixture-row ${result ? "played" : ""} ${homeCell.status}`} aria-label={label} role="group">
      <TeamName team={home} side="home" />
      <span className={`fixture-middle ${result ? "score" : "time"}`} aria-hidden="true">
        {homeCell.status === "live" && <span className="live-dot" />}
        {middle}
      </span>
      <TeamName team={away} side="away" />
    </div>
  );
}

function TeamName({ team, side }: { team: GridTeam; side: "home" | "away" }) {
  return (
    <Link href={`/team/${team.code}`} prefetch={false} className={`fixture-team ${side}`}>
      {side === "away" && <Crest team={team} size={24} />}
      <span className="fixture-team-name">{team.name}</span>
      {side === "home" && <Crest team={team} size={24} />}
    </Link>
  );
}
