import { fixtureDays, type FixtureRow } from "../../lib/home";
import type { FixtureGrid, GridTeam } from "../../lib/types";
import Crest from "../Crest";
import HomeTile from "./HomeTile";

const badge = (team: GridTeam) => ({ code: team.code, color: team.color, crest_url: team.crest_url });
const pct = (p: number) => `${Math.round(p * 100)}%`;

function spoken(row: FixtureRow): string {
  const teams = `${row.home.name} v ${row.away.name}`;
  if (row.score) {
    const given = row.given === null ? "" : `, the board gave that result ${pct(row.given)}${row.shock ? ", a shock" : ""}`;
    return `Full time, ${row.home.name} ${row.score[0]}, ${row.away.name} ${row.score[1]}${given}`;
  }
  if (row.status === "postponed") return `${teams}, postponed`;
  const when = row.when === "TBC" ? "time to be confirmed" : row.when === "Live" ? "live now" : row.when;
  if (!row.chances) return `${when}, ${teams}, no forecast`;
  return `${when}, ${teams}: ${row.home.name} win ${pct(row.chances.home)}, draw ${pct(row.chances.draw)}, ${row.away.name} win ${pct(row.chances.away)}`;
}

function Line({ row }: { row: FixtureRow }) {
  const [h, a] = row.score ?? [0, 0];
  return (
    <li className="hm-fx">
      <span className={`hm-fx-t${row.status === "live" ? " live" : ""}`} aria-hidden="true">
        {row.when}
      </span>
      <span className="hm-teams" aria-hidden="true">
        <Crest team={badge(row.home)} size={16} />
        <span className={row.score && a > h ? "lost" : undefined}>{row.home.code}</span>
        {row.score ? (
          <span className="sc">
            {h}–{a}
          </span>
        ) : (
          <i>v</i>
        )}
        <span className={row.score && h > a ? "lost" : undefined}>{row.away.code}</span>
        <Crest team={badge(row.away)} size={16} />
      </span>
      <span className="hm-odds" aria-hidden="true">
        {row.score ? (
          <em>
            {row.shock && <span className="tag">shock</span>}
            {row.given !== null && <b>{pct(row.given)}</b>}
          </em>
        ) : row.chances && row.lead ? (
          <>
            <span className="bar3">
              <i className="h" style={{ flexGrow: row.chances.home }} />
              <i className="d" style={{ flexGrow: row.chances.draw }} />
              <i className="a" style={{ flexGrow: row.chances.away }} />
            </span>
            <em>
              {row.lead.code} <b>{pct(row.lead.chance)}</b>
            </em>
          </>
        ) : (
          <em>{row.status === "postponed" ? "Postponed" : "No forecast"}</em>
        )}
      </span>
      <span className="visually-hidden">{spoken(row)}</span>
    </li>
  );
}

/** The gameweek by day: kickoff, crests, the win/draw/win bar and the likelier winner; results once played. */
export default function FixturesTile({ grid, column, href }: { grid: FixtureGrid; column: number; href: string }) {
  const days = fixtureDays(grid, column);
  const count = days.reduce((n, day) => n + day.rows.length, 0);
  const played = grid.matchdays[column]?.finished ?? false;
  return (
    <HomeTile id="hm-fixtures" title="Fixtures" meta={played ? "results" : `${count} matches`} href={href} className="hm-fixtures" index={0}>
      {days.length ? (
        <div className="hm-fx-list">
          {days.map((day) => (
            <div key={day.label}>
              <h3 className="hm-day">{day.label}</h3>
              <ul>
                {day.rows.map((row) => (
                  <Line key={row.id} row={row} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="hm-empty">No games this gameweek.</p>
      )}
    </HomeTile>
  );
}
